# Browser Extension (browser-bubble)

**Component:** `browser-bubble/`
**Type:** Chrome/Firefox Extension (Manifest V3)
**Version:** 2.0.0
**Total Lines:** ~3,174 across 7 source files
**Browsers:** Chrome 88+, Firefox 109+

A Manifest V3 browser extension that provides an AI assistant via a floating chat bubble or Chrome side panel. Supports three LLM providers with streaming responses, page content reading, text selection actions, context menus, slash commands, writing assistance, conversation persistence, screenshot capture, and an optional contextualizing agent.

## File Map

| File | Lines | Responsibility |
|------|-------|----------------|
| `manifest.json` | ~63 | Extension manifest: permissions, content scripts, service worker, side panel, commands |
| `shared.js` | ~604 | Shared module: CSS, chat helpers, page extraction, slash commands, conversation CRUD |
| `background.js` | ~489 | Service worker: API streaming, screenshots, context menus, keyboard shortcuts, page extraction relay, side panel port routing |
| `content.js` | ~716 | Injected UI: Shadow DOM bubble/panel, selection awareness, writing actions, slash autocomplete, conversation list |
| `sidepanel.html` | ~280 | Side panel page markup |
| `sidepanel.js` | ~498 | Side panel logic: chat, page extraction via scripting API, selection relay |
| `options.html` | ~249 | Settings page: display mode, provider tabs, page context, shortcuts, conversation management |
| `options.js` | ~338 | Settings page logic |
| `icons/` | — | Extension icons: `icon16.png`, `icon48.png`, `icon128.png` |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  content.js (every page, Shadow DOM)                │
│  ┌───────────┐  ┌──────────────────────────────┐    │
│  │ 56px      │  │ Chat Panel (400x540)         │    │
│  │ Bubble    │──│ Messages + Selection + Input  │    │
│  │ (drag)    │  │ Slash Commands + Writing Help │    │
│  └───────────┘  │ Conversation List             │    │
│                 └──────────┬───────────────────┘    │
│                            │ chrome.runtime          │
│   Selection relay ─────────┤ .connect()              │
│   onMessage listener ──────┤                         │
└────────────────────────────┼────────────────────────┘
                             │ Port messaging
┌────────────────────────────┼────────────────────────┐
│  background.js (service worker)                     │
│                            │                        │
│  ┌──────────────┐ ┌───────┴─────────┐              │
│  │ Context Menu │ │ API Router      │              │
│  │ + Shortcuts  │ │                 │              │
│  └──────┬───────┘ │ Anthropic SSE   │              │
│         │         │ Ollama NDJSON   │              │
│         │         │ HF Worker SSE   │              │
│  sendAction()     └─────────────────┘              │
│  (mode-aware      ┌─────────────────┐              │
│   routing)        │ Page Extraction  │              │
│         │         │ + Selection Relay│              │
│         ▼         └─────────────────┘              │
│  ┌──────────────┐                                  │
│  │ Side Panel   │◄── sidepanel.js connects here    │
│  │ Port Routing │                                  │
│  └──────────────┘                                  │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  sidepanel.html + sidepanel.js (Chrome side panel) │
│  Full chat UI, page extraction via scripting API,  │
│  selection updates relayed from content.js          │
└────────────────────────────────────────────────────┘
```

## Display Modes

| Mode | Description | Activation |
|------|-------------|------------|
| **Floating Bubble** (default) | 56px draggable circle on every page, opens a resizable chat panel | Set in Options or via Ctrl+Shift+B |
| **Side Panel** | Chrome native side panel, full-height, no bubble injection | Set in Options; toolbar icon opens side panel |

In side panel mode, `content.js` still runs on every page but only relays text selection events — it does not inject any visible UI.

## New Features (v2.0)

### Page Content Reading
Toggle the "Page" button to include the current page's text content with messages. The extractor clones the DOM, strips non-content elements (script, style, nav, etc.), and truncates to 12,000 chars. Appended to the system prompt as page context.

### Text Selection Awareness
When text is selected on any page, a selection indicator appears in the input area. The selection is automatically prepended to the next message. In side panel mode, selection events are relayed from the content script via the background service worker.

### Writing Assistance
When text is selected, quick-action buttons appear: **Rewrite**, **Shorter**, **Longer**, **Fix Grammar**, **Change Tone**. Each sends a pre-built prompt with the selection. AI responses include a "Copy" button.

### Context Menu
Right-click selected text for: "Ask AI Bubble about this", "Explain this", "Translate this", "Rewrite this". Right-click on a page (no selection) for "Summarize this page". Actions are mode-aware — they route to the bubble panel or side panel based on the current display mode.

### Slash Commands
Type `/` in the input for autocomplete: `/summarize`, `/explain`, `/translate`, `/rewrite`, `/code`. Commands use page content and/or text selection as context.

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+B` | Toggle bubble panel / open side panel |
| `Ctrl+Shift+S` | Quick-summarize current page |

