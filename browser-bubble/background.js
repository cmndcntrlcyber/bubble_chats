// background.js — service worker
// Handles: API streaming, screenshots, context menus, keyboard shortcuts,
// page extraction relay, side panel support

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const TAVILY_API    = 'https://api.tavily.com/search';
const SYSTEM_PROMPT =
  'You are a helpful browser assistant. ' +
  'Be concise and practical. When analyzing screenshots, identify issues ' +
  'clearly and suggest specific fixes. Use plain text — no markdown headers.';

// ── Port tracking ───────────────────────────────────────────────────────────

const contentPorts = new Map();     // tabId -> port (from content scripts)
const sidePanelPorts = new Map();   // tabId|'global' -> port (from side panel)

function isSidePanelPort(port) {
  return port.sender?.url?.startsWith(`chrome-extension://${chrome.runtime.id}/sidepanel`);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-bubble') return;

  const fromSidePanel = isSidePanelPort(port);
  const tabId = fromSidePanel ? 'sidepanel' : port.sender?.tab?.id;

  if (fromSidePanel) {
    sidePanelPorts.set('sidepanel', port);
  } else if (tabId) {
    contentPorts.set(tabId, port);
  }

  port.onDisconnect.addListener(() => {
    if (fromSidePanel) sidePanelPorts.delete('sidepanel');
    else if (tabId) contentPorts.delete(tabId);
  });

  port.onMessage.addListener(async (msg) => {
    switch (msg.type) {
      case 'SEND':
        await handleSend(port, msg);
        break;
      case 'SCREENSHOT':
        await handleScreenshot(port, fromSidePanel ? msg.tabId : tabId);
        break;
      case 'GET_KEY':
        await handleGetKey(port);
        break;
      case 'FETCH_OLLAMA_MODELS':
        await handleFetchOllamaModels(port);
        break;
      case 'SELECTION_CHANGED':
        // Relay selection from content script to side panel
        const spPort = sidePanelPorts.get('sidepanel');
        if (spPort) spPort.postMessage({ type: 'SELECTION_UPDATE', text: msg.text });
        break;
      case 'EXTRACT_ACTIVE_TAB':
        await handleExtractActiveTab(port);
        break;
    }
  });
});

// ── Context menus ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'ask-bubble', title: 'Ask AI Bubble about "%s"', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'summarize-page', title: 'Summarize this page', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'explain', title: 'Explain this', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'translate', title: 'Translate this', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'rewrite', title: 'Rewrite this', contexts: ['selection'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'summarize-page') {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (typeof AIBubbleShared !== 'undefined') return AIBubbleShared.extractPageContent();
          const clone = document.body.cloneNode(true);
          ['script','style','noscript','svg','canvas','nav','header','footer','iframe','aside']
            .forEach(t => clone.querySelectorAll(t).forEach(e => e.remove()));
          return { url: location.href, title: document.title, text: clone.innerText.replace(/\s+/g,' ').trim().slice(0,12000), selection: '' };
        },
      });
      const ctx = result?.result;
      const prompt = ctx
        ? `Summarize this page:\n\nURL: ${ctx.url}\nTitle: ${ctx.title}\n\n${ctx.text.slice(0, 8000)}`
        : 'Summarize the current page.';
      sendAction(tab.id, { type: 'CONTEXT_MENU_ACTION', action: 'summarize', text: prompt });
    } catch {
      sendAction(tab.id, { type: 'CONTEXT_MENU_ACTION', action: 'summarize', text: 'Summarize the current page.' });
    }
    return;
  }

  const actionMap = {
    'ask-bubble': { action: 'ask', prefix: '' },
    'explain':    { action: 'explain', prefix: 'Explain the following clearly and concisely:\n\n' },
    'translate':  { action: 'translate', prefix: 'Translate the following to English:\n\n' },
    'rewrite':    { action: 'rewrite', prefix: 'Rewrite the following text, improving clarity while keeping the same meaning:\n\n' },
  };

  const entry = actionMap[info.menuItemId];
  if (entry && info.selectionText) {
    const prompt = entry.prefix + info.selectionText;
    sendAction(tab.id, { type: 'CONTEXT_MENU_ACTION', action: entry.action, text: prompt });
  }
});

function sendToContentScript(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['shared.js', 'content.js'],
    }).then(() => {
      setTimeout(() => chrome.tabs.sendMessage(tabId, msg).catch(() => {}), 300);
    }).catch(() => {});
  });
}

