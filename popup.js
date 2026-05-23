const missingCountEl = document.getElementById('missing-count');
const exportBtn      = document.getElementById('export-btn');
const clearBtn       = document.getElementById('clear-btn');
const statusMsg      = document.getElementById('status-msg');

function showStatus(message, type = 'success') {
  statusMsg.textContent = message;
  statusMsg.className = `status ${type}`;
  setTimeout(() => { statusMsg.className = 'status hidden'; }, 3000);
}

function refreshCount() {
  chrome.runtime.sendMessage({ action: 'getMissingCount' }, (res) => {
    missingCountEl.textContent = res?.count ?? '—';
    exportBtn.disabled = !res?.count;
    clearBtn.disabled  = !res?.count;
  });
}

exportBtn.addEventListener('click', () => {
  exportBtn.disabled = true;
  exportBtn.textContent = 'Exporting…';

  chrome.runtime.sendMessage({ action: 'exportMissingWords' }, (res) => {
    exportBtn.disabled = false;
    exportBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Export missing words`;

    if (res?.success) {
      showStatus(`Exported ${res.count} words`, 'success');
    } else {
      showStatus(res?.error || 'Export failed', 'error');
    }
  });
});

clearBtn.addEventListener('click', () => {
  if (!confirm('Clear all tracked missing words?')) return;

  chrome.runtime.sendMessage({ action: 'clearMissingWords' }, (res) => {
    if (res?.success) {
      showStatus('Cleared', 'success');
      refreshCount();
    } else {
      showStatus(res?.error || 'Clear failed', 'error');
    }
  });
});

// Load count on open
refreshCount();