Customizable at `chrome://extensions/shortcuts`.

### Conversation Persistence
Conversations auto-save to `chrome.storage.local` after each AI response. Features:
- Conversation list with title, message count, and relative timestamps
- Switch between conversations, create new, delete old
- Auto-prune at 100 conversations (oldest deleted first)
- Export all conversations as JSON from Options page

### PDF Content Extraction
When the current tab displays a PDF, the page extractor attempts to read text from Chrome's built-in PDF viewer shadow DOM or Firefox's PDF.js viewer DOM. Falls back gracefully if extraction is unavailable.

## LLM Providers

All providers stream responses back via port messaging. The active provider is set in Options.

| Provider | Protocol | Endpoint | Streaming Format |
|----------|----------|----------|-----------------|
| Anthropic (Claude) | HTTPS | `api.anthropic.com/v1/messages` | SSE with `content_block_delta` events |
| Ollama | HTTP | `{OLLAMA_HOST}/api/chat` | NDJSON lines |
| HuggingFace (CF Worker) | HTTPS | `{HF_WORKER_URL}` | Anthropic-compatible SSE |

**Available models:**
- Anthropic: Haiku 4.5, Sonnet 4.6, Opus 4.6
- Ollama: dynamically fetched from `/api/tags`
- HuggingFace: configurable model ID (default `meta-llama/Llama-3.1-8B-Instruct`)

## Storage Keys

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `apiKey` | string | — | Anthropic API key |
| `tavilyKey` | string | — | Tavily search API key |
| `provider` | string | `'anthropic'` | Active LLM provider |
| `ollamaHost` | string | — | Ollama server URL |
| `ollamaModel` | string | — | Selected Ollama model |
| `hfWorkerUrl` | string | — | CF Worker proxy URL |
| `hfWorkerSecret` | string | — | CF Worker auth secret |
| `hfChatModel` | string | — | HF model ID |
| `hfContextEnabled` | boolean | `false` | Contextualizing agent toggle |
| `displayMode` | string | `'bubble'` | `'bubble'` or `'sidepanel'` |
| `pageContextDefault` | boolean | `false` | Auto-include page content |
| `conversations` | object | `{}` | Saved conversation data |
| `activeConversationId` | string | `null` | Currently active conversation |

## Manifest Permissions

| Permission | Reason |
|------------|--------|
| `activeTab` | Screenshot capture, page extraction |
| `tabs` | Tab URL/title access, tab activation events |
| `storage` | Persist settings and conversations |
| `scripting` | Inject scripts, extract page content |
| `contextMenus` | Right-click actions |
| `sidePanel` | Chrome side panel mode |
| `host_permissions: <all_urls>` | Inject UI on every page |
| `host_permissions: api.anthropic.com` | Anthropic API calls |
| `host_permissions: api.tavily.com` | Tavily search calls |

**Firefox:** Gecko ID `ai-bubble@cmndcntrl`, minimum 109.0. Side panel features gracefully degrade (hidden in options, `sidePanel` permission ignored).

## Cross-References

- [Deployment: Browser Extension](../deployment/browser-extension.md)
- [Security: Credential Storage](../security/security.md)
- [Cloudflare HF Worker](cloudflare-hf-worker.md)
- [Architecture Overview](../architecture/architecture.md)
