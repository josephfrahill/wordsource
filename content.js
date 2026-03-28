// content.js - More debug logging

console.log('Etymology extension content script loaded');
console.log('Frame:', window.location.href);
console.log('Is top frame:', window === window.top);

if (window !== window.top) {
  //console.log('Running in iframe, skipping initialization');
   throw new Error('Not top frame — aborting');
} else {
  const isGoogleDocs = window.location.hostname === 'docs.google.com' && 
                       window.location.pathname.includes('/document/');

  console.log('Is Google Docs:', isGoogleDocs);

  if (isGoogleDocs) {
    console.log('Initializing Google Docs handler');
    initGoogleDocsHandler();
  } else {
    console.log('Initializing standard handler');
    initStandardHandler();
  }
}

function initStandardHandler() {
  document.addEventListener('mouseup', (e) => {
    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText && selectedText.split(' ').length === 1) {
      chrome.runtime.sendMessage(
        { action: 'lookup', word: selectedText },
        (response) => {
          if (chrome.runtime.lastError) return;
          
          if (response && !response.error) {
            showTooltip(response, e.pageX, e.pageY);
          } else {
            showTooltip({ word: selectedText, origin: 'Unknown' }, e.pageX, e.pageY);
          }
        }
      );
    }
  });
}

/*
function initGoogleDocsHandler() {
  console.log('Waiting for Google Docs iframe...');
  
  let attempts = 0;
  const findIframe = setInterval(() => {
    attempts++;
    console.log(`Looking for iframe... attempt ${attempts}`);
    
    // Try different selectors
    let iframe = document.querySelector('iframe.docs-texteventtarget-iframe');
    
    if (!iframe) {
      console.log('docs-texteventtarget-iframe not found, trying alternatives...');
      iframe = document.querySelector('.docs-texteventtarget-iframe');
    }
    
    if (!iframe) {
      // Try any iframe that looks like it might be the editor
      const iframes = document.querySelectorAll('iframe');
      console.log(`Found ${iframes.length} iframes total`);
      iframes.forEach((f, i) => {
        console.log(`Iframe ${i}: class="${f.className}", src="${f.src}"`);
      });
      
      // Look for iframe with empty src (usually the editor)
      iframe = Array.from(iframes).find(f => f.src === '' || f.src === 'about:blank');
    }
    
    if (iframe) {
      console.log('Found potential iframe:', iframe);
      
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        
        if (iframeDoc) {
          clearInterval(findIframe);
          console.log('✓ Successfully accessed iframe document, attaching listeners');
          attachListenersToIframe(iframe, iframeDoc);
        } else {
          console.log('Cannot access iframe document (might be cross-origin)');
        }
      } catch (e) {
        console.error('Error accessing iframe:', e);
      }
    } else {
      console.log('No suitable iframe found yet');
    }
    
    // Give up after 20 attempts (10 seconds)
    if (attempts > 20) {
      clearInterval(findIframe);
      console.log('❌ Giving up on finding Google Docs iframe');
    }
  }, 500);
}

*/

function initGoogleDocsHandler() {
  console.log('Using NEW Google Docs strategy');

  document.addEventListener('selectionchange', () => {
    const active = document.activeElement;

    if (!active) return;

    let selectedText = '';

    try {
      // Try standard selection first
      selectedText = document.getSelection().toString().trim();

      // Fallback: check inside active element
      if (!selectedText && active.tagName === 'IFRAME') {
        const iframeDoc = active.contentDocument;
        if (iframeDoc) {
          selectedText = iframeDoc.getSelection().toString().trim();
        }
      }
    } catch (e) {
      console.log('Selection read error:', e);
    }

    if (selectedText && selectedText.split(/\s+/).length === 1) {
      console.log('Docs selection detected:', selectedText);

      chrome.runtime.sendMessage(
        { action: 'lookup', word: selectedText },
        (response) => {
          if (!response) return;

          // Position in center (Docs makes positioning hard)
          const x = window.innerWidth / 2;
          const y = 100;

          showTooltip(response, x, y);
        }
      );
    }
  });
}

