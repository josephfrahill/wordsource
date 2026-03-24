// content.js - runs on every web page
document.addEventListener('mouseup', () => {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText) {
    console.log('Selected:', selectedText);
    // Show tooltip here
  }
});