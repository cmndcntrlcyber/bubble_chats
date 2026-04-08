// content.js — injected into every page
// Floating AI bubble using Shadow DOM for full style isolation

(function () {
  if (document.getElementById('__ai_bubble_host__')) return;

  // ── Constants ──────────────────────────────────────────────────────────────

  const MODELS = [
    { label: 'Haiku 4.5  — fast',     id: 'claude-haiku-4-5-20251001' },
    { label: 'Sonnet 4.6 — balanced', id: 'claude-sonnet-4-6' },
    { label: 'Opus 4.6   — powerful', id: 'claude-opus-4-6' },
  ];

  const CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :host { all: initial; }

    #bubble {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgb(9, 36, 165);
      border: 2px solid rgba(255,255,255,0.25);
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 4px 20px rgba(9,36,165,0.5);
      transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
      z-index: 2147483647;
      user-select: none;
    }
    #bubble:hover { background: rgb(30, 70, 220); transform: scale(1.05); box-shadow: 0 6px 28px rgba(9,36,165,0.7); }
    #bubble:active { cursor: grabbing; }

    #panel {
      position: fixed;
      bottom: 90px;
      right: 24px;
      width: 400px;
      height: 540px;
      background: rgba(5, 15, 60, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 16px;
      border: 1px solid rgba(9,36,165,0.45);
      box-shadow: 0 8px 40px rgba(0,0,0,0.65);
      display: flex;
      flex-direction: column;
      z-index: 2147483646;
      overflow: hidden;
      font-family: "Inter", "Segoe UI", "Ubuntu", sans-serif;
      font-size: 13px;
      color: #e8eaf6;
    }
    #panel.hidden { display: none; }

    /* Header */
    #header {
      background: rgb(9, 36, 165);
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    #header-icon { font-size: 18px; color: #fff; flex-shrink: 0; }
    #header-title { font-weight: 600; font-size: 13px; color: #fff; flex: 1; }
    #model-select {
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 6px;
      color: #fff;
      font-size: 11px;
      padding: 3px 6px;
      cursor: pointer;
      outline: none;
      max-width: 140px;
    }
    #model-select option { background: #050f3c; color: #e8eaf6; }
    #btn-clear {
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.75);
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    #btn-clear:hover { color: #fff; background: rgba(255,255,255,0.15); }
    #btn-close {
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.75);
      font-size: 15px;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      line-height: 1;
    }
    #btn-close:hover { color: #fff; background: rgba(255,255,255,0.15); }

    /* Chat area */
    #chat {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      scroll-behavior: smooth;
    }
    #chat::-webkit-scrollbar { width: 4px; }
    #chat::-webkit-scrollbar-track { background: transparent; }
    #chat::-webkit-scrollbar-thumb { background: rgba(9,36,165,0.4); border-radius: 2px; }

    .msg-user {
      align-self: flex-end;
      background: rgba(9,36,165,0.3);
      border: 1px solid rgba(9,36,165,0.4);
      border-radius: 12px 12px 4px 12px;
      padding: 8px 12px;
      max-width: 80%;
      word-break: break-word;
      white-space: pre-wrap;
      color: #e8eaf6;
    }
    .msg-ai {
      align-self: flex-start;
      background: rgba(255,255,255,0.05);
      border-left: 3px solid rgb(9, 36, 165);
      border-radius: 0 12px 12px 0;
      padding: 8px 12px;
      max-width: 85%;
      word-break: break-word;
      white-space: pre-wrap;
      line-height: 1.55;
      color: #e8eaf6;
    }
    .msg-system {
      align-self: center;
      color: rgba(255,255,255,0.45);
      font-size: 11px;
      font-style: italic;
      padding: 2px 0;
    }
    .msg-error {
      align-self: flex-start;
      color: #ff8a80;
      font-size: 12px;
      padding: 6px 10px;
      background: rgba(255,100,80,0.1);
      border-radius: 8px;
      max-width: 85%;
    }

    /* Input area */
    #input-area {
      background: rgba(9,36,165,0.12);
      padding: 10px;
      border-top: 1px solid rgba(9,36,165,0.3);
      display: flex;
      flex-direction: column;
      gap: 7px;
      flex-shrink: 0;
    }
    #ss-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #ss-status {
      flex: 1;
      font-size: 11px;
      color: rgba(255,255,255,0.45);
      font-style: italic;
    }
    #ss-status.attached { color: #a6e3a1; font-style: normal; }
    #btn-screenshot {
      background: rgba(9,36,165,0.2);
      border: 1px solid rgba(9,36,165,0.4);
      border-radius: 7px;
      color: #e8eaf6;
      font-size: 12px;
      padding: 5px 10px;
      cursor: pointer;
      white-space: nowrap;
    }
    #btn-screenshot:hover { border-color: rgb(9,36,165); color: #fff; background: rgba(9,36,165,0.35); }
    #send-row {
      display: flex;
      gap: 6px;
    }
    #text-input {
      flex: 1;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(9,36,165,0.4);
      border-radius: 8px;
      color: #e8eaf6;
      font-size: 13px;
      padding: 7px 10px;
      outline: none;
      font-family: inherit;
      resize: none;
      min-height: 36px;
      max-height: 80px;
      line-height: 1.4;
    }
    #text-input:focus { border-color: rgb(9,36,165); box-shadow: 0 0 0 2px rgba(9,36,165,0.25); }
    #text-input::placeholder { color: rgba(255,255,255,0.3); }
    #btn-send {
      background: rgb(9, 36, 165);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      padding: 7px 14px;
      cursor: pointer;
      align-self: flex-end;
      white-space: nowrap;
      transition: background 0.15s;
    }
    #btn-send:hover { background: rgb(30, 70, 220); }
    #btn-send:disabled { background: rgba(9,36,165,0.3); color: rgba(255,255,255,0.4); cursor: default; }
  `;

  // ── DOM ────────────────────────────────────────────────────────────────────

  const host = document.createElement('div');
  host.id = '__ai_bubble_host__';
  host.style.cssText = 'all:unset;position:fixed;z-index:2147483647;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  shadow.appendChild(styleEl);

  // Bubble button
  const bubble = document.createElement('div');
  bubble.id = 'bubble';
  bubble.textContent = '◉';
  shadow.appendChild(bubble);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'panel';
  panel.classList.add('hidden');
  panel.innerHTML = `
    <div id="header">
      <span id="header-icon">◉</span>
      <span id="header-title">AI Bubble</span>
      <select id="model-select"></select>
      <button id="btn-clear">clear</button>
      <button id="btn-close">✕</button>
    </div>
    <div id="chat"></div>
    <div id="input-area">
      <div id="ss-row">
        <span id="ss-status">No screenshot attached</span>
        <button id="btn-screenshot">📷 Screenshot</button>
      </div>
      <div id="send-row">
        <textarea id="text-input" rows="1" placeholder="Ask anything about this page…"></textarea>
        <button id="btn-send">Send</button>
      </div>
    </div>
  `;
  shadow.appendChild(panel);

  // Populate model selector
  const modelSelect = panel.querySelector('#model-select');
  MODELS.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });

  const chat      = panel.querySelector('#chat');
  const textInput = panel.querySelector('#text-input');
  const btnSend   = panel.querySelector('#btn-send');
  const btnSS     = panel.querySelector('#btn-screenshot');
  const ssStatus  = panel.querySelector('#ss-status');

  // ── State ──────────────────────────────────────────────────────────────────

  let port = null;
  let history = [];
  let pendingScreenshot = null;
  let isStreaming = false;
  let currentAIEl = null;
  let accumulated = '';

  // ── Port ───────────────────────────────────────────────────────────────────

  function getPort() {
    if (!port || port._disconnected) {
      port = chrome.runtime.connect({ name: 'ai-bubble' });
      port._disconnected = false;
      port.onDisconnect.addListener(() => { port._disconnected = true; });
      port.onMessage.addListener(onMessage);
    }
    return port;
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'CHUNK':
        accumulated += msg.text;
        if (currentAIEl) currentAIEl.textContent = accumulated;
        scrollBottom();
        break;
      case 'DONE':
        if (accumulated) history.push({ role: 'assistant', content: accumulated });
        isStreaming = false;
        btnSend.disabled = false;
        currentAIEl = null;
        break;
      case 'ERROR':
        addMsg('error', 'Error: ' + msg.error);
        isStreaming = false;
        btnSend.disabled = false;
        currentAIEl = null;
        break;
      case 'NO_KEY':
        addMsg('error', 'No API key set. Click the extension icon to open settings.');
        isStreaming = false;
        btnSend.disabled = false;
        currentAIEl = null;
        break;
      case 'SCREENSHOT_DATA':
        pendingScreenshot = msg.data;
        ssStatus.textContent = '✓ Screenshot attached';
        ssStatus.classList.add('attached');
        addMsg('system', 'Screenshot captured — ask your question.');
        btnSend.disabled = false;
        break;
      case 'SCREENSHOT_ERROR':
        addMsg('error', 'Screenshot failed: ' + msg.error);
        btnSend.disabled = false;
        break;
    }
  }

  // ── Chat helpers ───────────────────────────────────────────────────────────

  function addMsg(type, text) {
    const el = document.createElement('div');
    el.className = 'msg-' + type;
    el.textContent = text;
    chat.appendChild(el);
    scrollBottom();
    return el;
  }

  function scrollBottom() {
    chat.scrollTop = chat.scrollHeight;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function onSend() {
    if (isStreaming) return;
    const text = textInput.value.trim();
    if (!text && !pendingScreenshot) return;

    addMsg('user', text || '(screenshot)');
    textInput.value = '';
    autoResize();

    const content = [];
    if (pendingScreenshot) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: pendingScreenshot },
      });
      pendingScreenshot = null;
      ssStatus.textContent = 'No screenshot attached';
      ssStatus.classList.remove('attached');
    }
    if (text) content.push({ type: 'text', text });

    history.push({ role: 'user', content });
    isStreaming = true;
    btnSend.disabled = true;
    accumulated = '';
    currentAIEl = addMsg('ai', '');

    getPort().postMessage({
      type: 'SEND',
      messages: history,
      model: MODELS[parseInt(modelSelect.value)].id,
    });
  }

  function onScreenshot() {
    if (isStreaming) return;
    btnSend.disabled = true;
    ssStatus.textContent = 'Capturing…';
    ssStatus.classList.remove('attached');
    getPort().postMessage({ type: 'SCREENSHOT' });
  }

  function onClear() {
    history = [];
    pendingScreenshot = null;
    ssStatus.textContent = 'No screenshot attached';
    ssStatus.classList.remove('attached');
    chat.innerHTML = '';
    addMsg('system', 'Conversation cleared.');
  }

  function autoResize() {
    textInput.style.height = 'auto';
    textInput.style.height = Math.min(textInput.scrollHeight, 80) + 'px';
  }

  // ── Bubble drag ────────────────────────────────────────────────────────────

  let dragging = false, ox = 0, oy = 0, didDrag = false;
  let bx = window.innerWidth - 24 - 56;
  let by = window.innerHeight - 24 - 56;

  function applyBubblePos() {
    bubble.style.left  = bx + 'px';
    bubble.style.top   = by + 'px';
    bubble.style.right = 'unset';
    bubble.style.bottom = 'unset';
  }

  function applyPanelPos() {
    const pw = 400, ph = 540, gap = 10;
    let px = bx - pw - gap;
    if (px < 8) px = bx + 56 + gap;
    let py = by - ph / 2 + 28;
    py = Math.max(8, Math.min(py, window.innerHeight - ph - 8));
    panel.style.left   = px + 'px';
    panel.style.top    = py + 'px';
    panel.style.right  = 'unset';
    panel.style.bottom = 'unset';
  }

  bubble.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    didDrag = false;
    ox = e.clientX - bx;
    oy = e.clientY - by;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const nx = e.clientX - ox;
    const ny = e.clientY - oy;
    if (Math.abs(nx - bx) > 3 || Math.abs(ny - by) > 3) didDrag = true;
    bx = Math.max(0, Math.min(nx, window.innerWidth - 56));
    by = Math.max(0, Math.min(ny, window.innerHeight - 56));
    applyBubblePos();
    if (!panel.classList.contains('hidden')) applyPanelPos();
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  bubble.addEventListener('click', () => {
    if (didDrag) { didDrag = false; return; }
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      applyPanelPos();
      if (chat.children.length === 0) addMsg('system', 'Ready. Screenshot or ask anything.');
      textInput.focus();
    }
  });

  // ── Event wiring ───────────────────────────────────────────────────────────

  panel.querySelector('#btn-close').addEventListener('click', () => panel.classList.add('hidden'));
  panel.querySelector('#btn-clear').addEventListener('click', onClear);
  btnSend.addEventListener('click', onSend);
  btnSS.addEventListener('click', onScreenshot);

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  });
  textInput.addEventListener('input', autoResize);

  // Initial position
  applyBubblePos();
})();
