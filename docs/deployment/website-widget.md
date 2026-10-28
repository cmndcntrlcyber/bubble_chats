# Website Widget Deployment

**Component:** `website-bubble/`
**Target:** Any web page (embeddable widget)
**Runtime:** Express 4.x (dev) / Cloudflare Pages (production)

## Local Development

### Prerequisites

- Node.js 18+
- At least one LLM provider API key

### Steps

```bash
cd website-bubble
npm install
cp .env.example .env
# Edit .env with your API keys
npm start
```

The Express dev server runs on `http://localhost:3000` (configurable via `PORT`).

The dev server auto-injects `bubble.js` into any HTML response via middleware, so the widget appears on every page served.

### Provider Priority

When multiple providers are configured, the server selects in this order:

1. **HF Worker** — if `HF_WORKER_URL` and `HF_WORKER_SECRET` are set
2. **Ollama** — if `OLLAMA_HOST` is set
3. **Anthropic** — fallback using `ANTHROPIC_API_KEY`

## Cloudflare Pages Production

### Steps

1. Push the `website-bubble/` directory to a Git repository connected to Cloudflare Pages
2. Set environment variables as **encrypted secrets** under **Pages → Settings → Environment Variables**:

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (unless HF) | — | Claude API key |
| `DISCORD_WEBHOOK_URL` | No | — | Lead capture delivery endpoint |
| `TAVILY_API_KEY` | No | — | Web search context enrichment |
| `HF_WORKER_URL` | No | — | Deployed Worker URL — takes priority when set |
| `HF_WORKER_SECRET` | No | — | Must match `BUBBLE_SHARED_SECRET` on Worker |
| `HF_CHAT_MODEL` | No | `meta-llama/Llama-3.1-8B-Instruct` | HuggingFace model ID |
| `HF_CONTEXT_ENABLED` | No | `false` | Set `true` to enable context agent |

3. Cloudflare Pages auto-deploys two serverless functions:
   - `functions/api/chat.js` — LLM proxy with the same three-path priority
   - `functions/api/context.js` — contextualizing agent stream via CF Worker

## Embedding the Widget

Add the following to any HTML page:

```html
<script>
  window.BUBBLE_CONFIG = {
    chatEndpoint: '/api/chat',
    contactEndpoint: '/api/contact',
    title: 'AI Assistant',
    accentColor: '#0924a5',
    welcomeMessage: 'How can I help you today?',
    tavilyApiKey: ''   // optional — enables client-side search context
  };
</script>
<script src="/js/bubble.js"></script>
```

### BUBBLE_CONFIG Options

| Option | Type | Default | Description |
|---|---|---|---|
| `chatEndpoint` | string | `/api/chat` | API proxy endpoint for LLM calls |
| `contactEndpoint` | string | `/api/contact` | Contact form submission endpoint |
| `title` | string | `'AI Assistant'` | Chat panel header title |
| `icon` | string | — | Custom bubble icon (emoji or URL) |
| `accentColor` | string | `'#0924a5'` | Primary accent color (C3S blue) |
| `welcomeMessage` | string | `'How can I help?'` | Initial greeting in chat panel |
| `tavilyApiKey` | string | — | Client-side Tavily key for search context |

The widget injects itself inside a Shadow DOM to prevent host-page style conflicts.

## Lead Capture

The website widget includes a contact form triggered by the LLM's response.

### Flow

1. The system prompt instructs the LLM to append `[SERVICE_INTEREST: <service>]` when it detects user intent to engage
2. The widget parses this token and strips it from the visible reply
3. A contact form overlay appears (name, email, phone, scale, services)
4. Submissions POST to `contactEndpoint` (`/api/contact`)
5. The server forwards a formatted embed to the configured Discord webhook

### Discord Webhook Setup

Set `DISCORD_WEBHOOK_URL` to a Discord channel webhook URL. Lead submissions arrive as rich embeds with all form fields.

## Playwright Form Testing

A headless form submission script is included for automated lead capture testing.

### Setup

```bash
npm run install-browsers   # install Playwright Chromium
```

### Run

```bash
node playwright-contact.js \
  --name "Jane Smith" \
  --email "jane@example.com" \
  --phone "(555) 123-4567" \
  --scale "Small Business" \
  --services "General Inquiry"
```

The script launches headless Chromium, navigates to the local dev server, opens the chat bubble, fills the contact form, and submits.
