// background.js — service worker
// Handles: API streaming, screenshots, API key storage

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const TAVILY_API    = 'https://api.tavily.com/search';
const SYSTEM_PROMPT =
  'You are a helpful browser assistant. ' +
  'Be concise and practical. When analyzing screenshots, identify issues ' +
  'clearly and suggest specific fixes. Use plain text — no markdown headers.';

// Keep track of open ports
const ports = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-bubble') return;
  const tabId = port.sender?.tab?.id;
  if (tabId) ports.set(tabId, port);

  port.onDisconnect.addListener(() => {
    if (tabId) ports.delete(tabId);
  });

  port.onMessage.addListener(async (msg) => {
    switch (msg.type) {
      case 'SEND':
        await handleSend(port, msg);
        break;
      case 'SCREENSHOT':
        await handleScreenshot(port, tabId);
        break;
      case 'GET_KEY':
        await handleGetKey(port);
        break;
      case 'FETCH_OLLAMA_MODELS':
        await handleFetchOllamaModels(port);
        break;
    }
  });
});

// Open options page when toolbar icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

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
    // Strip the data:image/png;base64, prefix
    const base64 = dataUrl.split(',')[1];
    port.postMessage({ type: 'SCREENSHOT_DATA', data: base64 });
  } catch (err) {
    port.postMessage({ type: 'SCREENSHOT_ERROR', error: err.message });
  }
}

// Convert Anthropic-format messages to Ollama's simpler format,
// prepending the system prompt as a system role message.
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

// Shared SSE reader that parses Anthropic-compatible SSE chunks and posts them to the port.
// Used by both handleSendHF and can be reused for any Anthropic-SSE source.
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
    if (!response.ok) return; // silent — context is non-critical
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

async function handleSend(port, { messages, model }) {
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

  // Build system prompt, optionally enriched with Tavily web search context
  let systemPrompt = SYSTEM_PROMPT;
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