// Route actions to either content script (bubble mode) or side panel (sidepanel mode)
async function sendAction(tabId, msg) {
  const { displayMode } = await chrome.storage.local.get('displayMode');
  if (displayMode === 'sidepanel') {
    const spPort = sidePanelPorts.get('sidepanel');
    if (spPort) {
      spPort.postMessage(msg);
      // Ensure side panel is open
      if (typeof chrome?.sidePanel?.open === 'function') {
        chrome.sidePanel.open({ tabId }).catch(() => {});
      }
    } else {
      // Side panel not open yet — open it, then retry
      if (typeof chrome?.sidePanel?.open === 'function') {
        chrome.sidePanel.open({ tabId }).catch(() => {});
        setTimeout(() => {
          const p = sidePanelPorts.get('sidepanel');
          if (p) p.postMessage(msg);
        }, 500);
      }
    }
  } else {
    sendToContentScript(tabId, msg);
  }
}

// ── Keyboard shortcuts + toolbar icon ───────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  const { displayMode } = await chrome.storage.local.get('displayMode');
  if (displayMode === 'sidepanel' && typeof chrome?.sidePanel?.open === 'function') {
    chrome.sidePanel.open({ tabId: tab.id });
  } else {
    sendToContentScript(tab.id, { type: 'TOGGLE_PANEL' });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'quick-summarize') {
    // Trigger summarize via context menu action handler reuse
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (typeof AIBubbleShared !== 'undefined') return AIBubbleShared.extractPageContent();
          const clone = document.body.cloneNode(true);
          ['script','style','noscript','svg','canvas','nav','header','footer','iframe','aside']
            .forEach(t => clone.querySelectorAll(t).forEach(e => e.remove()));
          return { url: location.href, title: document.title, text: clone.innerText.replace(/\s+/g,' ').trim().slice(0,12000), selection: '' };
        },
      });
      const ctx = result?.result;
      const prompt = ctx
        ? `Summarize this page:\n\nURL: ${ctx.url}\nTitle: ${ctx.title}\n\n${ctx.text.slice(0, 8000)}`
        : 'Summarize the current page.';
      sendAction(tab.id, { type: 'CONTEXT_MENU_ACTION', action: 'summarize', text: prompt });
    } catch {
      sendAction(tab.id, { type: 'CONTEXT_MENU_ACTION', action: 'summarize', text: 'Summarize the current page.' });
    }
  }
});

// ── Page extraction for side panel ──────────────────────────────────────────

async function handleExtractActiveTab(port) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { port.postMessage({ type: 'PAGE_CONTENT', error: 'No active tab' }); return; }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof AIBubbleShared !== 'undefined') return AIBubbleShared.extractPageContent();
        const clone = document.body.cloneNode(true);
        ['script','style','noscript','svg','canvas','nav','header','footer','iframe','aside']
          .forEach(t => clone.querySelectorAll(t).forEach(e => e.remove()));
        return { url: location.href, title: document.title, text: clone.innerText.replace(/\s+/g,' ').trim().slice(0,12000), selection: window.getSelection().toString().trim() };
      },
    });
    port.postMessage({ type: 'PAGE_CONTENT', ...(result?.result || {}) });
  } catch (err) {
    port.postMessage({ type: 'PAGE_CONTENT', error: err.message });
  }
}

// ── Existing handlers (unchanged logic) ─────────────────────────────────────

async function handleGetKey(port) {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  port.postMessage({ type: 'KEY_STATUS', hasKey: !!apiKey });
}

