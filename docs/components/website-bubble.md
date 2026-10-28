# Website Widget (website-bubble)

**Component:** `website-bubble/`
**Type:** Embeddable JavaScript widget + serverless backend
**Total Lines:** ~1,141 across 5 source files
**Deployment:** Express (dev) or Cloudflare Pages (production)

A self-contained drop-in JavaScript widget that adds a floating AI chat bubble to any website. Includes contact form lead capture with Discord webhook delivery, SSE streaming across all three LLM providers, and an optional contextualizing agent.

## File Map

| File | Lines | Responsibility |
|------|-------|----------------|
| `js/bubble.js` | ~516 | Self-contained widget: Shadow DOM UI, chat logic, streaming, lead capture |
| `server.js` | ~318 | Express dev server: API proxy (3 providers), contact form handler, HTML injection |
| `functions/api/chat.js` | ~180 | Cloudflare Pages serverless function: production API proxy with provider routing |
| `functions/api/context.js` | ~72 | Cloudflare Pages function: contextualizing agent proxy to CF Worker |
| `playwright-contact.js` | ~55 | Headless Chromium script for automated contact form testing |
| `package.json` | — | Node.js manifest and scripts |
| `.env.example` | — | Environment variable template |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Host Website                                           │
│                                                         │
│  ┌─── Shadow DOM ────────────────────────────────────┐  │
│  │  bubble.js (self-contained widget)                │  │
│  │                                                   │  │
│  │  ┌──────────┐  ┌──────────────────────────────┐   │  │
│  │  │ Bubble   │  │ Chat Panel                   │   │  │
│  │  │ (56px)   │──│  Messages + Streaming        │   │  │
│  │  │          │  │  Contact Form Overlay         │   │  │
│  │  └──────────┘  │  Context Agent Annotations   │   │  │
│  │                └──────────┬───────────────────┘   │  │
│  └───────────────────────────┼───────────────────────┘  │
│                              │ fetch()                   │
└──────────────────────────────┼──────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │  Server (Express OR Cloudflare Pages)       │
        │                      │                      │
        │  Provider Priority:  │                      │
        │  1. HF Worker URL    │                      │
        │  2. Ollama Host      │                      │
        │  3. Anthropic API    │                      │
        │                      │                      │
        │  /api/chat ──────────┤                      │
        │  /api/context ───────┤                      │
        │  /api/contact ───────┤──► Discord Webhook   │
        └─────────────────────────────────────────────┘
```

**`bubble.js`** is fully self-contained — it creates its entire UI inside a Shadow DOM root, including styles. No external CSS or dependencies required. Configuration is provided via `window.BUBBLE_CONFIG` before the script loads.

**Two deployment paths:**
- **Development:** `server.js` (Express) proxies API calls and injects `bubble.js` into HTML responses automatically.
- **Production:** Cloudflare Pages serves static files; `functions/api/chat.js` and `functions/api/context.js` handle API proxying as serverless functions.

## BUBBLE_CONFIG Options

Configure the widget by setting `window.BUBBLE_CONFIG` before loading `bubble.js`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chatEndpoint` | `string` | `'/api/chat'` | Server-side chat API path |
| `contactEndpoint` | `string` | `'/api/contact'` | Contact form submission path |
| `title` | `string` | `'AI Assistant'` | Panel header title |
| `icon` | `string` | `'💬'` | Bubble icon |
| `accentColor` | `string` | `'#0924a5'` | Primary accent color |
| `welcomeMessage` | `string` | (built-in) | First message shown in chat |
| `tavilyApiKey` | `string` | `null` | Client-side Tavily key for search context |

```html
<script>
  window.BUBBLE_CONFIG = {
    chatEndpoint: '/api/chat',
    contactEndpoint: '/api/contact',
    title: 'C3S Assistant',
    accentColor: '#0924a5'
  };
</script>
<script src="/js/bubble.js"></script>
```

## Lead Capture Flow

The website widget includes an AI-driven lead capture mechanism:

```
User message ──► LLM (with system prompt containing service list)
                    │
                    ▼
              AI detects purchase/engagement intent
                    │
                    ▼
              AI appends [SERVICE_INTEREST: <service>] token
                    │
                    ▼
         bubble.js parses and strips token from visible reply
                    │
                    ▼
         Contact form overlay appears (name, email, phone, scale, services)
                    │
                    ▼
         POST /api/contact ──► Discord webhook embed
```

1. The system prompt instructs the LLM to append `[SERVICE_INTEREST: <service>]` when it detects user intent to engage with a specific service.
2. `bubble.js` parses the AI response, strips the token from the displayed text, and shows a contact form overlay.
3. Form submissions POST to `/api/contact` with fields: name, email, phone, scale, services.
4. The server formats the submission as a Discord embed and sends it to the configured `DISCORD_WEBHOOK_URL`.

## SSE Proxy

Both `server.js` and `functions/api/chat.js` implement the same three-path provider routing:

| Priority | Provider | Condition | Format |
|----------|----------|-----------|--------|
| 1 | HuggingFace (CF Worker) | `HF_WORKER_URL` is set | Anthropic-compatible SSE (already normalized) |
| 2 | Ollama | `OLLAMA_HOST` is set | NDJSON → SSE via `ollamaNdjsonToSseStream()` |
| 3 | Anthropic | `ANTHROPIC_API_KEY` is set | Native SSE |

**Ollama NDJSON conversion:** The `ollamaNdjsonToSseStream()` TransformStream reads Ollama's newline-delimited JSON and converts each chunk to an Anthropic-compatible SSE event, so `bubble.js` only needs one SSE parser regardless of provider.

## Contextualizing Agent

A separate endpoint handles the optional context agent:

- **Dev:** `server.js` proxies `/api/context` to the CF Worker with `mode: 'context'`.
- **Prod:** `functions/api/context.js` does the same.

The context response streams into a collapsible annotation block beneath each primary AI reply.

## Playwright Testing

`playwright-contact.js` provides automated contact form testing:

```bash
npm run install-browsers   # install Chromium
node playwright-contact.js \
  --name "Jane Smith" \
  --email "jane@example.com" \
  --phone "(555) 123-4567" \
  --scale "Small Business" \
  --services "General Inquiry"
```

The script launches headless Chromium, navigates to the local dev server, triggers the contact form, fills in the provided fields, and submits. Useful for verifying the Discord webhook delivery pipeline.

## Cross-References

- [Deployment: Website Widget](../deployment/website-widget.md)
- [Deployment: Cloudflare Worker](../deployment/cloudflare-worker.md)
- [Cloudflare HF Worker Component](cloudflare-hf-worker.md)
- [Security](../security/security.md)
- [Architecture Overview](../architecture/architecture.md)
