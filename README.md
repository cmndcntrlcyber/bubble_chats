# bubble-chats

A multi-platform AI assistant suite that provides AI-powered floating chat bubbles across browser extensions, Linux desktop, and web widgets. Currently compatable with Claude, Ollama, and a Cloudflare Worker that serves models served from HuggingFace.  

## Repository Structure

```
bubble-chats/
├── browser-bubble/         # Chrome/Firefox extension (Manifest V3)
├── cloudflare-hf-worker/   # CF Worker — secure HuggingFace proxy + context agent
├── desktop-bubble/         # GTK3 Python desktop app (Linux)
└── website-bubble/         # Drop-in web widget (Node.js / Cloudflare Pages)
```

---

## cloudflare-hf-worker

A standalone Cloudflare Worker that acts as a secure proxy between the bubble clients and the [HuggingFace Inference Router](https://huggingface.co/docs/inference-providers). It keeps your HF token server-side, normalises OpenAI-compatible SSE into the Anthropic SSE format that all bubble clients already consume, and optionally runs a parallel "contextualising agent" that streams a second-opinion annotation beneath each AI reply.

### Prerequisites

- [Node.js 18+](https://nodejs.org) and npm
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- A [HuggingFace token](https://huggingface.co/settings/tokens) with the **"Make calls to Inference Providers"** permission enabled

### Deploy

```bash
cd cloudflare-hf-worker
npm install

# Deploy the Worker to Cloudflare
npx wrangler deploy
```

Set the two required secrets (you will be prompted to paste each value):

```bash
npx wrangler secret put HF_TOKEN
# Paste your HuggingFace token: hf_...

npx wrangler secret put BUBBLE_SHARED_SECRET
# Paste a random secret shared with all clients — generate one with:
#   openssl rand -hex 32
```

### Configuration

Edit `wrangler.toml` to adjust default models and allowed origins before deploying:

```toml
[vars]
HF_DEFAULT_MODEL = "meta-llama/Llama-3.1-8B-Instruct"  # primary chat model
HF_CONTEXT_MODEL = "Qwen/Qwen2.5-7B-Instruct"          # contextualising agent model

# Comma-separated list of allowed origins.
# Use "chrome-extension://" as a prefix match for the browser extension.
ALLOWED_ORIGINS  = "https://yourdomain.com,chrome-extension://,tauri://localhost"
```

### Smoke test

After deploying, verify the Worker is responding correctly:

```bash
# Replace with your actual Worker URL and secret
WORKER_URL="https://bubble-hf-worker.YOUR_ACCOUNT.workers.dev"
SECRET="your-shared-secret"

# Primary chat call — expect Anthropic-SSE lines
curl -N -X POST "$WORKER_URL" \
  -H "X-Bubble-Auth: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"model":"meta-llama/Llama-3.1-8B-Instruct","messages":[{"role":"user","content":"Hello"}],"stream":true}'

# Context-agent call
curl -N -X POST "$WORKER_URL" \
  -H "X-Bubble-Auth: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is quantum computing?"}],"mode":"context","stream":true}'

# Missing auth — expect 401
curl -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

### Private / gated models

Set `HF_DEFAULT_MODEL` (or pass `model` per-request) to any model ID the HF token's account has accepted the licence for. The Worker forwards the `Authorization: Bearer hf_xxx` header to the Inference Router transparently.

---

## browser-bubble

A Chrome and Firefox extension that injects a draggable floating chat bubble into every webpage, with optional screenshot capture for visual troubleshooting.

### Prerequisites

- Chrome 88+ or Firefox 109+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

1. Clone or download this repo.
2. Open `chrome://extensions` (or `about:debugging` in Firefox).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `browser-bubble/` folder.
5. Open the extension **Options** page and enter your Anthropic API key.

### Features

- Floating bubble fixed to the bottom-right corner (draggable)
- Three LLM providers selectable from the Options page:
  - **Anthropic (Claude)** — Haiku 4.5, Sonnet 4.6, Opus 4.6
  - **Ollama** — any locally running model, with live model-list fetch
  - **HuggingFace via CF Worker** — any public or private HF model via the Worker above
- Screenshot capture for visual context
- Optional Tavily web search context prepended to every request
- Optional contextualising agent (collapsible "🔍 Context" annotation per reply)
- All keys and config stored securely in `chrome.storage.local`

### HuggingFace provider setup

After deploying the Worker, open the extension **Options** page and:

1. Click the **HF (CF Worker)** provider tab.
2. Enter your Worker URL (e.g. `https://bubble-hf-worker.YOUR_ACCOUNT.workers.dev`).
3. Enter the shared secret you set with `wrangler secret put BUBBLE_SHARED_SECRET`.
4. Optionally change the Model ID (defaults to `meta-llama/Llama-3.1-8B-Instruct`).
5. Click **Save**.
6. To enable the contextualising agent, click **Enable** in the "Contextualizing Agent" section.

---

## desktop-bubble

A native Linux desktop application built with GTK3 and Python that provides a floating Claude chat window on your desktop.

### Prerequisites

- Docker & Docker Compose (recommended), **or**
- Python 3.10+, GTK3, and an X11 display

### Installation & Usage

**Via Docker (recommended):**

```bash
cd desktop-bubble
export ANTHROPIC_API_KEY=sk-ant-...
./run.sh
```

`run.sh` validates your API key and runs `docker compose up --build`, passing through your X11 display.

**Without Docker:**

```bash
pip install -r desktop-bubble/requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python desktop-bubble/bubble.py
```

### Configuration

Copy `desktop-bubble/linux-desktop-bubble/.env` (or set environment variables directly):

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `DISPLAY` | Yes | X11 display (usually `:0`) |
| `OLLAMA_HOST` | No | e.g. `http://localhost:11434` |
| `OLLAMA_MODEL` | No | Fallback model name if host auto-fetch fails |
| `TAVILY_API_KEY` | No | Enables live web search context |
| `HF_WORKER_URL` | No | Full Worker URL — enables the HF model dropdown entry |
| `HF_WORKER_SECRET` | No | Shared secret matching `BUBBLE_SHARED_SECRET` on the Worker |
| `HF_CHAT_MODEL` | No | HF model ID (default: `meta-llama/Llama-3.1-8B-Instruct`) |
| `HF_CONTEXT_ENABLED` | No | Set `true` to show a contextualising annotation after each reply |

When `HF_WORKER_URL` and `HF_WORKER_SECRET` are set, an `HF — <model>` entry appears automatically in the in-app model dropdown.

---

## website-bubble

A drop-in JavaScript widget that adds a floating Claude-powered chat bubble to any website. Includes contact form lead capture, Discord webhook delivery, and optional Tavily search integration.

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- (Optional) [Tavily API key](https://tavily.com) for service research context
- (Optional) Discord webhook URL for lead delivery

### Installation

```bash
cd website-bubble
npm install
cp .env.example .env
# Edit .env with your API keys
npm start
```

The dev server runs on `http://localhost:3000` (configurable via `PORT`).

### Configuration

Copy `.env.example` to `.env` and fill in:

```env
ANTHROPIC_API_KEY=your-anthropic-api-key-here
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_TOKEN
TAVILY_API_KEY=your-tavily-api-key-here   # optional
PORT=3000                                  # optional, default 3000

# HuggingFace via CF Worker (optional — takes priority over Anthropic and Ollama when set)
HF_WORKER_URL=https://bubble-hf-worker.YOUR_ACCOUNT.workers.dev
HF_WORKER_SECRET=your-shared-secret-here
HF_CHAT_MODEL=meta-llama/Llama-3.1-8B-Instruct
HF_CONTEXT_ENABLED=false
```

### Embedding the Widget

Add to any HTML page:

```html
<script>
  window.BUBBLE_CONFIG = {
    // optional overrides
  };
</script>
<script src="/js/bubble.js"></script>
```

### Deployment to Cloudflare Pages

> If you want to use HuggingFace models on the website widget, deploy the Worker first (see [cloudflare-hf-worker](#cloudflare-hf-worker) above).

1. Push to a Git repository connected to Cloudflare Pages.
2. Set your environment variables as encrypted secrets under **Pages → Settings → Environment Variables**:

   | Variable | Required | Notes |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Yes (unless using HF Worker) | Claude API key |
   | `DISCORD_WEBHOOK_URL` | No | Lead capture via Discord |
   | `TAVILY_API_KEY` | No | Web search context |
   | `HF_WORKER_URL` | No | Your deployed Worker URL — takes priority when set |
   | `HF_WORKER_SECRET` | No | Must match `BUBBLE_SHARED_SECRET` on the Worker |
   | `HF_CHAT_MODEL` | No | Default: `meta-llama/Llama-3.1-8B-Instruct` |
   | `HF_CONTEXT_ENABLED` | No | Set `true` to enable the context agent |

3. The `functions/api/chat.js` serverless function handles API proxying automatically. A separate `functions/api/context.js` function serves the contextualising agent stream.

### Playwright Form Automation

A headless form submission script is included for automated lead capture testing:

```bash
node playwright-contact.js \
  --name "Jane Smith" \
  --email "jane@example.com" \
  --phone "(555) 123-4567" \
  --scale "Small Business" \
  --services "General Inquiry"
```

Install the Playwright browser first:

```bash
npm run install-browsers
```

---

## License

MIT
