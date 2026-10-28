# Browser Extension Deployment

**Component:** `browser-bubble/`
**Target:** Chrome 88+ / Firefox 109+
**Build Step:** None — load unpacked directly

## Prerequisites

- Chrome 88+ or Firefox 109+
- At least one LLM provider configured:
  - Anthropic API key, **or**
  - Ollama running locally, **or**
  - Deployed [Cloudflare HF Worker](cloudflare-worker.md) with shared secret

## Chrome Installation

1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `browser-bubble/` directory
5. The bubble icon appears in the extensions toolbar

## Firefox Installation

1. Navigate to `about:debugging`
2. Click **This Firefox** in the sidebar
3. Click **Load Temporary Add-on**
4. Select any file inside `browser-bubble/` (e.g. `manifest.json`)
5. The extension loads for the current session

Firefox temporary add-ons are removed on browser restart. For persistent installation, package as a signed `.xpi`.

## Options Page Configuration

Open the extension Options page (right-click extension icon → **Options**, or `chrome://extensions` → **Details** → **Extension options**).

### Provider Tabs

The Options page has three provider tabs:

**Anthropic (Claude)**
- Enter your `ANTHROPIC_API_KEY`
- Select a model: Haiku 4.5 (default), Sonnet 4.6, or Opus 4.6

**Ollama**
- Enter the Ollama host URL (e.g. `http://localhost:11434`)
- The model dropdown auto-populates from `/api/tags`
- Optionally set a fallback model name

**HF (CF Worker)**
- Enter your Worker URL (e.g. `https://bubble-hf-worker.YOUR_ACCOUNT.workers.dev`)
- Enter the shared secret (must match `BUBBLE_SHARED_SECRET` on the Worker)
- Optionally change the model ID (default: `meta-llama/Llama-3.1-8B-Instruct`)

### Tavily Web Search

- Enter your Tavily API key to enable search context prepended to each request
- Top 3 search results are injected into the system prompt

### Contextualizing Agent

- Click **Enable** to show a collapsible "Context" annotation beneath each AI reply
- Requires HF Worker to be configured (uses the `HF_CONTEXT_MODEL`)

## HuggingFace Provider Setup

1. Deploy the [Cloudflare Worker](cloudflare-worker.md)
2. Open the extension Options page
3. Click the **HF (CF Worker)** tab
4. Enter the Worker URL
5. Enter the shared secret
6. Optionally change the Model ID
7. Click **Save**
8. Optionally enable the Contextualizing Agent

## Permissions Required

| Permission | Type | Purpose |
|---|---|---|
| `activeTab` | Extension | Access current tab content |
| `tabs` | Extension | Tab metadata for screenshot capture |
| `storage` | Extension | Persist API keys and settings |
| `scripting` | Extension | Inject content script into pages |
| `*://*.anthropic.com/*` | Host | Direct Anthropic API calls |
| `*://*.tavily.com/*` | Host | Tavily search API calls |
| `<all_urls>` | Host | Inject bubble UI into any page |

**Firefox-specific:** Gecko ID `ai-bubble@cmndcntrl`, minimum version 109.0.

## Updating

1. Pull or copy the latest `browser-bubble/` source
2. Navigate to `chrome://extensions` (or `about:debugging` in Firefox)
3. Click the **Reload** button on the extension card
4. Settings are preserved in `chrome.storage.local`

## Known Issues

- Firefox temporary add-ons lose all `storage.local` data on browser restart
- The bubble may briefly flicker on pages with aggressive CSS resets (Shadow DOM mitigates most conflicts)
- Screenshot capture requires the tab to be visible (`chrome.tabs.captureVisibleTab`)