function attachListenersToIframe(iframe, iframeDoc) {
  console.log('Attaching event listeners to iframe document');
  
  iframeDoc.addEventListener('mouseup', (e) => {
    console.log('✓ Iframe mouseup event fired!');
    
    setTimeout(() => {
      const selection = iframeDoc.getSelection();
      console.log('Selection object:', selection);
      
      const selectedText = selection ? selection.toString().trim() : '';
      console.log('Selected text:', selectedText);
      
      if (selectedText && selectedText.split(/\s+/).length === 1) {
        const iframeRect = iframe.getBoundingClientRect();
        const x = e.clientX + iframeRect.left + window.scrollX;
        const y = e.clientY + iframeRect.top + window.scrollY + 20;
        
        console.log('Position:', x, y);
        console.log('Looking up:', selectedText);
        
        chrome.runtime.sendMessage(
          { action: 'lookup', word: selectedText },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('Runtime error:', chrome.runtime.lastError);
              return;
            }
            
            console.log('Got response:', response);
            
            if (response && !response.error) {
              showTooltip(response, x, y);
            } else {
              showTooltip({ word: selectedText, origin: 'Unknown' }, x, y);
            }
          }
        );
      } else {
        console.log('No single word selected');
        removeTooltip();
      }
    }, 50);
  });
  
  // Also try dblclick
  iframeDoc.addEventListener('dblclick', (e) => {
    console.log('✓ Iframe double-click fired!');
    
    setTimeout(() => {
      const selection = iframeDoc.getSelection();
      const selectedText = selection ? selection.toString().trim() : '';
      
      console.log('Double-click selection:', selectedText);
      
      if (selectedText && selectedText.split(/\s+/).length === 1) {
        const iframeRect = iframe.getBoundingClientRect();
        const x = e.clientX + iframeRect.left + window.scrollX;
        const y = e.clientY + iframeRect.top + window.scrollY + 20;
        
        chrome.runtime.sendMessage(
          { action: 'lookup', word: selectedText },
          (response) => {
            if (chrome.runtime.lastError) return;
            
            if (response && !response.error) {
              showTooltip(response, x, y);
            } else {
              showTooltip({ word: selectedText, origin: 'Unknown' }, x, y);
            }
          }
        );
      }
    }, 50);
  });
  
  console.log('✓ Event listeners attached successfully');
}

function removeTooltip() {
  const existing = document.getElementById('etymology-tooltip');
  if (existing) {
    existing.remove();
  }
}

function showTooltip(wordData, x, y) {
  console.log('showTooltip called:', wordData, 'at', x, y);
  
  removeTooltip();
  
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
  
  let html = `<strong>${wordData.word}</strong>`;
  
  if (wordData.base_form && wordData.base_form !== wordData.word) {
    html += ` (← ${wordData.base_form})`;
  }
  
  html += `: ${wordData.origin}`;
  
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
    top: ${y}px;
    background: ${color};
    color: white;
    padding: 10px 14px;
    border-radius: 6px;
    z-index: 999999;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    line-height: 1.4;
    pointer-events: none;
  `;
  
  document.body.appendChild(tooltip);
  console.log('Tooltip added to DOM');
  
  setTimeout(() => {
    document.addEventListener('click', removeTooltip, { once: true });
    document.addEventListener('keydown', removeTooltip, { once: true });
  }, 100);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "lookupSelection") {
    handleDocsLookup();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'x') {
    handleDocsLookup();
  }
});

async function handleDocsLookup() {
  let selectedText = await getSelectedTextViaClipboard();

  console.log('Clipboard selection:', selectedText);

  if (!selectedText) {
    console.log('❌ Still no selection');
    return;
  }

  // Only single word
  if (selectedText.split(/\s+/).length !== 1) return;

  chrome.runtime.sendMessage(
    { action: "lookup", word: selectedText },
    (response) => {
      if (!response) return;

      showTooltip(response, window.innerWidth / 2, 120);
    }
  );
}


async function getSelectedTextViaClipboard() {
  try {
    // Ensure focus
    window.focus();
    document.body.focus();

    // Trigger copy
    document.execCommand('copy');

    await new Promise(r => setTimeout(r, 50));

    const text = await navigator.clipboard.readText();

    return text.trim();
  } catch (e) {
    console.error('Clipboard read failed:', e);
    return '';
  }
}


/*
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "lookupAndShow") {
    chrome.runtime.sendMessage(
      { action: "lookup", word: msg.word },
      (response) => {
        if (!response) return;

        const selection = window.getSelection();
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;

        if (selection.rangeCount > 0) {
          const rect = selection.getRangeAt(0).getBoundingClientRect();
          x = rect.left + window.scrollX;
          y = rect.bottom + window.scrollY;
        }

        showTooltip(response, x, y);
      }
    );
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "triggerLookup") {
    const selection = document.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (!text || text.split(/\s+/).length !== 1) return;

    chrome.runtime.sendMessage(
      { action: 'lookup', word: text },
      (response) => {
        if (!response) return;

        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;

        if (selection.rangeCount > 0) {
          const rect = selection.getRangeAt(0).getBoundingClientRect();
          x = rect.left + window.scrollX;
          y = rect.bottom + window.scrollY;
        }

        showTooltip(response, x, y);
      }
    );
  }
});
*/