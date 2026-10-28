# Browser Extension (browser-bubble)

**Component:** `browser-bubble/`
**Type:** Chrome/Firefox Extension (Manifest V3)
**Total Lines:** ~1,452 across 4 source files
**Browsers:** Chrome 88+, Firefox 109+

A Manifest V3 browser extension that injects a draggable floating chat bubble into every webpage. Supports three LLM providers with streaming responses, screenshot capture for visual context, and an optional contextualizing agent.

## File Map

| File | Lines | Responsibility |
|------|-------|----------------|
| `manifest.json` | — | Extension manifest: permissions, content scripts, service worker registration |
| `background.js` | ~340 | Service worker: API streaming (Anthropic, Ollama, HF), screenshot capture, Tavily search, model list fetching |
| `content.js` | ~676 | Injected UI: Shadow DOM chat bubble, panel, message rendering, resize/drag |
| `options.html` | ~197 | Settings page markup: provider tabs, API key inputs, agent toggle |
| `options.js` | ~239 | Settings page logic: save/load config from `chrome.storage.local` |
| `icons/` | — | Extension icons: `icon16.png`, `icon48.png`, `icon128.png` |

## Architecture

```
┌─────────────────────────────────────────────┐
│  content.js (every page, Shadow DOM)        │
│  ┌───────────┐  ┌────────────────────────┐  │
│  │ 56px      │  │ Chat Panel (400x540)   │  │
│  │ Bubble    │──│ Messages + Input        │  │
│  │ (drag)    │  │ Model Selector          │  │
│  └───────────┘  └─────────┬──────────────┘  │
│                           │ chrome.runtime   │
│                           │ .connect()       │
└───────────────────────────┼─────────────────┘
                            │ Port messaging
┌───────────────────────────┼─────────────────┐
│  background.js (service worker)             │
│                           │                 │
│  ┌────────────┐ ┌────────┴───────┐         │
│  │ Screenshot │ │ API Router     │         │
│  │ Capture    │ │                │         │
│  └────────────┘ │ Anthropic SSE  │         │
│                 │ Ollama NDJSON  │         │
│                 │ HF Worker SSE  │         │
│                 └────────────────┘         │
│  ┌────────────┐ ┌────────────────┐         │
│  │ Tavily     │ │ Model List     │         │
│  │ Search     │ │ Fetch          │         │
│  └────────────┘ └────────────────┘         │
└─────────────────────────────────────────────┘
```

The extension uses a two-process model:

- **Service worker** (`background.js`) handles all network I/O — API calls, streaming, screenshot capture, and search. It runs in the extension's background context with full API access.
- **Content script** (`content.js`) manages the visible UI inside a Shadow DOM root on every page. It communicates with the service worker via `chrome.runtime.onConnect` port messaging.

This separation keeps API keys out of page context and avoids CORS restrictions that would block direct API calls from content scripts.

## LLM Providers

All providers stream responses back to the content script via port messaging. The active provider is set in the Options page and persisted in `chrome.storage.local`.

| Provider | Protocol | Endpoint | Streaming Format |
|----------|----------|----------|-----------------|
| Anthropic (Claude) | HTTPS | `api.anthropic.com/v1/messages` | SSE with `content_block_delta` events |
| Ollama | HTTP | `{OLLAMA_HOST}/api/chat` | NDJSON lines, converted to text chunks |
| HuggingFace (CF Worker) | HTTPS | `{HF_WORKER_URL}` | Anthropic-compatible SSE (normalized by Worker) |

**Provider priority:** The UI uses whichever provider is selected in settings. The service worker reads provider config from `chrome.storage.local` on each request.

**Available models:**
- Anthropic: Haiku 4.5 (default), Sonnet 4.6, Opus 4.6
- Ollama: dynamically fetched from `/api/tags` endpoint
- HuggingFace: configurable model ID (default `meta-llama/Llama-3.1-8B-Instruct`)

**Shared SSE parser:** `readAnthropicSseStream()` in `background.js` is used by both the Anthropic and HF code paths, since the CF Worker normalizes HF output to Anthropic format.

## UI Components

The content script builds the entire UI inside a Shadow DOM root to prevent host-page style conflicts.

| Component | Specification |
|-----------|--------------|
| Bubble | 56px circle, fixed position, draggable, click toggles panel |
| Chat Panel | 400x540px default, resizable via corner handles |
| Message List | Scrollable, auto-scroll on new content, markdown rendering |
| Input Area | Auto-growing textarea, Enter to send, Shift+Enter for newline |
| Model Selector | Dropdown populated based on active provider |
| Settings Gear | Opens extension Options page |
| Screenshot Button | Captures visible tab, attaches to next message |

## Screenshot Capture

1. User clicks the screenshot button in the chat panel.
2. Content script sends a `captureScreenshot` message to the service worker.
3. Service worker calls `chrome.tabs.captureVisibleTab()` to get a base64 PNG of the active tab.
4. The PNG is included as an `image` content block in Anthropic message format:
   ```json
   {
     "type": "image",
     "source": {
       "type": "base64",
       "media_type": "image/png",
       "data": "<base64>"
     }
   }
   ```
5. The image block is prepended to the user's next message when sent to the LLM.

## Tavily Integration

When a Tavily API key is configured:

1. The last user message text is sent as a search query to `https://api.tavily.com/search`.
2. The top 3 results (title + URL + content snippet) are formatted as a context block.
3. This context is prepended to the system prompt before calling the LLM.
4. The search runs on every user message — there is no caching or deduplication.

## Contextualizing Agent

When enabled in settings, a parallel inference call runs alongside the primary LLM response:

1. The user's message is sent to the CF Worker with `mode: 'context'`.
2. The Worker routes this to a separate model (`HF_CONTEXT_MODEL`, default `Qwen/Qwen2.5-7B-Instruct`) with a system prompt instructing it to provide factual clarifications, alternative viewpoints, and caveats.
3. The response streams into a collapsible annotation block beneath the primary AI reply.

The context agent requires a deployed CF Worker and HF provider configuration.

## Options Page

Three provider tabs with provider-specific configuration fields:

| Tab | Fields |
|-----|--------|
| **Anthropic** | API Key, Model selector (Haiku/Sonnet/Opus) |
| **Ollama** | Host URL, Model selector (auto-populated from `/api/tags`) |
| **HF (CF Worker)** | Worker URL, Shared Secret, Model ID, Context Agent toggle |

Additional settings:
- Tavily API Key (applies to all providers)
- Contextualizing Agent enable/disable

The page uses a Catppuccin-inspired dark theme with `#fab387` orange accents.

## Manifest Permissions

| Permission | Reason |
|------------|--------|
| `activeTab` | Screenshot capture of the current tab |
| `tabs` | Access tab URL for context |
| `storage` | Persist API keys and settings in `chrome.storage.local` |
| `scripting` | Inject content script into pages |
| `host_permissions: <all_urls>` | Inject bubble UI on every page |
| `host_permissions: api.anthropic.com` | Direct Anthropic API calls from service worker |
| `host_permissions: api.tavily.com` | Tavily search API calls from service worker |

**Firefox-specific:** Gecko ID `ai-bubble@cmndcntrl`, minimum version 109.0.

## Cross-References

- [Deployment: Browser Extension](../deployment/browser-extension.md)
- [Security: Credential Storage](../security/security.md)
- [Cloudflare HF Worker](cloudflare-hf-worker.md)
- [Architecture Overview](../architecture/architecture.md)
