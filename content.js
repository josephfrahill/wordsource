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

  if (!isSingleWord(text)) return;

  lookupAndShow(text, e.pageX, e.pageY);
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
  // Always trigger copy first (works in Google Docs)
  document.execCommand('copy');

  await new Promise(r => setTimeout(r, 50));

  let text = await getClipboardText();

  if (!text) return;

  lookupAndShowWithFeedback(text, { mode: 'fixed' });
}

// -----------------------------
// 🔍 CORE LOGIC
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

    if (!response || response.error) {
      data = { word, origin: 'Unknown' };
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

// -----------------------------
// 🧠 HELPERS
// -----------------------------
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

function showTooltip(wordData, x, y) {
  removeTooltip();

  const tooltip = buildTooltip(wordData);

  tooltip.style.cssText += `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
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
    Latinate: '#E24A4A',
    Greek: '#4AE290',
    Arabic: '#E2C44A',
    Other: '#9B59B6',
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

function removeTooltip() {
  document.getElementById('etymology-tooltip')?.remove();
}
/*
if (chrome.runtime.lastError) {
  showTooltipFixed({
    word: message.word || 'N/A',
    origin: 'Extension reloading...'
  });
  return;
}
  */