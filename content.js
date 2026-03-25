// content.js
document.addEventListener('mouseup', async (e) => {
  const selectedText = window.getSelection().toString().trim();
  
  if (selectedText && selectedText.split(' ').length === 1) { // Single word only for now
    console.log('Selected:', selectedText);
    
    // Send message to background script
    chrome.runtime.sendMessage(
      { action: 'lookup', word: selectedText.toLowerCase() },
      (response) => {
        if (response) {
          console.log('Result:', response);
          showTooltip(selectedText, response.origin, e.pageX, e.pageY);
        }
      }
    );
  }
});

function showTooltip(word, origin, x, y) {
  // Remove any existing tooltip
  const existing = document.getElementById('etymology-tooltip');
  if (existing) existing.remove();
  
  const tooltip = document.createElement('div');
  tooltip.id = 'etymology-tooltip';
  tooltip.textContent = `${word}: ${origin}`;
  tooltip.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y + 20}px;
    background: #1a1a1a;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;
  
  document.body.appendChild(tooltip);
  
  // Remove tooltip when clicking anywhere
  setTimeout(() => {
    document.addEventListener('click', () => tooltip.remove(), { once: true });
  }, 100);
}