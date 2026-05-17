// content.js

init();

function init() {
  document.addEventListener('mouseup', handleMouseUp);
}

// -----------------------------
// 🖱 AUTO LOOKUP (non-GDocs)
// -----------------------------
function handleMouseUp(e) {
  const text = getSelectionText();

  if (!text) return;

  if (isSingleWord(text)) {
    lookupAndShow(text, e.pageX, e.pageY);
  } else {
    // Multi-word: show breakdown
    lookupAndShowBreakdown(text, e.pageX, e.pageY);
  }
}

// -----------------------------
// ⌨️ KEYBOARD LOOKUP (works everywhere)
// -----------------------------
chrome.runtime.onMessage.addListener((msg) => {
  console.log('Message received:', msg);

  if (msg.action === "lookupSelection") {
    handleManualLookup();
  }
});

async function handleManualLookup() {
  document.execCommand('copy');
  await new Promise(r => setTimeout(r, 50));

  let text = await getClipboardText();
  if (!text) return;

  if (isSingleWord(text)) {
    lookupAndShowWithFeedback(text, { mode: 'fixed' });
  } else {
    lookupAndShowBreakdownFixed(text);
  }
}

// -----------------------------
// 🔍 CORE LOGIC - Single Word
// -----------------------------
function lookupAndShow(word, x, y) {
  safeSendMessage({ action: 'lookup', word }, (response) => {
    if (!response) return;
    showTooltip(response, x, y);
  });
}

function lookupAndShowWithFeedback(word, position = { mode: 'cursor', x: 0, y: 0 }) {
  safeSendMessage({ action: 'lookup', word }, (response) => {
    let data;

    if (!response) {
      data = { word, origin: 'Unknown' };
    } else if (response.error) {
      data = { word, origin: 'not found' };
    } else {
      data = response;
    }

    if (position.mode === 'fixed') {
      showTooltipFixed(data);
    } else {
      showTooltip(data, position.x, position.y);
    }
  });
}

// -----------------------------
// 📊 MULTI-WORD BREAKDOWN
// -----------------------------
async function lookupAndShowBreakdown(text, x, y) {
  const breakdown = await getBreakdown(text);
  showBreakdownTooltip(breakdown, x, y);
}

async function lookupAndShowBreakdownFixed(text) {
  const breakdown = await getBreakdown(text);
  showBreakdownTooltipFixed(breakdown);
}

async function getBreakdown(text) {
  // Extract words (alphanumeric + apostrophes/hyphens)
  const words = text.toLowerCase().match(/[a-z'-]+/g) || [];
  
  if (words.length === 0) {
    return { total: 0, counts: {}, percentages: {} };
  }

  // Lookup all words
  const results = await Promise.all(
    words.map(word => lookupWordPromise(word))
  );

  // Count origins
  const counts = {};
  results.forEach(result => {
    const origin = result.error ? 'Unknown' : result.origin;
    counts[origin] = (counts[origin] || 0) + 1;
  });

  // Calculate percentages
  const total = words.length;
  const percentages = {};
  Object.keys(counts).forEach(origin => {
    percentages[origin] = Math.round((counts[origin] / total) * 100);
  });

  // Sort by percentage (descending)
  const sorted = Object.entries(percentages)
    .sort((a, b) => b[1] - a[1]);

  return {
    total,
    counts,
    percentages,
    sorted
  };
}

function lookupWordPromise(word) {
  return new Promise((resolve) => {
    safeSendMessage({ action: 'lookup', word }, (response) => {
      resolve(response || { word, error: true });
    });
  });
}

// -----------------------------
// 🧠 HELPERS
// -----------------------------
function safeSendMessage(message, callback) {
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Extension context invalidated:', chrome.runtime.lastError.message);
        return;
      }
      callback?.(response);
    });
  } catch (err) {
    console.warn('Message failed:', err);
  }
}

function getSelectionText() {
  try {
    return window.getSelection().toString().trim();
  } catch {
    return '';
  }
}

async function getClipboardText() {
  try {
    document.execCommand('copy');
    await new Promise(r => setTimeout(r, 50));
    return (await navigator.clipboard.readText()).trim();
  } catch {
    return '';
  }
}

function isSingleWord(text) {
  return text && text.split(/\s+/).length === 1;
}

// -----------------------------
// 🎨 TOOLTIP RENDERING
// -----------------------------
function showTooltip(wordData, x, y) {
  removeTooltip();

  const tooltip = buildTooltip(wordData);

  tooltip.style.cssText += `
    position: absolute;
    left: ${x + 5}px;
    top: ${y + 10}px;
    pointer-events: none;
  `;

  document.body.appendChild(tooltip);

  setTimeout(() => {
    document.addEventListener('click', removeTooltip, { once: true });
    document.addEventListener('keydown', removeTooltip, { once: true });
  }, 100);
}

