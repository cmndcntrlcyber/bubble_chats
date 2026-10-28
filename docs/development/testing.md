# Testing

**Status:** Current
**Last Updated:** 2026-10-25

## Current State

No automated test suite exists across any component. The only testing tool is `website-bubble/playwright-contact.js`, a headless Chromium script for contact form submission validation.

All testing is currently manual, verified by running each component and exercising the chat flow against live LLM providers.

## Manual Testing Checklist

### Browser Extension

| Area | Verification |
|------|-------------|
| Bubble render | 56px bubble appears in bottom-right corner on any webpage |
| Drag | Bubble is draggable; panel repositions relative to bubble |
| Chat panel | Opens/closes on bubble click; resizable via corner handles |
| Anthropic streaming | Messages stream token-by-token via SSE |
| Ollama streaming | Messages stream via NDJSON when Ollama host is configured |
| HuggingFace streaming | Messages stream via CF Worker when Worker URL is configured |
| Model selector | Dropdown lists correct models for active provider |
| Screenshot capture | "📷" button captures visible tab as base64 PNG, sent as image content |
| Tavily search | When API key is set, web context is prepended to system prompt |
| Context agent | Collapsible "🔍 Context" annotation appears beneath each reply |
| Settings persistence | Options page saves/loads all provider configs across browser restarts |
| Shadow DOM | Chat UI styles do not leak into or inherit from host page |

### Linux Desktop

| Area | Verification |
|------|-------------|
| Window render | 64px floating bubble appears; always-on-top |
| Chat panel | Opens on bubble click; styled with C3S brand palette |
| Anthropic streaming | AIThread streams responses via GLib.idle_add |
| Ollama streaming | OllamaThread streams responses when host is configured |
| HuggingFace streaming | HFThread streams responses when Worker URL is configured |
| Screenshot capture | Captures full screen via PIL ImageGrab |
| Docker mode | `./run.sh` builds and runs with X11 passthrough |

### Windows Desktop

| Area | Verification |
|------|-------------|
| Window render | Tauri window appears bottom-right, 420×560, always-on-top |
| Chat flow | Anthropic responses returned (non-streaming) |
| Ollama flow | Ollama responses returned when host is configured |
| Screenshot capture | Screen captured via `screenshots` crate |
| Keyring storage | API keys persist in OS credential manager |
| Settings overlay | Provider toggle and config overlay functional |

### Website Widget

| Area | Verification |
|------|-------------|
| Bubble render | 56px bubble appears on page with Shadow DOM isolation |
| Chat streaming | Messages stream via /api/chat proxy |
| Contact form | `[SERVICE_INTEREST: ...]` token triggers form overlay |
| Discord delivery | Form submission POSTs embed to Discord webhook |
| Tavily context | Web search results prepended when API key is set |
| Context agent | Collapsible annotation beneath replies when enabled |
| CF Pages deploy | `functions/api/chat.js` and `context.js` serve correctly |

## Playwright Form Testing

The website widget includes a headless form submission tool for testing lead capture.

### Setup

```bash
cd website-bubble
npm install
npm run install-browsers    # Downloads Chromium for Playwright
```

### Usage

```bash
node playwright-contact.js \
  --name "Jane Smith" \
  --email "jane@example.com" \
  --phone "(555) 123-4567" \
  --scale "Small Business" \
  --services "General Inquiry"
```

The script launches headless Chromium, navigates to the local dev server, opens the chat bubble, triggers the contact form, fills all fields, and submits. Verify the Discord webhook receives the embed.

## Provider Smoke Tests

### Anthropic (Direct)

```bash
curl -N https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5-20250514",
    "max_tokens": 100,
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Expect: SSE stream with `event: content_block_delta` lines containing `text_delta` payloads.

### Ollama (Local)

```bash
curl -N http://localhost:11434/api/chat \
  -d '{
    "model": "llama3.2",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

Expect: NDJSON stream — one JSON object per line with `message.content` field.

### Cloudflare Worker — Chat Mode

```bash
curl -N -X POST "$HF_WORKER_URL" \
  -H "X-Bubble-Auth: $BUBBLE_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Llama-3.1-8B-Instruct",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

Expect: Anthropic-compatible SSE stream (OpenAI format converted by Worker).

### Cloudflare Worker — Context Mode

```bash
curl -N -X POST "$HF_WORKER_URL" \
  -H "X-Bubble-Auth: $BUBBLE_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What is quantum computing?"}],
    "mode": "context",
    "stream": true
  }'
```

Expect: Anthropic-compatible SSE stream from the context model (default: `Qwen/Qwen2.5-7B-Instruct`).

### Cloudflare Worker — Auth Rejection

```bash
curl -X POST "$HF_WORKER_URL" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

Expect: HTTP 401 Unauthorized.

## Recommended Test Strategy

The following test layers would provide meaningful coverage if implemented:

| Layer | Scope | Tooling |
|-------|-------|---------|
| Unit | SSE parsing functions (`readAnthropicSseStream`, `openAiToAnthropicSse`, NDJSON parser) | Jest (JS), pytest (Python), cargo test (Rust) |
| Unit | Message format construction, system prompt assembly | Same as above |
| Integration | Provider switching — verify correct endpoint, headers, and stream format per provider | Jest + nock/msw for HTTP mocking |
| Integration | Contact form submission → Discord webhook delivery | Jest + supertest against Express server |
| E2E | Full chat flow: bubble render → send message → receive streamed response | Playwright (all web-based components) |
| E2E | Cross-browser extension testing | Playwright with Chrome and Firefox extension loading |
| Visual regression | Shadow DOM UI consistency across host pages | Playwright screenshots + snapshot comparison |

## See Also

- [Getting Started](getting-started.md)
- [Troubleshooting](../troubleshooting/troubleshooting.md)
- [Enhancements and Roadmap](../enhancements/future.md)
