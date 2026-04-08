/**
 * website-bubble — drop-in AI chat widget
 *
 * Configure before loading:
 *   <script>
 *   window.BUBBLE_CONFIG = {
 *     title:           'My Assistant',       // panel header title
 *     icon:            '⬡',                  // bubble + header icon
 *     accent:          'rgb(9, 36, 165)',     // primary brand colour
 *     accentHover:     'rgb(30, 70, 220)',    // hover shade
 *     chatEndpoint:    '/api/chat',           // SSE chat endpoint
 *     contactEndpoint: '/api/contact',        // contact form POST endpoint
 *     welcomeMsg:      'Hello! How can I help you today?',
 *     tavilyKey:       '',                   // Tavily API key (optional)
 *   };
 *   </script>
 *   <script src="/js/bubble.js"></script>
 */
(function () {
  'use strict';

  if (document.getElementById('__bubble_host__')) return;

  // ── Config ──────────────────────────────────────────────────────────────────

  const CFG = window.BUBBLE_CONFIG || {};
  const TITLE            = CFG.title            || 'Assistant';
  const ICON             = CFG.icon             || '⬡';
  const ACCENT           = CFG.accent           || 'rgb(9, 36, 165)';
  const ACCENT_HOVER     = CFG.accentHover      || 'rgb(30, 70, 220)';
  const CHAT_ENDPOINT    = CFG.chatEndpoint     || '/api/chat';
  const CONTACT_ENDPOINT = CFG.contactEndpoint  || '/api/contact';
  const WELCOME_MSG      = CFG.welcomeMsg       || 'Hello! How can I help you today?';
  const TAVILY_KEY       = CFG.tavilyKey        || '';

  // ── Constants ────────────────────────────────────────────────────────────────

  const BUBBLE_SIZE  = 56;
  const PANEL_WIDTH  = 400;
  const PANEL_HEIGHT = 520;
  const MAX_HISTORY  = 20;

  const CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :host { all: initial; }

    #bubble {
      position: fixed;
      width: ${BUBBLE_SIZE}px; height: ${BUBBLE_SIZE}px;
      border-radius: 50%; background: ${ACCENT};
      border: 2px solid rgba(255,255,255,0.25); cursor: grab;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; color: #fff;
      box-shadow: 0 4px 20px rgba(0,0,0,0.35);
      transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
      z-index: 9999; user-select: none;
    }
    #bubble:hover { background: ${ACCENT_HOVER}; transform: scale(1.05); }
    #bubble:active { cursor: grabbing; }

    #panel {
      position: fixed; width: ${PANEL_WIDTH}px; height: ${PANEL_HEIGHT}px;
      background: rgba(5,15,60,0.95); backdrop-filter: blur(12px);
      border-radius: 14px; border: 1px solid rgba(9,36,165,0.45);
      box-shadow: 0 8px 40px rgba(0,0,0,0.65);
      display: flex; flex-direction: column; z-index: 9998; overflow: hidden;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      font-size: 13px; color: #e8eaf6;
    }
    #panel.hidden { display: none; }

    #header {
      background: ${ACCENT}; padding: 10px 12px;
      display: flex; align-items: center; gap: 8px; flex-shrink: 0;
    }
    #header-icon { font-size: 18px; color: #fff; flex-shrink: 0; }
    #header-title { font-weight: 600; font-size: 13px; color: #fff; flex: 1; letter-spacing: 0.3px; }
    #btn-clear {
      background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px; color: rgba(255,255,255,0.85); font-size: 11px;
      padding: 3px 8px; cursor: pointer;
    }
    #btn-clear:hover { background: rgba(255,255,255,0.25); color: #fff; }
    #btn-close {
      background: transparent; border: none; color: rgba(255,255,255,0.75);
      font-size: 16px; padding: 2px 6px; border-radius: 4px; cursor: pointer; line-height: 1;
    }
    #btn-close:hover { color: #fff; background: rgba(255,255,255,0.15); }

    #chat {
      flex: 1; overflow-y: auto; padding: 10px;
      display: flex; flex-direction: column; gap: 6px; scroll-behavior: smooth;
    }
    #chat::-webkit-scrollbar { width: 4px; }
    #chat::-webkit-scrollbar-thumb { background: rgba(9,36,165,0.4); border-radius: 2px; }

    .msg-user {
      align-self: flex-end; background: rgba(9,36,165,0.3);
      border: 1px solid rgba(9,36,165,0.4); border-radius: 12px 12px 4px 12px;
      padding: 8px 12px; max-width: 80%; word-break: break-word; white-space: pre-wrap;
    }
    .msg-ai {
      align-self: flex-start; background: rgba(255,255,255,0.05);
      border-left: 3px solid ${ACCENT}; border-radius: 0 12px 12px 0;
      padding: 8px 12px; max-width: 85%; word-break: break-word;
      white-space: pre-wrap; line-height: 1.55;
    }
    .msg-system {
      align-self: center; color: rgba(255,255,255,0.45);
      font-size: 11px; font-style: italic; padding: 2px 0;
    }
    .msg-error {
      align-self: flex-start; color: #ff8a80; font-size: 12px;
      padding: 6px 10px; background: rgba(255,100,80,0.1); border-radius: 8px; max-width: 85%;
    }

    #input-area {
      background: rgba(9,36,165,0.12); border-top: 1px solid rgba(9,36,165,0.3);
      padding: 10px; display: flex; flex-direction: column; gap: 7px; flex-shrink: 0;
    }
    #input-row { display: flex; gap: 7px; align-items: flex-end; }
    #text-input {
      flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(9,36,165,0.4);
      border-radius: 8px; color: #e8eaf6; font-size: 13px; font-family: inherit;
      padding: 8px 10px; outline: none; resize: none; min-height: 36px; max-height: 120px; line-height: 1.4;
    }
    #text-input:focus { border-color: ${ACCENT}; box-shadow: 0 0 0 2px rgba(9,36,165,0.25); }
    #text-input::placeholder { color: rgba(255,255,255,0.3); }
    #btn-send {
      background: ${ACCENT}; border: none; border-radius: 8px; color: #fff;
      font-weight: 700; font-size: 13px; font-family: inherit;
      padding: 8px 14px; cursor: pointer; white-space: nowrap; transition: background 0.15s;
    }
    #btn-send:hover { background: ${ACCENT_HOVER}; }
    #btn-send:disabled { background: rgba(9,36,165,0.3); color: rgba(255,255,255,0.4); cursor: default; }

    /* Contact overlay */
    #contact-overlay {
      background: rgba(9,36,165,0.18); border: 1px solid rgba(9,36,165,0.4);
      border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;
    }
    #contact-overlay .co-title { font-size: 12px; color: #e8eaf6; }
    #contact-overlay .co-row { display: flex; gap: 6px; }
    #contact-overlay input {
      flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(9,36,165,0.4);
      border-radius: 5px; color: #e8eaf6; font-size: 12px; font-family: inherit;
      padding: 5px 8px; outline: none; min-width: 0;
    }
    #contact-overlay input:focus { border-color: ${ACCENT}; }
    #contact-overlay input::placeholder { color: rgba(255,255,255,0.3); }
    #contact-overlay .co-btns { display: flex; gap: 6px; margin-top: 2px; }
    #btn-co-send {
      background: ${ACCENT}; border: none; border-radius: 5px;
      color: #fff; font-size: 12px; font-weight: 700; font-family: inherit;
      padding: 5px 12px; cursor: pointer; transition: background 0.15s;
    }
    #btn-co-send:hover { background: ${ACCENT_HOVER}; }
    #btn-co-send:disabled { background: rgba(9,36,165,0.3); color: rgba(255,255,255,0.4); cursor: default; }
    #btn-co-dismiss {
      background: transparent; border: 1px solid rgba(255,255,255,0.2);
      border-radius: 5px; color: rgba(255,255,255,0.55); font-size: 12px;
      font-family: inherit; padding: 5px 10px; cursor: pointer;
    }
    #btn-co-dismiss:hover { color: #fff; border-color: rgba(255,255,255,0.4); }
  `;

  // ── Shadow DOM ───────────────────────────────────────────────────────────────

  const host = document.createElement('div');
  host.id = '__bubble_host__';
  host.style.cssText = 'all:unset;position:fixed;z-index:9999;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  shadow.appendChild(styleEl);

  const bubble = document.createElement('div');
  bubble.id = 'bubble';
  bubble.textContent = ICON;
  shadow.appendChild(bubble);

  const panel = document.createElement('div');
  panel.id = 'panel';
  panel.classList.add('hidden');
  shadow.appendChild(panel);

  panel.innerHTML = `
    <div id="header">
      <span id="header-icon">${ICON}</span>
      <span id="header-title">${TITLE}</span>
      <button id="btn-clear">clear</button>
      <button id="btn-close">✕</button>
    </div>
    <div id="chat"></div>
    <div id="input-area">
      <div id="input-row">
        <textarea id="text-input" rows="1" placeholder="Ask a question…"></textarea>
        <button id="btn-send">Send</button>
      </div>
    </div>
  `;

  const chat      = shadow.getElementById('chat');
  const inputArea = shadow.getElementById('input-area');
  const textInput = shadow.getElementById('text-input');
  const btnSend   = shadow.getElementById('btn-send');

  // ── State ────────────────────────────────────────────────────────────────────

  let history     = [];
  let isStreaming = false;
  let currentAIEl = null;
  let accumulated = '';

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function addMsg(type, text) {
    const el = document.createElement('div');
    el.className = 'msg-' + type;
    el.textContent = text;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function autoResize() {
    textInput.style.height = 'auto';
    textInput.style.height = Math.min(textInput.scrollHeight, 120) + 'px';
  }

  // ── Send / streaming ─────────────────────────────────────────────────────────

  async function onSend() {
    if (isStreaming) return;
    const text = textInput.value.trim();
    if (!text) return;

    addMsg('user', text);
    textInput.value = '';
    autoResize();
    history.push({ role: 'user', content: text });

    isStreaming = true; btnSend.disabled = true;
    accumulated = ''; currentAIEl = addMsg('ai', '');

    try {
      const resp = await fetch(CHAT_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || resp.statusText);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === 'error') throw new Error(evt.message);
            if (evt.type === 'content_block_delta' && evt.delta?.text) {
              accumulated += evt.delta.text;
              currentAIEl.textContent = accumulated;
              chat.scrollTop = chat.scrollHeight;
            }
          } catch (pe) {
            if (pe.message !== 'Unexpected end of JSON input') throw pe;
          }
        }
      }

      if (accumulated) {
        const match   = accumulated.match(/\[SERVICE_INTEREST:\s*([^\]]+)\]/);
        const cleaned = accumulated.replace(/\[SERVICE_INTEREST:[^\]]+\]\s*/g, '').trim();
        currentAIEl.textContent = cleaned;
        history.push({ role: 'assistant', content: cleaned });
        if (match) onServiceInterest(match[1].trim());
      }

    } catch (err) {
      if (currentAIEl && !currentAIEl.textContent) {
        currentAIEl.className = 'msg-error';
        currentAIEl.textContent = 'Error: ' + err.message;
      } else {
        addMsg('error', 'Error: ' + err.message);
      }
    } finally {
      isStreaming = false; btnSend.disabled = false; currentAIEl = null;
    }
  }

  // ── Intent → Tavily → contact overlay ───────────────────────────────────────

  async function onServiceInterest(service) {
    if (TAVILY_KEY) {
      try {
        const r = await fetch('https://api.tavily.com/search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: TAVILY_KEY, query: service, max_results: 3 }),
        });
        // context available for future enrichment if needed
      } catch (_) {}
    }
    showContactOverlay(service);
  }

  function showContactOverlay(service) {
    const existing = shadow.getElementById('contact-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'contact-overlay';
    overlay.innerHTML = `
      <div class="co-title">Ready to connect about <strong>${service}</strong>?</div>
      <div class="co-row">
        <input id="co-name"  type="text"  placeholder="Full Name" />
        <input id="co-email" type="email" placeholder="Email" />
      </div>
      <input id="co-phone" type="tel" placeholder="Phone  (123) 456-7890" style="width:100%" />
      <div class="co-btns">
        <button id="btn-co-send">Send →</button>
        <button id="btn-co-dismiss">Not yet</button>
      </div>
    `;

    const inputRow = shadow.getElementById('input-row');
    inputArea.insertBefore(overlay, inputRow);
    chat.scrollTop = chat.scrollHeight;

    shadow.getElementById('btn-co-dismiss').addEventListener('click', () => overlay.remove());

    shadow.getElementById('btn-co-send').addEventListener('click', async () => {
      const name  = shadow.getElementById('co-name').value.trim();
      const email = shadow.getElementById('co-email').value.trim();
      const phone = shadow.getElementById('co-phone').value.trim();
      if (!name || !email || !phone) {
        addMsg('system', 'Please fill in name, email, and phone.');
        return;
      }
      const btn = shadow.getElementById('btn-co-send');
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const res = await fetch(CONTACT_ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone_number: phone, desired_services: service }),
        });
        overlay.remove();
        addMsg('system', res.ok
          ? `Done! We'll be in touch about ${service}.`
          : 'Submission failed — please use the Contact page.');
      } catch (_) {
        overlay.remove();
        addMsg('error', 'Submission failed — please use the Contact page.');
      }
    });
  }

  function onClear() {
    history = []; chat.innerHTML = '';
    const ov = shadow.getElementById('contact-overlay');
    if (ov) ov.remove();
    addMsg('system', 'Conversation cleared.');
  }

  // ── Drag ────────────────────────────────────────────────────────────────────

  let dragging = false, ox = 0, oy = 0, didDrag = false;
  let bx = window.innerWidth  - BUBBLE_SIZE - 24;
  let by = window.innerHeight - BUBBLE_SIZE - 24;

  function applyBubblePos() {
    bubble.style.cssText += `left:${bx}px;top:${by}px;right:unset;bottom:unset;`;
  }
  function applyPanelPos() {
    const gap = 10;
    let px = bx - PANEL_WIDTH - gap;
    if (px < 8) px = bx + BUBBLE_SIZE + gap;
    let py = Math.max(8, Math.min(by - PANEL_HEIGHT / 2 + BUBBLE_SIZE / 2, window.innerHeight - PANEL_HEIGHT - 8));
    panel.style.cssText += `left:${px}px;top:${py}px;right:unset;bottom:unset;`;
  }

  bubble.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragging = true; didDrag = false;
    ox = e.clientX - bx; oy = e.clientY - by; e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const nx = e.clientX - ox, ny = e.clientY - oy;
    if (Math.abs(nx - bx) > 3 || Math.abs(ny - by) > 3) didDrag = true;
    bx = Math.max(0, Math.min(nx, window.innerWidth  - BUBBLE_SIZE));
    by = Math.max(0, Math.min(ny, window.innerHeight - BUBBLE_SIZE));
    applyBubblePos();
    if (!panel.classList.contains('hidden')) applyPanelPos();
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  bubble.addEventListener('click', () => {
    if (didDrag) { didDrag = false; return; }
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      applyPanelPos();
      if (chat.children.length === 0) addMsg('system', WELCOME_MSG);
      textInput.focus();
    }
  });

  // ── Wire up ──────────────────────────────────────────────────────────────────

  shadow.getElementById('btn-close').addEventListener('click', () => panel.classList.add('hidden'));
  shadow.getElementById('btn-clear').addEventListener('click', onClear);
  btnSend.addEventListener('click', onSend);
  textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  textInput.addEventListener('input', autoResize);

  applyBubblePos();
})();
