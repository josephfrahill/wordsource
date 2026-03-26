// content.js
document.addEventListener('mouseup', async (e) => {
  const selectedText = window.getSelection().toString().trim();
  
  if (selectedText && selectedText.split(' ').length === 1) {
    try {
      chrome.runtime.sendMessage(
        { action: 'lookup', word: selectedText },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Extension context invalidated:', chrome.runtime.lastError);
            return;
          }
          
          if (response && !response.error) {
            showTooltip(response, e.pageX, e.pageY);
          } else {
            showTooltip({ word: selectedText, origin: 'Unknown' }, e.pageX, e.pageY);
          }
        }
      );
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }
});

function showTooltip(wordData, x, y) {
  const existing = document.getElementById('etymology-tooltip');
  if (existing) existing.remove();
  
  const colors = {
    'Germanic': '#4A90E2',
    'Latinate': '#E24A4A',
    'Greek': '#4AE290',
    'Arabic': '#E2C44A',
    'Other': '#9B59B6'
  };
  
  const color = colors[wordData.origin] || colors.Other;
  
  const tooltip = document.createElement('div');
  tooltip.id = 'etymology-tooltip';
  
  let html = `<strong>${wordData.word}</strong>: ${wordData.origin}`;
  
  // Show "from [language] [source_word]"
  if (wordData.source_lang) {
    html += `<br><small>from ${wordData.source_lang}`;
    if (wordData.source_word && wordData.source_word.trim() !== '') {
      html += ` <em>${wordData.source_word}</em>`;
    }
    html += `</small>`;
  }
  
  tooltip.innerHTML = html;
  tooltip.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y + 20}px;
    background: ${color};
    color: white;
    padding: 10px 14px;
    border-radius: 6px;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    line-height: 1.4;
  `;
  
  document.body.appendChild(tooltip);
  
  setTimeout(() => {
    document.addEventListener('click', () => tooltip.remove(), { once: true });
  }, 100);
}