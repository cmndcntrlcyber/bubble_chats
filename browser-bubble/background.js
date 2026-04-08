// background.js — service worker
// Handles: API streaming, screenshots, API key storage

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const SYSTEM_PROMPT =
  'You are a helpful browser assistant powered by Claude. ' +
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

async function handleSend(port, { messages, model }) {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) {
    port.postMessage({ type: 'NO_KEY' });
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
        system: SYSTEM_PROMPT,
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
      buffer = lines.pop(); // keep incomplete line

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
  } catch (err) {
    port.postMessage({ type: 'ERROR', error: err.message });
  }
}
