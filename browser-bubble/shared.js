// shared.js — Shared utilities for content.js and sidepanel.js
// Loaded before both scripts via manifest.json content_scripts / sidepanel.html

window.AIBubbleShared = (() => {

  // ── CSS ─────────────────────────────────────────────────────────────────────
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
      min-width: 280px;
      min-height: 350px;
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
    #btn-convos {
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.75);
      font-size: 14px;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      line-height: 1;
    }
    #btn-convos:hover { color: #fff; background: rgba(255,255,255,0.15); }
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
      max-width: 96%;
      word-break: break-word;
      white-space: pre-wrap;
      line-height: 1.55;
      color: #e8eaf6;
      position: relative;
    }
    .msg-ai .copy-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      background: rgba(255,255,255,0.1);
      border: none;
      color: rgba(255,255,255,0.5);
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .msg-ai:hover .copy-btn { opacity: 1; }
    .msg-ai .copy-btn:hover { color: #fff; background: rgba(255,255,255,0.2); }
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
    #selection-indicator {
      display: none;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: rgba(9,36,165,0.15);
      border-radius: 6px;
      font-size: 11px;
      color: rgba(255,255,255,0.6);
    }
    #selection-indicator.active { display: flex; }
    #selection-indicator .sel-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #selection-indicator .sel-clear {
      background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; font-size: 12px; padding: 0 2px;
    }
    #selection-indicator .sel-clear:hover { color: #fff; }

    #writing-actions {
      display: none;
      gap: 4px;
      flex-wrap: wrap;
    }
    #writing-actions.active { display: flex; }
    #writing-actions button {
      background: rgba(9,36,165,0.2);
      border: 1px solid rgba(9,36,165,0.35);
      border-radius: 6px;
      color: #cdd6f4;
      font-size: 10px;
      padding: 3px 8px;
      cursor: pointer;
      white-space: nowrap;
    }
    #writing-actions button:hover { background: rgba(9,36,165,0.4); color: #fff; }

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
    .tool-btn {
      background: rgba(9,36,165,0.2);
      border: 1px solid rgba(9,36,165,0.4);
      border-radius: 7px;
      color: #e8eaf6;
      font-size: 12px;
      padding: 5px 10px;
      cursor: pointer;
      white-space: nowrap;
    }
    .tool-btn:hover { border-color: rgb(9,36,165); color: #fff; background: rgba(9,36,165,0.35); }
    .tool-btn.active { background: rgba(9,36,165,0.5); border-color: rgb(9,36,165); color: #fff; }
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
      max-height: 200px;
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

    /* Contextualizing agent */
    .msg-context {
      align-self: stretch;
      background: rgba(100,200,100,0.04);
      border-left: 3px solid rgba(100,200,100,0.45);
      border-radius: 0 8px 8px 0;
      margin: 0;
      font-size: 12px;
      overflow: hidden;
    }
    .ctx-header {
      padding: 5px 10px; color: rgba(255,255,255,0.45);
      cursor: pointer; user-select: none; font-size: 11px;
    }
    .ctx-header:hover { color: rgba(255,255,255,0.7); }
    .ctx-body {
      padding: 0 10px 8px; color: rgba(255,255,255,0.5);
      font-style: italic; line-height: 1.5;
      white-space: pre-wrap; word-break: break-word;
    }
    .ctx-collapsed .ctx-body { display: none; }

    /* Resize corner handles */
    .resize-corner {
      position: absolute;
      width: 20px;
      height: 20px;
      z-index: 5;
    }
    .rc-nw { top: 0; left: 0; cursor: nw-resize; }
    .rc-ne { top: 0; right: 0; cursor: ne-resize; }
    .rc-sw { bottom: 0; left: 0; cursor: sw-resize; }
    .rc-se { bottom: 0; right: 0; cursor: se-resize; }
    .rc-se::after {
      content: ''; position: absolute; bottom: 4px; right: 4px;
      width: 8px; height: 8px;
      border-right: 2px solid rgba(9,36,165,0.7);
      border-bottom: 2px solid rgba(9,36,165,0.7);
    }
    .rc-sw::after {
      content: ''; position: absolute; bottom: 4px; left: 4px;
      width: 8px; height: 8px;
      border-left: 2px solid rgba(9,36,165,0.7);
      border-bottom: 2px solid rgba(9,36,165,0.7);
    }
    .rc-ne::after {
      content: ''; position: absolute; top: 4px; right: 4px;
      width: 8px; height: 8px;
      border-right: 2px solid rgba(9,36,165,0.7);
      border-top: 2px solid rgba(9,36,165,0.7);
    }
    .rc-nw::after {
      content: ''; position: absolute; top: 4px; left: 4px;
      width: 8px; height: 8px;
      border-left: 2px solid rgba(9,36,165,0.7);
      border-top: 2px solid rgba(9,36,165,0.7);
    }

    /* Slash command autocomplete */
    #slash-menu {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 10px;
      right: 10px;
      background: rgba(5,15,60,0.98);
      border: 1px solid rgba(9,36,165,0.5);
      border-radius: 8px;
      padding: 4px;
      margin-bottom: 4px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 10;
    }
    #slash-menu.active { display: block; }
    .slash-item {
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      color: #cdd6f4;
    }
    .slash-item:hover, .slash-item.selected { background: rgba(9,36,165,0.3); }
    .slash-item .slash-cmd { color: #89b4fa; font-weight: 600; }
    .slash-item .slash-desc { color: #a6adc8; margin-left: 8px; }

    /* Conversation list */
    #convo-list {
      display: none;
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      flex-direction: column;
      gap: 4px;
    }
    #convo-list.active { display: flex; }
    #convo-list.active ~ #chat { display: none; }
    #convo-list.active ~ #input-area { display: none; }
    .convo-new {
      padding: 8px 12px;
      background: rgba(9,36,165,0.3);
      border: 1px dashed rgba(9,36,165,0.5);
      border-radius: 8px;
      color: #89b4fa;
      font-size: 12px;
      cursor: pointer;
      text-align: center;
      margin-bottom: 4px;
    }
    .convo-new:hover { background: rgba(9,36,165,0.45); }
    .convo-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: rgba(255,255,255,0.04);
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
    }
    .convo-item:hover { background: rgba(255,255,255,0.08); }
    .convo-item .convo-title { flex: 1; color: #e8eaf6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .convo-item .convo-meta { color: #a6adc8; font-size: 10px; white-space: nowrap; }
    .convo-item .convo-delete {
      background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 12px; padding: 0 2px;
    }
    .convo-item .convo-delete:hover { color: #f38ba8; }
  `;

  // ── Page content extraction ─────────────────────────────────────────────────

  function extractPageContent() {
    const url = window.location.href;
    const title = document.title;
    const selection = window.getSelection().toString().trim();

    const isPdf = document.contentType === 'application/pdf'
      || url.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      let text = '';
      try {
        // Chrome's PDF viewer
        const embed = document.querySelector('embed[type="application/pdf"]');
        if (embed && embed.shadowRoot) {
          const spans = embed.shadowRoot.querySelectorAll('.textLayer span');
          text = Array.from(spans).map(s => s.textContent).join(' ');
        }
        // Firefox's PDF.js viewer
        if (!text) {
          const spans = document.querySelectorAll('#viewer .textLayer span');
          if (spans.length) text = Array.from(spans).map(s => s.textContent).join(' ');
        }
      } catch { /* PDF extraction failed */ }
      return { url, title, text: text.slice(0, 12000) || '(PDF detected — text extraction unavailable)', selection, isPdf: true };
    }

    const clone = document.body.cloneNode(true);
    const remove = ['script', 'style', 'noscript', 'svg', 'canvas', 'nav', 'header', 'footer', 'iframe', 'aside'];
    remove.forEach(tag => clone.querySelectorAll(tag).forEach(el => el.remove()));
    const text = clone.innerText.replace(/\s+/g, ' ').trim().slice(0, 12000);

    return { url, title, text, selection };
  }

  // ── Slash command parser ────────────────────────────────────────────────────

  const SLASH_COMMANDS = [
    { cmd: '/summarize', desc: 'Summarize the current page', prompt: (args, ctx) => {
      if (args) return `Summarize the following:\n\n${args}`;
      if (ctx) return `Summarize this page:\n\nURL: ${ctx.url}\nTitle: ${ctx.title}\n\n${ctx.text.slice(0, 8000)}`;
      return 'Summarize the current page.';
    }},
    { cmd: '/explain', desc: 'Explain selected text or topic', prompt: (args) =>
      `Explain the following clearly and concisely:\n\n${args || '(no text provided)'}` },
    { cmd: '/translate', desc: 'Translate selected text to English', prompt: (args) =>
      `Translate the following to English:\n\n${args || '(no text provided)'}` },
    { cmd: '/rewrite', desc: 'Rewrite selected text', prompt: (args) =>
      `Rewrite the following text, improving clarity while keeping the same meaning:\n\n${args || '(no text provided)'}` },
    { cmd: '/code', desc: 'Explain code step by step', prompt: (args) =>
      `Explain this code step by step:\n\n${args || '(no code provided)'}` },
  ];

  function parseSlashCommand(input) {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null;
    const spaceIdx = trimmed.indexOf(' ');
    const cmd = spaceIdx === -1 ? trimmed.toLowerCase() : trimmed.slice(0, spaceIdx).toLowerCase();
    const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
    const match = SLASH_COMMANDS.find(c => c.cmd === cmd);
    if (!match) return null;
    return { command: match.cmd, args, promptFn: match.prompt };
  }

  // ── Conversation persistence ────────────────────────────────────────────────

  const MAX_CONVERSATIONS = 100;

  function generateId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  async function listConversations() {
    const { conversations = {} } = await chrome.storage.local.get('conversations');
    return Object.values(conversations)
      .map(c => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: (c.messages || []).length }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function loadConversation(id) {
    const { conversations = {} } = await chrome.storage.local.get('conversations');
    return conversations[id] || null;
  }

  async function saveConversation(id, data) {
    const { conversations = {} } = await chrome.storage.local.get('conversations');
    conversations[id] = { ...data, id, updatedAt: Date.now() };

    // Auto-prune oldest beyond cap
    const ids = Object.keys(conversations);
    if (ids.length > MAX_CONVERSATIONS) {
      const sorted = ids.sort((a, b) => conversations[a].updatedAt - conversations[b].updatedAt);
      const toRemove = sorted.slice(0, ids.length - MAX_CONVERSATIONS);
      toRemove.forEach(rid => delete conversations[rid]);
    }

    await chrome.storage.local.set({ conversations, activeConversationId: id });
  }

  async function deleteConversation(id) {
    const { conversations = {}, activeConversationId } = await chrome.storage.local.get(['conversations', 'activeConversationId']);
    delete conversations[id];
    const updates = { conversations };
    if (activeConversationId === id) updates.activeConversationId = null;
    await chrome.storage.local.set(updates);
  }

  // ── Chat helpers (parameterized by container) ───────────────────────────────

  function addMsg(container, type, text) {
    const el = document.createElement('div');
    el.className = 'msg-' + type;
    el.textContent = text;

    // Add copy button to AI messages
    if (type === 'ai') {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const msgText = el.childNodes[0]?.textContent || el.textContent;
        try {
          await navigator.clipboard.writeText(msgText);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        } catch { /* clipboard access denied */ }
      });
      el.appendChild(copyBtn);
    }

    container.appendChild(el);
    scrollBottom(container);
    return el;
  }

  function scrollBottom(container) {
    container.scrollTop = container.scrollHeight;
  }

  function createContextEl() {
    const el = document.createElement('div');
    el.className = 'msg-context';
    el.innerHTML = `
      <div class="ctx-header">\u{1F50D} Context <span class="ctx-chevron">▾</span></div>
      <div class="ctx-body"></div>
    `;
    el.querySelector('.ctx-header').addEventListener('click', () => {
      el.classList.toggle('ctx-collapsed');
      el.querySelector('.ctx-chevron').textContent =
        el.classList.contains('ctx-collapsed') ? '▸' : '▾';
    });
    return el;
  }

  // ── Writing assistance prompts ──────────────────────────────────────────────

  const WRITING_ACTIONS = [
    { label: 'Rewrite', prompt: (sel) => `Rewrite the following text, keeping the same meaning but improving clarity:\n\n${sel}` },
    { label: 'Shorter', prompt: (sel) => `Make this text more concise while preserving the key points:\n\n${sel}` },
    { label: 'Longer', prompt: (sel) => `Expand this text with more detail and explanation:\n\n${sel}` },
    { label: 'Fix Grammar', prompt: (sel) => `Fix any grammar, spelling, and punctuation errors in this text:\n\n${sel}` },
    { label: 'Change Tone', prompt: (sel) => `Rewrite this text in a more professional and formal tone:\n\n${sel}` },
  ];

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    CSS,
    extractPageContent,
    parseSlashCommand,
    SLASH_COMMANDS,
    WRITING_ACTIONS,
    generateId,
    listConversations,
    loadConversation,
    saveConversation,
    deleteConversation,
    addMsg,
    scrollBottom,
    createContextEl,
  };

})();
