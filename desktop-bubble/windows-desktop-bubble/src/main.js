// main.js — Windows Desktop Bubble frontend
// Communicates with Tauri Rust backend via window.__TAURI__.core.invoke()

const { invoke } = window.__TAURI__.core;

// ── State ──
let history = [];
let pendingScreenshot = null;
let isStreaming = false;
let currentProvider = 'anthropic'; // updated from keyring on init

// ── DOM refs ──
const chatBox         = document.getElementById('chat-box');
const chatScroll      = document.getElementById('chat-scroll');
const textInput       = document.getElementById('text-input');
const btnSend         = document.getElementById('btn-send');
const btnSS           = document.getElementById('btn-screenshot');
const btnClear        = document.getElementById('btn-clear');
const btnSettings     = document.getElementById('btn-settings');
const ssLabel         = document.getElementById('ss-label');
const modelSelect     = document.getElementById('model-select');
const settingsOverlay = document.getElementById('settings-overlay');
const inpApiKey       = document.getElementById('inp-api-key');
const inpTavilyKey    = document.getElementById('inp-tavily-key');
const inpOllamaHost   = document.getElementById('inp-ollama-host');
const inpOllamaModel  = document.getElementById('inp-ollama-model');
const ollamaModelList = document.getElementById('ollama-model-list');
const btnFetchOllama  = document.getElementById('btn-fetch-ollama');
const btnSaveOllama   = document.getElementById('save-ollama');
const btnProvAnthropic = document.getElementById('btn-prov-anthropic');
const btnProvOllama    = document.getElementById('btn-prov-ollama');
const secAnthropic    = document.getElementById('sec-anthropic');
const secOllama       = document.getElementById('sec-ollama');

// ── Init ──
(async () => {
  addSystemMsg('Ready. Take a screenshot or just ask a question.');
  const [storedApiKey, storedTavily, storedProvider, storedHost, storedModel] = await Promise.all([
    invoke('get_key', { key: 'anthropic_api_key' }).catch(() => ''),
    invoke('get_key', { key: 'tavily_api_key' }).catch(() => ''),
    invoke('get_key', { key: 'provider' }).catch(() => ''),
    invoke('get_key', { key: 'ollama_host' }).catch(() => ''),
    invoke('get_key', { key: 'ollama_model' }).catch(() => ''),
  ]);

  if (storedApiKey)  inpApiKey.value   = storedApiKey;
  if (storedTavily)  inpTavilyKey.value = storedTavily;
  if (storedHost)    inpOllamaHost.value = storedHost;
  if (storedModel)   inpOllamaModel.value = storedModel;
  if (storedProvider === 'ollama') applyProvider('ollama');

  // Update model dropdown if using Ollama
  if (storedProvider === 'ollama' && storedModel) {
    updateModelDropdownOllama(storedModel);
  }
})();

// ── Provider toggle ──
function applyProvider(p) {
  currentProvider = p;
  const isOllama = p === 'ollama';
  btnProvAnthropic.classList.toggle('active', !isOllama);
  btnProvOllama.classList.toggle('active', isOllama);
  secAnthropic.classList.toggle('hidden', isOllama);
  secOllama.classList.toggle('hidden', !isOllama);
}

function updateModelDropdownOllama(modelName) {
  modelSelect.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = modelName;
  opt.textContent = `Ollama — ${modelName}`;
  modelSelect.appendChild(opt);
}

function restoreClaudeModels() {
  const claudeModels = [
    ['claude-haiku-4-5-20251001', 'Haiku 4.5 — fast'],
    ['claude-sonnet-4-6',         'Sonnet 4.6 — balanced'],
    ['claude-opus-4-6',           'Opus 4.6 — powerful'],
  ];
  modelSelect.innerHTML = '';
  claudeModels.forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    modelSelect.appendChild(opt);
  });
}

btnProvAnthropic.addEventListener('click', () => {
  applyProvider('anthropic');
  restoreClaudeModels();
  invoke('store_key', { key: 'provider', value: 'anthropic' });
});
btnProvOllama.addEventListener('click', () => {
  applyProvider('ollama');
  const model = inpOllamaModel.value.trim();
  if (model) updateModelDropdownOllama(model);
  invoke('store_key', { key: 'provider', value: 'ollama' });
});

// ── Message helpers ──
function addSystemMsg(text) {
  const el = document.createElement('div');
  el.className = 'msg-system';
  el.textContent = text;
  chatBox.appendChild(el);
  scrollBottom();
}

function addUserMsg(text) {
  const el = document.createElement('div');
  el.className = 'msg-user';
  el.textContent = text;
  chatBox.appendChild(el);
  scrollBottom();
}

function addAiMsgStart() {
  const el = document.createElement('div');
  el.className = 'msg-ai';
  chatBox.appendChild(el);
  scrollBottom();
  return el;
}

