// content.js — injected into every page
// Floating AI bubble using Shadow DOM for full style isolation

(async function () {
  if (document.getElementById('__ai_bubble_host__')) return;

  const S = window.AIBubbleShared;

  // ── Constants ──────────────────────────────────────────────────────────────

  const CLAUDE_MODELS = [
    { label: 'Haiku 4.5  — fast',     id: 'claude-haiku-4-5-20251001' },
    { label: 'Sonnet 4.6 — balanced', id: 'claude-sonnet-4-6' },
    { label: 'Opus 4.6   — powerful', id: 'claude-opus-4-6' },
  ];

  let activeModels = CLAUDE_MODELS;

  // ── Check display mode ────────────────────────────────────────────────────

  const { displayMode } = await chrome.storage.local.get('displayMode');
  const isSidePanelMode = displayMode === 'sidepanel';

  // In side panel mode, only set up selection relay — no bubble UI injected.
  // Context menu actions and toggle are handled by sidepanel.js via background.js routing.
  if (isSidePanelMode) {
    setupSelectionRelay();
    return;
  }

  // ── DOM ────────────────────────────────────────────────────────────────────

  const host = document.createElement('div');
  host.id = '__ai_bubble_host__';
  host.style.cssText = 'all:unset;position:fixed;z-index:2147483647;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = S.CSS;
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
    <div class="resize-corner rc-nw"></div>
    <div class="resize-corner rc-ne"></div>
    <div class="resize-corner rc-sw"></div>
    <div class="resize-corner rc-se"></div>
    <div id="header">
      <span id="header-icon">◉</span>
      <span id="header-title">AI Bubble</span>
      <select id="model-select"></select>
      <button id="btn-convos" title="Conversations">☰</button>
      <button id="btn-clear">clear</button>
      <button id="btn-close">✕</button>
    </div>
    <div id="convo-list"></div>
    <div id="chat"></div>
    <div id="input-area" style="position:relative">
      <div id="selection-indicator">
        <span class="sel-text"></span>
        <button class="sel-clear">✕</button>
      </div>
      <div id="writing-actions"></div>
      <div id="ss-row">
        <span id="ss-status">No screenshot attached</span>
        <button id="btn-page" class="tool-btn">\u{1F4C4} Page</button>
        <button id="btn-screenshot" class="tool-btn">\u{1F4F7} Screenshot</button>
      </div>
      <div id="slash-menu"></div>
      <div id="send-row">
        <textarea id="text-input" rows="1" placeholder="Ask anything… type / for commands"></textarea>
        <button id="btn-send">Send</button>
      </div>
    </div>
  `;
  shadow.appendChild(panel);

  // Build writing action buttons
  const writingActionsEl = panel.querySelector('#writing-actions');
  S.WRITING_ACTIONS.forEach(wa => {
    const btn = document.createElement('button');
    btn.textContent = wa.label;
    btn.addEventListener('click', () => {
      if (!currentSelection || isStreaming) return;
      sendPrompt(wa.prompt(currentSelection));
    });
    writingActionsEl.appendChild(btn);
  });

  // Build slash command menu
  const slashMenu = panel.querySelector('#slash-menu');
  S.SLASH_COMMANDS.forEach(sc => {
    const item = document.createElement('div');
    item.className = 'slash-item';
    item.innerHTML = `<span class="slash-cmd">${sc.cmd}</span><span class="slash-desc">${sc.desc}</span>`;
    item.addEventListener('click', () => {
      textInput.value = sc.cmd + ' ';
      slashMenu.classList.remove('active');
      textInput.focus();
    });
    slashMenu.appendChild(item);
  });

  // ── DOM refs ──────────────────────────────────────────────────────────────

  const modelSelect   = panel.querySelector('#model-select');
  const chat          = panel.querySelector('#chat');
  const textInput     = panel.querySelector('#text-input');
  const btnSend       = panel.querySelector('#btn-send');
  const btnSS         = panel.querySelector('#btn-screenshot');
  const btnPage       = panel.querySelector('#btn-page');
  const ssStatus      = panel.querySelector('#ss-status');
  const selIndicator  = panel.querySelector('#selection-indicator');
  const selText       = panel.querySelector('.sel-text');
  const selClear      = panel.querySelector('.sel-clear');
  const convoList     = panel.querySelector('#convo-list');
  const btnConvos     = panel.querySelector('#btn-convos');

  // ── Model selector ────────────────────────────────────────────────────────

  function populateModels(models) {
    activeModels = models;
    modelSelect.innerHTML = '';
    models.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = m.label;
      modelSelect.appendChild(opt);
    });
  }

  populateModels(CLAUDE_MODELS);

  chrome.storage.local.get(['provider', 'ollamaModel'], ({ provider, ollamaModel }) => {
    if (provider === 'ollama') {
      const fallback = ollamaModel || 'llama3.2';
      populateModels([{ label: `Ollama — ${fallback}`, id: fallback }]);
      getPort().postMessage({ type: 'FETCH_OLLAMA_MODELS' });
    }
  });

  // ── State ─────────────────────────────────────────────────────────────────

  let port = null;
  let history = [];
  let pendingScreenshot = null;
  let isStreaming = false;
  let currentAIEl = null;
  let accumulated = '';
  let currentContextEl = null;
  let accumulatedContext = '';
  let currentSelection = '';
  let pageContextEnabled = false;
  let currentConvoId = null;
  let showingConvoList = false;

  // Load defaults
  chrome.storage.local.get(['pageContextDefault', 'activeConversationId'], async (res) => {
    pageContextEnabled = !!res.pageContextDefault;
    if (pageContextEnabled) btnPage.classList.add('active');
    // Restore active conversation
    if (res.activeConversationId) {
      const convo = await S.loadConversation(res.activeConversationId);
      if (convo) restoreConversation(convo);
    }
  });

  // ── Port ──────────────────────────────────────────────────────────────────

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
        if (currentAIEl) {
          // Preserve copy button
          const copyBtn = currentAIEl.querySelector('.copy-btn');
          currentAIEl.textContent = accumulated;
          if (copyBtn) currentAIEl.appendChild(copyBtn);
        }
        S.scrollBottom(chat);
        break;
      case 'DONE':
        if (accumulated) history.push({ role: 'assistant', content: accumulated });
        isStreaming = false;
        btnSend.disabled = false;
        currentAIEl = null;
        saveCurrentConversation();
        break;
      case 'ERROR':
        S.addMsg(chat, 'error', 'Error: ' + msg.error);
        isStreaming = false;
        btnSend.disabled = false;
        currentAIEl = null;
        break;
      case 'NO_KEY':
        S.addMsg(chat, 'error', 'No API key set. Click the extension icon to open settings.');
        isStreaming = false;
        btnSend.disabled = false;
        currentAIEl = null;
        break;
      case 'OLLAMA_MODELS':
        if (msg.models && msg.models.length) {
          populateModels(msg.models.map(name => ({ label: `Ollama — ${name}`, id: name })));
        }
        break;
      case 'OLLAMA_MODELS_ERROR':
        break;
      case 'CONTEXT_CHUNK':
        if (!currentContextEl) {
          currentContextEl = S.createContextEl();
          accumulatedContext = '';
          chat.appendChild(currentContextEl);
        }
        accumulatedContext += msg.text;
        currentContextEl.querySelector('.ctx-body').textContent = accumulatedContext;
        S.scrollBottom(chat);
        break;
      case 'CONTEXT_DONE':
        currentContextEl = null;
        break;
      case 'SCREENSHOT_DATA':
        pendingScreenshot = msg.data;
        ssStatus.textContent = '✓ Screenshot attached';
        ssStatus.classList.add('attached');
        S.addMsg(chat, 'system', 'Screenshot captured — ask your question.');
        btnSend.disabled = false;
        break;
      case 'SCREENSHOT_ERROR':
        S.addMsg(chat, 'error', 'Screenshot failed: ' + msg.error);
        btnSend.disabled = false;
        break;
    }
  }

  // ── Selection awareness ───────────────────────────────────────────────────

  let selectionTimer = null;

  function setupSelectionRelay() {
    let relayPort = null;
    function getRelayPort() {
      if (!relayPort || relayPort._disconnected) {
        try {
          relayPort = chrome.runtime.connect({ name: 'ai-bubble' });
          relayPort._disconnected = false;
          relayPort.onDisconnect.addListener(() => { relayPort._disconnected = true; });
        } catch { return null; }
      }
      return relayPort;
    }
    document.addEventListener('selectionchange', () => {
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => {
        const sel = window.getSelection().toString().trim();
        const p = getRelayPort();
        if (p) p.postMessage({ type: 'SELECTION_CHANGED', text: sel });
      }, 300);
    });
  }

  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const sel = window.getSelection().toString().trim();
      currentSelection = sel;
      updateSelectionUI();
      // Relay to side panel via port
      try { getPort().postMessage({ type: 'SELECTION_CHANGED', text: sel }); } catch {}
    }, 300);
  });

  function updateSelectionUI() {
    if (currentSelection) {
      selText.textContent = currentSelection.length > 60
        ? currentSelection.slice(0, 60) + '…'
        : currentSelection;
      selIndicator.classList.add('active');
      writingActionsEl.classList.add('active');
    } else {
      selIndicator.classList.remove('active');
      writingActionsEl.classList.remove('active');
    }
  }

  selClear.addEventListener('click', () => {
    currentSelection = '';
    updateSelectionUI();
  });

  // ── Slash command autocomplete ────────────────────────────────────────────

  textInput.addEventListener('input', () => {
    autoResize();
    const val = textInput.value;
    if (val.startsWith('/') && val.length <= 15 && !val.includes('\n')) {
      const matches = S.SLASH_COMMANDS.filter(c => c.cmd.startsWith(val.toLowerCase()));
      if (matches.length > 0 && val !== '/') {
        slashMenu.classList.add('active');
      } else if (val === '/') {
        slashMenu.classList.add('active');
      } else {
        slashMenu.classList.remove('active');
      }
    } else {
      slashMenu.classList.remove('active');
    }
  });

  // ── Conversation persistence ──────────────────────────────────────────────

  function getConvoTitle() {
    const firstUser = history.find(m => m.role === 'user');
    if (!firstUser) return 'New conversation';
    const text = Array.isArray(firstUser.content)
      ? (firstUser.content.find(b => b.type === 'text')?.text || 'Screenshot conversation')
      : (firstUser.content || 'New conversation');
    return text.slice(0, 50);
  }

  async function saveCurrentConversation() {
    if (history.length === 0) return;
    if (!currentConvoId) currentConvoId = S.generateId();
    await S.saveConversation(currentConvoId, {
      title: getConvoTitle(),
      createdAt: (await S.loadConversation(currentConvoId))?.createdAt || Date.now(),
      messages: history,
      pageUrl: window.location.href,
      pageTitle: document.title,
    });
  }

  function restoreConversation(convo) {
    currentConvoId = convo.id;
    history = convo.messages || [];
    chat.innerHTML = '';
    for (const msg of history) {
      if (msg.role === 'user') {
        const text = Array.isArray(msg.content)
          ? (msg.content.find(b => b.type === 'text')?.text || '(screenshot)')
          : (msg.content || '');
        S.addMsg(chat, 'user', text);
      } else {
        S.addMsg(chat, 'ai', typeof msg.content === 'string' ? msg.content : '');
      }
    }
  }

  async function showConversationList() {
    showingConvoList = true;
    convoList.classList.add('active');
    convoList.innerHTML = '';

    const newBtn = document.createElement('div');
    newBtn.className = 'convo-new';
    newBtn.textContent = '+ New conversation';
    newBtn.addEventListener('click', () => {
      startNewConversation();
      hideConversationList();
    });
    convoList.appendChild(newBtn);

    const convos = await S.listConversations();
    for (const c of convos) {
      const item = document.createElement('div');
      item.className = 'convo-item';
      const ago = formatTimeAgo(c.updatedAt);
      item.innerHTML = `
        <span class="convo-title">${escapeHtml(c.title)}</span>
        <span class="convo-meta">${c.messageCount} msgs · ${ago}</span>
        <button class="convo-delete" title="Delete">\u{1F5D1}</button>
      `;
      item.querySelector('.convo-title').addEventListener('click', async () => {
        const convo = await S.loadConversation(c.id);
        if (convo) restoreConversation(convo);
        hideConversationList();
      });
      item.querySelector('.convo-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await S.deleteConversation(c.id);
        if (currentConvoId === c.id) startNewConversation();
        showConversationList(); // refresh list
      });
      convoList.appendChild(item);
    }

    if (convos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'msg-system';
      empty.textContent = 'No saved conversations';
      convoList.appendChild(empty);
    }
  }

  function hideConversationList() {
    showingConvoList = false;
    convoList.classList.remove('active');
  }

  function startNewConversation() {
    currentConvoId = null;
    history = [];
    pendingScreenshot = null;
    ssStatus.textContent = 'No screenshot attached';
    ssStatus.classList.remove('attached');
    chat.innerHTML = '';
    S.addMsg(chat, 'system', 'New conversation started.');
  }

  function formatTimeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }

  function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  btnConvos.addEventListener('click', () => {
    if (showingConvoList) hideConversationList();
    else showConversationList();
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  function sendPrompt(text) {
    if (isStreaming) return;
    S.addMsg(chat, 'user', text.length > 200 ? text.slice(0, 200) + '…' : text);
    textInput.value = '';
    autoResize();

    const content = [{ type: 'text', text }];
    history.push({ role: 'user', content });
    isStreaming = true;
    btnSend.disabled = true;
    accumulated = '';
    currentAIEl = S.addMsg(chat, 'ai', '');

    const sendMsg = {
      type: 'SEND',
      messages: history,
      model: activeModels[parseInt(modelSelect.value)]?.id || activeModels[0]?.id,
    };

    if (pageContextEnabled) {
      sendMsg.pageContext = S.extractPageContent();
    }

    getPort().postMessage(sendMsg);
  }

  function onSend() {
    if (isStreaming) return;
    const text = textInput.value.trim();
    if (!text && !pendingScreenshot) return;

    // Check for slash commands
    const slashCmd = S.parseSlashCommand(text);
    if (slashCmd) {
      slashMenu.classList.remove('active');
      const ctx = S.extractPageContent();
      const args = slashCmd.args || currentSelection || '';
      const prompt = slashCmd.promptFn(args, ctx);
      sendPrompt(prompt);
      currentSelection = '';
      updateSelectionUI();
      return;
    }

    // Build message text, prepending selection if present
    let msgText = text;
    if (currentSelection && text) {
      msgText = `[Selected text from page:]\n${currentSelection}\n\n${text}`;
    } else if (!text && currentSelection) {
      msgText = currentSelection;
    }

    const displayText = text || '(screenshot)';
    S.addMsg(chat, 'user', displayText);
    textInput.value = '';
    autoResize();
    slashMenu.classList.remove('active');

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
    if (msgText) content.push({ type: 'text', text: msgText });

    history.push({ role: 'user', content });
    isStreaming = true;
    btnSend.disabled = true;
    accumulated = '';
    currentAIEl = S.addMsg(chat, 'ai', '');

    const sendMsg = {
      type: 'SEND',
      messages: history,
      model: activeModels[parseInt(modelSelect.value)]?.id || activeModels[0]?.id,
    };

    if (pageContextEnabled) {
      sendMsg.pageContext = S.extractPageContent();
    }

    getPort().postMessage(sendMsg);
    currentSelection = '';
    updateSelectionUI();
  }

  function onScreenshot() {
    if (isStreaming) return;
    btnSend.disabled = true;
    ssStatus.textContent = 'Capturing…';
    ssStatus.classList.remove('attached');
    getPort().postMessage({ type: 'SCREENSHOT' });
  }

  function onClear() {
    saveCurrentConversation();
    startNewConversation();
  }

  // ── Page context toggle ───────────────────────────────────────────────────

  btnPage.addEventListener('click', () => {
    pageContextEnabled = !pageContextEnabled;
    btnPage.classList.toggle('active', pageContextEnabled);
    chrome.storage.local.set({ pageContextDefault: pageContextEnabled });
  });

  // ── Auto resize textarea ──────────────────────────────────────────────────

  let textareaExtraH = 0;

  function autoResize() {
    textInput.style.height = 'auto';
    const newH = Math.min(textInput.scrollHeight, 200);
    textInput.style.height = newH + 'px';
    const newExtra = Math.max(0, newH - 36);
    const delta = newExtra - textareaExtraH;
    textareaExtraH = newExtra;
    if (delta !== 0 && !panel.classList.contains('hidden')) {
      const r = panel.getBoundingClientRect();
      const prevPanelH = panelH;
      panelH = Math.max(350, panelH + delta);
      const actualDelta = panelH - prevPanelH;
      panel.style.height = panelH + 'px';
      panel.style.top = Math.max(8, r.top - actualDelta) + 'px';
    }
  }

  // ── Bubble drag ───────────────────────────────────────────────────────────

  let dragging = false, ox = 0, oy = 0, didDrag = false;
  let bx = window.innerWidth - 24 - 56;
  let by = window.innerHeight - 24 - 56;
  let panelW = 400, panelH = 540;

  function applyBubblePos() {
    bubble.style.left  = bx + 'px';
    bubble.style.top   = by + 'px';
    bubble.style.right = 'unset';
    bubble.style.bottom = 'unset';
  }

  function applyPanelPos() {
    const gap = 10;
    let px = bx - panelW - gap;
    if (px < 8) px = bx + 56 + gap;
    let py = by - panelH / 2 + 28;
    py = Math.max(8, Math.min(py, window.innerHeight - panelH - 8));
    panel.style.width  = panelW + 'px';
    panel.style.height = panelH + 'px';
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

  document.addEventListener('mouseup', () => { dragging = false; resizing = false; });

  // ── Panel resize ──────────────────────────────────────────────────────────

  let resizing = false, resizeDir = '';
  let rStartX = 0, rStartY = 0, rStartW = 0, rStartH = 0, rStartPX = 0, rStartPY = 0;

  ['nw', 'ne', 'sw', 'se'].forEach(dir => {
    panel.querySelector('.rc-' + dir).addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      resizing = true;
      resizeDir = dir;
      rStartX = e.clientX;
      rStartY = e.clientY;
      const r = panel.getBoundingClientRect();
      rStartW = r.width; rStartH = r.height;
      rStartPX = r.left; rStartPY = r.top;
      e.preventDefault();
      e.stopPropagation();
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dx = e.clientX - rStartX;
    const dy = e.clientY - rStartY;
    let w = rStartW, h = rStartH, px = rStartPX, py = rStartPY;
    if (resizeDir.includes('e')) w = Math.max(280, rStartW + dx);
    if (resizeDir.includes('w')) { w = Math.max(280, rStartW - dx); px = rStartPX + rStartW - w; }
    if (resizeDir.includes('s')) h = Math.max(350, rStartH + dy);
    if (resizeDir.includes('n')) { h = Math.max(350, rStartH - dy); py = rStartPY + rStartH - h; }
    panelW = w; panelH = h;
    panel.style.width  = w + 'px';
    panel.style.height = h + 'px';
    panel.style.left   = px + 'px';
    panel.style.top    = py + 'px';
    panel.style.right  = 'unset';
    panel.style.bottom = 'unset';
  });

  bubble.addEventListener('click', () => {
    if (didDrag) { didDrag = false; return; }
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      applyPanelPos();
      if (chat.children.length === 0) S.addMsg(chat, 'system', 'Ready. Screenshot, read page, or ask anything.');
      textInput.focus();
    }
  });

  // ── Message listener (context menu actions, toggle) ───────────────────────

  function setupMessageListener(panelEl, chatEl, inputEl) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'TOGGLE_PANEL') {
        if (panelEl) panelEl.classList.toggle('hidden');
        return;
      }
      if (msg.type === 'CONTEXT_MENU_ACTION') {
        if (panelEl) {
          panelEl.classList.remove('hidden');
          applyPanelPos();
        }
        if (msg.text) {
          sendPrompt(msg.text);
        }
        return;
      }
    });
  }

  setupMessageListener(panel, chat, textInput);

  // ── Event wiring ──────────────────────────────────────────────────────────

  panel.querySelector('#btn-close').addEventListener('click', () => panel.classList.add('hidden'));
  panel.querySelector('#btn-clear').addEventListener('click', onClear);
  btnSend.addEventListener('click', onSend);
  btnSS.addEventListener('click', onScreenshot);

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
    if (e.key === 'Escape') {
      slashMenu.classList.remove('active');
    }
  });

  // Initial position
  applyBubblePos();
})();
