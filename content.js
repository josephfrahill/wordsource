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
  let text = getSelectionText();

  // Fallback → clipboard (for Google Docs)
  if (!text) {
    text = await getClipboardText();
  }

  if (!isSingleWord(text)) return;

  lookupAndShow(text, window.innerWidth / 2, 120);
}

// -----------------------------
// 🔍 CORE LOGIC
// -----------------------------
function lookupAndShow(word, x, y) {
  chrome.runtime.sendMessage(
    { action: 'lookup', word },
    (response) => {
      if (!response) return;

      showTooltip(response, x, y);
    }
  );
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

// -----------------------------
// 💬 TOOLTIP
// -----------------------------
function showTooltip(wordData, x, y) {
  removeTooltip();

  const colors = {
    Germanic: '#4A90E2',
    Latinate: '#E24A4A',
    Greek: '#4AE290',
    Arabic: '#E2C44A',
    Other: '#9B59B6'
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
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    background: ${color};
    color: white;
    padding: 10px 14px;
    border-radius: 6px;
    z-index: 999999;
    font-family: system-ui;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: none;
  `;

  document.body.appendChild(tooltip);

  setTimeout(() => {
    document.addEventListener('click', removeTooltip, { once: true });
    document.addEventListener('keydown', removeTooltip, { once: true });
  }, 100);
}

function removeTooltip() {
  document.getElementById('etymology-tooltip')?.remove();
}