function showTooltipFixed(wordData) {
  removeTooltip();

  const tooltip = buildTooltip(wordData);

  tooltip.style.cssText += `
    position: fixed;
    bottom: 20px;
    right: 20px;
  `;

  tooltip.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  tooltip.style.opacity = '0';
  tooltip.style.transform = 'translateY(10px)';

  requestAnimationFrame(() => {
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';
  });

  document.body.appendChild(tooltip);

  setTimeout(() => {
    document.addEventListener('click', removeTooltip, { once: true });
    document.addEventListener('keydown', removeTooltip, { once: true });
  }, 100);
}

function buildTooltip(wordData) {
  const colors = {
    Germanic: '#4A90E2',
    Latinate: '#9B59B6',
    Greek: '#4AE290',
    Arabic: '#E2C44A',
    Other: '#E24A4A',
    Unknown: '#666'
  };

  const color = colors[wordData.origin] || colors.Other;

  const tooltip = document.createElement('div');
  tooltip.id = 'etymology-tooltip';

  let html = `<strong>${wordData.word}</strong>`;

  if (wordData.base_form && wordData.base_form !== wordData.word) {
    html += ` (← ${wordData.base_form})`;
  }

  html += `: ${wordData.origin}`;

  if (wordData.source_lang) {
    html += `<br><small>from ${wordData.source_lang}`;
    if (wordData.source_word) {
      html += ` <em>${wordData.source_word}</em>`;
    }
    html += `</small>`;
  }

  tooltip.innerHTML = html;

  tooltip.style.cssText = `
    background: ${color};
    color: white;
    padding: 10px 14px;
    border-radius: 8px;
    z-index: 999999;
    font-family: system-ui;
    font-size: 14px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.35);
    max-width: 260px;
    line-height: 1.4;
  `;

  return tooltip;
}

function showBreakdownTooltip(breakdown, x, y) {
  removeTooltip();

  const tooltip = buildBreakdownTooltip(breakdown);

  tooltip.style.cssText += `
    position: absolute;
    left: ${x + 5}px;
    top: ${y + 10}px;
    pointer-events: none;
  `;

  document.body.appendChild(tooltip);

  setTimeout(() => {
    document.addEventListener('click', removeTooltip, { once: true });
    document.addEventListener('keydown', removeTooltip, { once: true });
  }, 100);
}

function showBreakdownTooltipFixed(breakdown) {
  removeTooltip();

  const tooltip = buildBreakdownTooltip(breakdown);

  tooltip.style.cssText += `
    position: fixed;
    bottom: 20px;
    right: 20px;
  `;

  tooltip.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  tooltip.style.opacity = '0';
  tooltip.style.transform = 'translateY(10px)';

  requestAnimationFrame(() => {
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';
  });

  document.body.appendChild(tooltip);

  setTimeout(() => {
    document.addEventListener('click', removeTooltip, { once: true });
    document.addEventListener('keydown', removeTooltip, { once: true });
  }, 100);
}

function buildBreakdownTooltip(breakdown) {
  const colors = {
    Germanic: '#4A90E2',
    Latinate: '#9B59B6',
    Greek: '#4AE290',
    Arabic: '#E2C44A',
    Other: '#E24A4A',
    Unknown: '#666'
  };

  const tooltip = document.createElement('div');
  tooltip.id = 'etymology-tooltip';

  let html = `<strong>Etymology Breakdown</strong><br>`;
  html += `<small>${breakdown.total} words</small><br><br>`;

  breakdown.sorted.forEach(([origin, percentage]) => {
    const color = colors[origin] || colors.Other;
    const count = breakdown.counts[origin];
    
    html += `
      <div style="margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: 500;">${origin}</span>
          <span style="font-size: 16px; font-weight: bold;">${percentage}%</span>
        </div>
        <div style="background: rgba(255,255,255,0.3); border-radius: 10px; height: 6px; overflow: hidden;">
          <div style="background: ${color}; width: ${percentage}%; height: 100%;"></div>
        </div>
        <small style="opacity: 0.8;">${count} word${count !== 1 ? 's' : ''}</small>
      </div>
    `;
  });

  tooltip.innerHTML = html;

  tooltip.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 14px 16px;
    border-radius: 10px;
    z-index: 999999;
    font-family: system-ui;
    font-size: 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    min-width: 240px;
    max-width: 300px;
    line-height: 1.4;
  `;

  return tooltip;
}

function removeTooltip() {
  document.getElementById('etymology-tooltip')?.remove();
}