async function handleFetchOllamaModels(port) {
  const { ollamaHost } = await chrome.storage.local.get('ollamaHost');
  const host = ollamaHost || 'http://localhost:11434';
  try {
    const res = await fetch(`${host}/api/tags`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    port.postMessage({ type: 'OLLAMA_MODELS', models });
  } catch (err) {
    port.postMessage({ type: 'OLLAMA_MODELS_ERROR', error: err.message });
  }
}

async function tavilySearch(query, key) {
  try {
    const res = await fetch(TAVILY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, max_results: 3 }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.results || [])
      .map(r => `${r.title}: ${r.content}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

async function handleScreenshot(port, tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });
    const base64 = dataUrl.split(',')[1];
    port.postMessage({ type: 'SCREENSHOT_DATA', data: base64 });
  } catch (err) {
    port.postMessage({ type: 'SCREENSHOT_ERROR', error: err.message });
  }
}

function toOllamaMessages(messages, systemPrompt) {
  const result = [{ role: 'system', content: systemPrompt }];
  for (const m of messages) {
    const content = Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : (m.content || '');
    const images = Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'image').map(b => b.source.data)
      : [];
    const msg = { role: m.role, content };
    if (images.length) msg.images = images;
    result.push(msg);
  }
  return result;
}

async function readAnthropicSseStream(response, port, chunkType = 'CHUNK') {
  const reader  = response.body.getReader();
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
        if (evt.type === 'content_block_delta' && evt.delta?.text)
          port.postMessage({ type: chunkType, text: evt.delta.text });
      } catch { /* skip malformed */ }
    }
  }
}

async function handleSendHF(port, messages, model, workerUrl, workerSecret, systemPrompt) {
  const hfMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.filter(b => b.type === 'text').map(b => b.text).join('')
        : (m.content || ''),
    })),
  ];
  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bubble-Auth': workerSecret },
      body: JSON.stringify({ model, messages: hfMessages, stream: true }),
    });
    if (!response.ok) {
      port.postMessage({ type: 'ERROR', error: `HF Worker: ${response.statusText}` });
      return;
    }
    await readAnthropicSseStream(response, port, 'CHUNK');
    port.postMessage({ type: 'DONE' });
  } catch (err) {
    port.postMessage({ type: 'ERROR', error: err.message });
  }
}

async function handleSendContext(port, messages, workerUrl, workerSecret) {
  const hfMessages = messages.map(m => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : (m.content || ''),
  }));
  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bubble-Auth': workerSecret },
      body: JSON.stringify({ messages: hfMessages, mode: 'context', stream: true }),
    });
    if (!response.ok) return;
    await readAnthropicSseStream(response, port, 'CONTEXT_CHUNK');
    port.postMessage({ type: 'CONTEXT_DONE' });
  } catch { /* silent */ }
}

async function handleSendOllama(port, messages, model, host, systemPrompt) {
  const ollamaMessages = toOllamaMessages(messages, systemPrompt);
  try {
    const response = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: ollamaMessages, stream: true }),
    });

    if (!response.ok) {
      port.postMessage({ type: 'ERROR', error: `Ollama: ${response.statusText}` });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (!evt.done && evt.message?.content) {
            port.postMessage({ type: 'CHUNK', text: evt.message.content });
          }
        } catch { /* skip malformed */ }
      }
    }

    port.postMessage({ type: 'DONE' });
  } catch (err) {
    port.postMessage({ type: 'ERROR', error: err.message });
  }
}

async function handleSend(port, { messages, model, pageContext }) {
  const {
    apiKey, tavilyKey, provider, ollamaHost,
    hfWorkerUrl, hfWorkerSecret, hfChatModel, hfContextEnabled,
  } = await chrome.storage.local.get([
    'apiKey', 'tavilyKey', 'provider', 'ollamaHost',
    'hfWorkerUrl', 'hfWorkerSecret', 'hfChatModel', 'hfContextEnabled',
  ]);

  const isOllama = provider === 'ollama';
  const isHF     = provider === 'huggingface';

  if (!isOllama && !isHF && !apiKey) {
    port.postMessage({ type: 'NO_KEY' });
    return;
  }
  if (isHF && (!hfWorkerUrl || !hfWorkerSecret)) {
    port.postMessage({ type: 'ERROR', error: 'HF Worker URL or secret not configured in options.' });
    return;
  }

  // Build system prompt
  let systemPrompt = SYSTEM_PROMPT;

  // Page context enrichment
  if (pageContext && pageContext.text) {
    systemPrompt += `\n\nPage context:\nURL: ${pageContext.url || ''}\nTitle: ${pageContext.title || ''}\nContent: ${pageContext.text.slice(0, 8000)}`;
    if (pageContext.selection) {
      systemPrompt += `\n\nSelected text: ${pageContext.selection}`;
    }
  }

  // Tavily web search enrichment
  if (tavilyKey) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const queryText = Array.isArray(lastUser?.content)
      ? (lastUser.content.find(b => b.type === 'text')?.text || '')
      : (lastUser?.content || '');
    if (queryText) {
      const context = await tavilySearch(queryText, tavilyKey);
      if (context) systemPrompt += `\n\nWeb search context:\n${context}`;
    }
  }

  if (isHF) {
    await handleSendHF(
      port, messages,
      hfChatModel || 'meta-llama/Llama-3.1-8B-Instruct',
      hfWorkerUrl, hfWorkerSecret, systemPrompt
    );
    if (hfContextEnabled) {
      handleSendContext(port, messages, hfWorkerUrl, hfWorkerSecret);
    }
    return;
  }

  if (isOllama) {
    await handleSendOllama(
      port, messages, model,
      ollamaHost || 'http://localhost:11434',
      systemPrompt
    );
    if (hfContextEnabled && hfWorkerUrl && hfWorkerSecret) {
      handleSendContext(port, messages, hfWorkerUrl, hfWorkerSecret);
    }
    return;
  }

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
      port.postMessage({ type: 'ERROR', error: err?.error?.message || response.statusText });
      return;
    }

    const reader = response.body.getReader();
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
          if (evt.type === 'content_block_delta' && evt.delta?.text) {
            port.postMessage({ type: 'CHUNK', text: evt.delta.text });
          }
        } catch { /* skip malformed */ }
      }
    }

    port.postMessage({ type: 'DONE' });
    if (hfContextEnabled && hfWorkerUrl && hfWorkerSecret) {
      handleSendContext(port, messages, hfWorkerUrl, hfWorkerSecret);
    }
  } catch (err) {
    port.postMessage({ type: 'ERROR', error: err.message });
  }
}
