// options.js — Settings page logic

// ── DOM refs ──────────────────────────────────────────────────────────────────

const btnProviderAnthropic = document.getElementById('btn-provider-anthropic');
const btnProviderOllama    = document.getElementById('btn-provider-ollama');
const sectionAnthropic     = document.getElementById('section-anthropic');
const sectionOllama        = document.getElementById('section-ollama');

const input       = document.getElementById('api-key');
const btnSave     = document.getElementById('btn-save');
const btnClear    = document.getElementById('btn-clear');
const btnShow     = document.getElementById('show-toggle');
const status      = document.getElementById('status');

const ollamaHost  = document.getElementById('ollama-host');
const ollamaModelInput = document.getElementById('ollama-model-input');
const ollamaModelList  = document.getElementById('ollama-model-list');
const btnFetch    = document.getElementById('btn-fetch-models');
const ollamaSave  = document.getElementById('ollama-save');
const ollamaClear = document.getElementById('ollama-clear');
const ollamaStatus = document.getElementById('ollama-status');

const tavilyInput  = document.getElementById('tavily-key');
const tavilySave   = document.getElementById('tavily-save');
const tavilyClear  = document.getElementById('tavily-clear');
const tavilyShow   = document.getElementById('tavily-show');
const tavilyStatus = document.getElementById('tavily-status');

// ── Provider toggle ───────────────────────────────────────────────────────────

function setProvider(p) {
  const isOllama = p === 'ollama';
  btnProviderAnthropic.classList.toggle('active', !isOllama);
  btnProviderOllama.classList.toggle('active', isOllama);
  sectionAnthropic.classList.toggle('hidden', isOllama);
  sectionOllama.classList.toggle('hidden', !isOllama);
  chrome.storage.local.set({ provider: p });
}

btnProviderAnthropic.addEventListener('click', () => setProvider('anthropic'));
btnProviderOllama.addEventListener('click',    () => setProvider('ollama'));

// ── Load stored values ────────────────────────────────────────────────────────

chrome.storage.local.get(
  ['apiKey', 'tavilyKey', 'provider', 'ollamaHost', 'ollamaModel'],
  ({ apiKey, tavilyKey, provider, ollamaHost: storedHost, ollamaModel }) => {
    if (apiKey)      { input.value = apiKey; showStatus('Key loaded', 'ok'); }
    if (tavilyKey)   { tavilyInput.value = tavilyKey; showTavilyStatus('Key loaded', 'ok'); }
    if (storedHost)  ollamaHost.value = storedHost;
    if (ollamaModel) ollamaModelInput.value = ollamaModel;
    if (provider === 'ollama') setProvider('ollama');
  }
);

// ── Anthropic key handlers ────────────────────────────────────────────────────

btnSave.addEventListener('click', () => {
  const val = input.value.trim();
  if (!val.startsWith('sk-ant-') && !val.startsWith('sk-')) {
    showStatus('Key should start with sk-ant-…', 'err');
    return;
  }
  chrome.storage.local.set({ apiKey: val }, () => showStatus('Key saved ✓', 'ok'));
});

btnClear.addEventListener('click', () => {
  chrome.storage.local.remove('apiKey', () => { input.value = ''; showStatus('Key removed', 'ok'); });
});

btnShow.addEventListener('click', () => {
  input.type = input.type === 'password' ? 'text' : 'password';
  btnShow.textContent = input.type === 'password' ? 'show' : 'hide';
});

// ── Ollama handlers ───────────────────────────────────────────────────────────

btnFetch.addEventListener('click', async () => {
  const host = ollamaHost.value.trim() || 'http://localhost:11434';
  try {
    btnFetch.textContent = '…';
    const res  = await fetch(`${host}/api/tags`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const names = (data.models || []).map(m => m.name);
    if (!names.length) { showOllamaStatus('No models found', 'err'); return; }

    ollamaModelList.innerHTML = '';
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = n;
      ollamaModelList.appendChild(opt);
    });
    ollamaModelList.style.display = '';
    ollamaModelInput.value = names[0];
    ollamaModelList.addEventListener('change', () => {
      ollamaModelInput.value = ollamaModelList.value;
    }, { once: false });
    showOllamaStatus(`${names.length} model(s) fetched`, 'ok');
  } catch (err) {
    showOllamaStatus(`Fetch failed: ${err.message}`, 'err');
  } finally {
    btnFetch.textContent = 'Fetch models';
  }
});

ollamaSave.addEventListener('click', () => {
  const host  = ollamaHost.value.trim() || 'http://localhost:11434';
  const model = ollamaModelInput.value.trim();
  if (!model) { showOllamaStatus('Enter a model name', 'err'); return; }
  chrome.storage.local.set({ ollamaHost: host, ollamaModel: model }, () => {
    showOllamaStatus('Saved ✓', 'ok');
  });
});

ollamaClear.addEventListener('click', () => {
  chrome.storage.local.remove(['ollamaHost', 'ollamaModel'], () => {
    ollamaHost.value = '';
    ollamaModelInput.value = '';
    ollamaModelList.style.display = 'none';
    showOllamaStatus('Reset', 'ok');
  });
});

// ── Tavily key handlers ───────────────────────────────────────────────────────

tavilySave.addEventListener('click', () => {
  const val = tavilyInput.value.trim();
  if (!val) { showTavilyStatus('Enter a key first', 'err'); return; }
  chrome.storage.local.set({ tavilyKey: val }, () => showTavilyStatus('Key saved ✓', 'ok'));
});

tavilyClear.addEventListener('click', () => {
  chrome.storage.local.remove('tavilyKey', () => { tavilyInput.value = ''; showTavilyStatus('Key removed', 'ok'); });
});

tavilyShow.addEventListener('click', () => {
  tavilyInput.type = tavilyInput.type === 'password' ? 'text' : 'password';
  tavilyShow.textContent = tavilyInput.type === 'password' ? 'show' : 'hide';
});

// ── Status helpers ────────────────────────────────────────────────────────────

function showStatus(msg, type) {
  status.textContent = msg;
  status.className = 'status-line ' + (type === 'ok' ? 'status-ok' : 'status-err');
  setTimeout(() => { status.textContent = ''; }, 3000);
}

function showOllamaStatus(msg, type) {
  ollamaStatus.textContent = msg;
  ollamaStatus.className = 'status-line ' + (type === 'ok' ? 'status-ok' : 'status-err');
  setTimeout(() => { ollamaStatus.textContent = ''; }, 3000);
}

function showTavilyStatus(msg, type) {
  tavilyStatus.textContent = msg;
  tavilyStatus.className = 'status-line ' + (type === 'ok' ? 'status-ok' : 'status-err');
  setTimeout(() => { tavilyStatus.textContent = ''; }, 3000);
}
