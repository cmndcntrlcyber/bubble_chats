// sidepanel.js — Side panel logic
// Shares AIBubbleShared utilities with content.js

(async function () {
  const S = window.AIBubbleShared;

  // ── Constants ──────────────────────────────────────────────────────────────

  const CLAUDE_MODELS = [
    { label: 'Haiku 4.5  — fast',     id: 'claude-haiku-4-5-20251001' },
    { label: 'Sonnet 4.6 — balanced', id: 'claude-sonnet-4-6' },
    { label: 'Opus 4.6   — powerful', id: 'claude-opus-4-6' },
  ];

  let activeModels = CLAUDE_MODELS;

  // ── DOM refs ──────────────────────────────────────────────────────────────

  const modelSelect   = document.getElementById('model-select');
  const chat          = document.getElementById('chat');
  const textInput     = document.getElementById('text-input');
  const btnSend       = document.getElementById('btn-send');
  const btnSS         = document.getElementById('btn-screenshot');
  const btnPage       = document.getElementById('btn-page');
  const ssStatus      = document.getElementById('ss-status');
  const selIndicator  = document.getElementById('selection-indicator');
  const selText       = document.querySelector('.sel-text');
  const selClear      = document.querySelector('.sel-clear');
  const convoList     = document.getElementById('convo-list');
  const btnConvos     = document.getElementById('btn-convos');
  const btnClear      = document.getElementById('btn-clear');
  const writingActionsEl = document.getElementById('writing-actions');
  const slashMenu     = document.getElementById('slash-menu');

  // ── Build writing action buttons ──────────────────────────────────────────

  S.WRITING_ACTIONS.forEach(wa => {
    const btn = document.createElement('button');
    btn.textContent = wa.label;
    btn.addEventListener('click', () => {
      if (!currentSelection || isStreaming) return;
      sendPrompt(wa.prompt(currentSelection));
    });
    writingActionsEl.appendChild(btn);
  });

  // ── Build slash command menu ──────────────────────────────────────────────

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
  let pendingPageContext = null;

  // Load defaults
  chrome.storage.local.get(['pageContextDefault', 'activeConversationId'], async (res) => {
    pageContextEnabled = !!res.pageContextDefault;
    if (pageContextEnabled) btnPage.classList.add('active');
    if (res.activeConversationId) {
      const convo = await S.loadConversation(res.activeConversationId);
      if (convo) restoreConversation(convo);
    }
    if (chat.children.length === 0) S.addMsg(chat, 'system', 'Ready. Ask anything about the current page.');
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
        S.addMsg(chat, 'error', 'No API key set. Right-click the extension icon → Options.');
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
      case 'SELECTION_UPDATE':
        currentSelection = msg.text || '';
        updateSelectionUI();
        break;
      case 'PAGE_CONTENT':
        if (msg.error) {
          S.addMsg(chat, 'error', 'Page extraction failed: ' + msg.error);
        } else {
          pendingPageContext = { url: msg.url, title: msg.title, text: msg.text, selection: msg.selection };
        }
        break;
      case 'CONTEXT_MENU_ACTION':
        if (msg.text) {
          if (showingConvoList) hideConversationList();
          sendPrompt(msg.text);
        }
        break;
    }
  }

  // ── Selection UI ──────────────────────────────────────────────────────────

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
      slashMenu.classList.add('active');
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
      pageUrl: '',
      pageTitle: '',
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
        showConversationList();
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

    if (pageContextEnabled && pendingPageContext) {
      sendMsg.pageContext = pendingPageContext;
    }

    getPort().postMessage(sendMsg);
  }

  function onSend() {
    if (isStreaming) return;
    const text = textInput.value.trim();
    if (!text && !pendingScreenshot) return;

    // Slash commands
    const slashCmd = S.parseSlashCommand(text);
    if (slashCmd) {
      slashMenu.classList.remove('active');
      // Request page content for /summarize
      const args = slashCmd.args || currentSelection || '';
      const prompt = slashCmd.promptFn(args, pendingPageContext);
      sendPrompt(prompt);
      currentSelection = '';
      updateSelectionUI();
      return;
    }

    let msgText = text;
    if (currentSelection && text) {
      msgText = `[Selected text from page:]\n${currentSelection}\n\n${text}`;
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

    if (pageContextEnabled && pendingPageContext) {
      sendMsg.pageContext = pendingPageContext;
    }

    getPort().postMessage(sendMsg);
    currentSelection = '';
    updateSelectionUI();
  }

  async function onScreenshot() {
    if (isStreaming) return;
    btnSend.disabled = true;
    ssStatus.textContent = 'Capturing…';
    ssStatus.classList.remove('attached');
    // Side panel needs to know which tab to capture
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    getPort().postMessage({ type: 'SCREENSHOT', tabId: tab?.id });
  }

  function onClear() {
    saveCurrentConversation();
    startNewConversation();
  }

  // ── Page context toggle ───────────────────────────────────────────────────

  btnPage.addEventListener('click', async () => {
    pageContextEnabled = !pageContextEnabled;
    btnPage.classList.toggle('active', pageContextEnabled);
    chrome.storage.local.set({ pageContextDefault: pageContextEnabled });
    if (pageContextEnabled) {
      // Fetch page content from active tab
      getPort().postMessage({ type: 'EXTRACT_ACTIVE_TAB' });
    } else {
      pendingPageContext = null;
    }
  });

  // Re-fetch page content when tab changes
  chrome.tabs.onActivated.addListener(() => {
    if (pageContextEnabled) {
      getPort().postMessage({ type: 'EXTRACT_ACTIVE_TAB' });
    }
  });

  // ── Auto resize textarea ──────────────────────────────────────────────────

  function autoResize() {
    textInput.style.height = 'auto';
    const newH = Math.min(textInput.scrollHeight, 200);
    textInput.style.height = newH + 'px';
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  btnClear.addEventListener('click', onClear);
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
})();