function scrollBottom() {
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

// ── Send ──
async function handleSend() {
  if (isStreaming) return;
  const text = textInput.value.trim();
  if (!text && !pendingScreenshot) return;

  const isOllama = currentProvider === 'ollama';
  const apiKey   = await invoke('get_key', { key: 'anthropic_api_key' }).catch(() => '');

  if (!isOllama && !apiKey) {
    addSystemMsg('No API key — open Settings (⚙) to add your Anthropic key.');
    return;
  }

  const display = text || '(screenshot only)';
  addUserMsg(display);
  textInput.value = '';
  autoResize();

  const content = [];
  if (pendingScreenshot) {
    content.push({
      kind: 'image', text: null,
      source: { kind: 'base64', media_type: 'image/png', data: pendingScreenshot },
    });
    pendingScreenshot = null;
    ssLabel.textContent = 'No screenshot attached';
  }
  if (text) content.push({ kind: 'text', text, source: null });
  if (!content.length) return;

  history.push({ role: 'user', content });

  isStreaming = true;
  btnSend.disabled = true;
  const aiEl = addAiMsgStart();

  try {
    const tavilyKey = await invoke('get_key', { key: 'tavily_api_key' }).catch(() => '');
    let response;

    if (isOllama) {
      const host  = (await invoke('get_key', { key: 'ollama_host' }).catch(() => '')) || 'http://localhost:11434';
      const model = modelSelect.value;
      response = await invoke('send_message_ollama', {
        messages: history,
        model,
        host,
        tavilyKey: tavilyKey || null,
      });
    } else {
      response = await invoke('send_message', {
        messages: history,
        model: modelSelect.value,
        apiKey,
        tavilyKey: tavilyKey || null,
      });
    }

    aiEl.textContent = response;
    history.push({ role: 'assistant', content: [{ kind: 'text', text: response, source: null }] });
  } catch (err) {
    aiEl.className = 'msg-error';
    aiEl.textContent = `Error: ${err}`;
  } finally {
    isStreaming = false;
    btnSend.disabled = false;
    scrollBottom();
  }
}

// ── Screenshot ──
btnSS.addEventListener('click', async () => {
  addSystemMsg('Capturing screen…');
  btnSend.disabled = true;
  try {
    pendingScreenshot = await invoke('screenshot');
    ssLabel.textContent = '✓ Screenshot attached';
    addSystemMsg('Screenshot captured — ask what you need help with.');
  } catch (err) {
    ssLabel.textContent = 'Screenshot failed';
    addSystemMsg(`Could not capture screen: ${err}`);
  } finally {
    btnSend.disabled = false;
  }
});

// ── Clear ──
btnClear.addEventListener('click', () => {
  history = [];
  pendingScreenshot = null;
  ssLabel.textContent = 'No screenshot attached';
  chatBox.innerHTML = '';
  addSystemMsg('Conversation cleared.');
});

// ── Settings ──
btnSettings.addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
document.getElementById('close-settings').addEventListener('click', () => settingsOverlay.classList.add('hidden'));

document.getElementById('save-api-key').addEventListener('click', async () => {
  const val = inpApiKey.value.trim();
  if (val) await invoke('store_key', { key: 'anthropic_api_key', value: val });
});
document.getElementById('clear-api-key').addEventListener('click', async () => {
  await invoke('delete_key', { key: 'anthropic_api_key' });
  inpApiKey.value = '';
});

btnSaveOllama.addEventListener('click', async () => {
  const host  = inpOllamaHost.value.trim() || 'http://localhost:11434';
  const model = inpOllamaModel.value.trim();
  if (!model) return;
  await invoke('store_key', { key: 'ollama_host',  value: host });
  await invoke('store_key', { key: 'ollama_model', value: model });
  updateModelDropdownOllama(model);
});

btnFetchOllama.addEventListener('click', async () => {
  const host = inpOllamaHost.value.trim() || 'http://localhost:11434';
  try {
    btnFetchOllama.textContent = '…';
    const models = await invoke('fetch_ollama_models', { host });
    if (!models.length) return;
    ollamaModelList.innerHTML = '';
    models.forEach(n => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = n;
      ollamaModelList.appendChild(opt);
    });
    ollamaModelList.style.display = '';
    inpOllamaModel.value = models[0];
    ollamaModelList.addEventListener('change', () => { inpOllamaModel.value = ollamaModelList.value; });
  } catch (err) {
    addSystemMsg(`Ollama fetch failed: ${err}`);
  } finally {
    btnFetchOllama.textContent = 'Fetch models';
  }
});

document.getElementById('save-tavily-key').addEventListener('click', async () => {
  const val = inpTavilyKey.value.trim();
  if (val) await invoke('store_key', { key: 'tavily_api_key', value: val });
});
document.getElementById('clear-tavily-key').addEventListener('click', async () => {
  await invoke('delete_key', { key: 'tavily_api_key' });
  inpTavilyKey.value = '';
});

// ── Input events ──
btnSend.addEventListener('click', handleSend);
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
textInput.addEventListener('input', autoResize);

function autoResize() {
  textInput.style.height = 'auto';
  textInput.style.height = Math.min(textInput.scrollHeight, 80) + 'px';
}
