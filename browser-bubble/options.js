const input    = document.getElementById('api-key');
const btnSave  = document.getElementById('btn-save');
const btnClear = document.getElementById('btn-clear');
const btnShow  = document.getElementById('show-toggle');
const status   = document.getElementById('status');

// Load existing key (masked)
chrome.storage.local.get('apiKey', ({ apiKey }) => {
  if (apiKey) {
    input.value = apiKey;
    showStatus('Key loaded', 'ok');
  }
});

btnSave.addEventListener('click', () => {
  const val = input.value.trim();
  if (!val.startsWith('sk-ant-') && !val.startsWith('sk-')) {
    showStatus('Key should start with sk-ant-…', 'err');
    return;
  }
  chrome.storage.local.set({ apiKey: val }, () => {
    showStatus('Key saved ✓', 'ok');
  });
});

btnClear.addEventListener('click', () => {
  chrome.storage.local.remove('apiKey', () => {
    input.value = '';
    showStatus('Key removed', 'ok');
  });
});

btnShow.addEventListener('click', () => {
  if (input.type === 'password') {
    input.type = 'text';
    btnShow.textContent = 'hide';
  } else {
    input.type = 'password';
    btnShow.textContent = 'show';
  }
});

function showStatus(msg, type) {
  status.textContent = msg;
  status.className = type === 'ok' ? 'status-ok' : 'status-err';
  setTimeout(() => { status.textContent = ''; }, 3000);
}
