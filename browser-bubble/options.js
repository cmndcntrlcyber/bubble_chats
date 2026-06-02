// options.js — Settings page logic

// ── DOM refs ──────────────────────────────────────────────────────────────────

const btnProviderAnthropic  = document.getElementById('btn-provider-anthropic');
const btnProviderOllama     = document.getElementById('btn-provider-ollama');
const btnProviderHF         = document.getElementById('btn-provider-huggingface');
const sectionAnthropic      = document.getElementById('section-anthropic');
const sectionOllama         = document.getElementById('section-ollama');
const sectionHF             = document.getElementById('section-hf');

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

const hfWorkerUrlInput  = document.getElementById('hf-worker-url');
const hfWorkerSecretInput = document.getElementById('hf-worker-secret');
const hfSecretShow      = document.getElementById('hf-secret-show');
const hfChatModelInput  = document.getElementById('hf-chat-model');
const hfSave            = document.getElementById('hf-save');
const hfClear           = document.getElementById('hf-clear');
const hfStatus          = document.getElementById('hf-status');

const btnContextToggle      = document.getElementById('btn-context-toggle');
const contextToggleStatus   = document.getElementById('context-toggle-status');
const contextStatus         = document.getElementById('context-status');

const tavilyInput  = document.getElementById('tavily-key');
const tavilySave   = document.getElementById('tavily-save');
const tavilyClear  = document.getElementById('tavily-clear');
const tavilyShow   = document.getElementById('tavily-show');
const tavilyStatus = document.getElementById('tavily-status');

// ── Provider toggle ───────────────────────────────────────────────────────────

function setProvider(p) {
  const isOllama = p === 'ollama';
  const isHF     = p === 'huggingface';
  btnProviderAnthropic.classList.toggle('active', !isOllama && !isHF);
  btnProviderOllama.classList.toggle('active', isOllama);
  btnProviderHF.classList.toggle('active', isHF);
  sectionAnthropic.classList.toggle('hidden', isOllama || isHF);
  sectionOllama.classList.toggle('hidden', !isOllama);
  sectionHF.classList.toggle('hidden', !isHF);
  chrome.storage.local.set({ provider: p });
}

btnProviderAnthropic.addEventListener('click', () => setProvider('anthropic'));
btnProviderOllama.addEventListener('click',    () => setProvider('ollama'));
btnProviderHF.addEventListener('click',        () => setProvider('huggingface'));

// ── Load stored values ────────────────────────────────────────────────────────

chrome.storage.local.get(
  ['apiKey', 'tavilyKey', 'provider', 'ollamaHost', 'ollamaModel',
   'hfWorkerUrl', 'hfWorkerSecret', 'hfChatModel', 'hfContextEnabled'],
  ({ apiKey, tavilyKey, provider, ollamaHost: storedHost, ollamaModel,
     hfWorkerUrl, hfWorkerSecret, hfChatModel, hfContextEnabled }) => {
    if (apiKey)       { input.value = apiKey; showStatus('Key loaded', 'ok'); }
    if (tavilyKey)    { tavilyInput.value = tavilyKey; showTavilyStatus('Key loaded', 'ok'); }
    if (storedHost)   ollamaHost.value = storedHost;
    if (ollamaModel)  ollamaModelInput.value = ollamaModel;
    if (hfWorkerUrl)    hfWorkerUrlInput.value = hfWorkerUrl;
    if (hfWorkerSecret) hfWorkerSecretInput.value = hfWorkerSecret;
    if (hfChatModel)    hfChatModelInput.value = hfChatModel;
    updateContextToggle(!!hfContextEnabled);
    if (provider === 'ollama')       setProvider('ollama');
    else if (provider === 'huggingface') setProvider('huggingface');
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

// ── HuggingFace / CF Worker handlers ─────────────────────────────────────────

hfSave.addEventListener('click', () => {
  const url    = hfWorkerUrlInput.value.trim();
  const secret = hfWorkerSecretInput.value.trim();
  const model  = hfChatModelInput.value.trim() || 'meta-llama/Llama-3.1-8B-Instruct';
  if (!url)    { showHfStatus('Enter the Worker URL', 'err'); return; }
  if (!secret) { showHfStatus('Enter the shared secret', 'err'); return; }
  chrome.storage.local.set({ hfWorkerUrl: url, hfWorkerSecret: secret, hfChatModel: model }, () => {
    showHfStatus('Saved ✓', 'ok');
  });
});

hfClear.addEventListener('click', () => {
  chrome.storage.local.remove(['hfWorkerUrl', 'hfWorkerSecret', 'hfChatModel'], () => {
    hfWorkerUrlInput.value = '';
    hfWorkerSecretInput.value = '';
    hfChatModelInput.value = '';
    showHfStatus('Reset', 'ok');
  });
});

hfSecretShow.addEventListener('click', () => {
  hfWorkerSecretInput.type = hfWorkerSecretInput.type === 'password' ? 'text' : 'password';
  hfSecretShow.textContent = hfWorkerSecretInput.type === 'password' ? 'show' : 'hide';
});

// ── Contextualizing agent toggle ──────────────────────────────────────────────

function updateContextToggle(enabled) {
  btnContextToggle.textContent = enabled ? 'Disable' : 'Enable';
  contextToggleStatus.textContent = enabled ? 'Enabled' : 'Disabled';
  contextToggleStatus.style.color = enabled ? '#a6e3a1' : '#a6adc8';
}

btnContextToggle.addEventListener('click', () => {
  chrome.storage.local.get('hfContextEnabled', ({ hfContextEnabled }) => {
    const next = !hfContextEnabled;
    chrome.storage.local.set({ hfContextEnabled: next }, () => {
      updateContextToggle(next);
      contextStatus.textContent = next ? 'Context agent enabled' : 'Context agent disabled';
      contextStatus.className = 'status-line status-ok';
      setTimeout(() => { contextStatus.textContent = ''; }, 3000);
    });
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

function showHfStatus(msg, type) {
  hfStatus.textContent = msg;
  hfStatus.className = 'status-line ' + (type === 'ok' ? 'status-ok' : 'status-err');
  setTimeout(() => { hfStatus.textContent = ''; }, 3000);
}
