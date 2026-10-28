# Configuration

**Status:** Current
**Date:** 2026-10-25

All bubble-chats components are configured through environment variables. No component uses a dedicated config file format — `.env` files (loaded by `dotenv` libraries) and platform-specific storage are the only configuration surfaces.

---

## Master Environment Variable Reference

| Variable | Used By | Required | Default | Description |
|----------|---------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | All clients, website-bubble server | Yes (unless HF Worker is sole provider) | — | Anthropic API key for Claude models |
| `OLLAMA_HOST` | All clients | No | — | Ollama instance URL (e.g. `http://localhost:11434`) |
| `OLLAMA_MODEL` | All clients | No | `llama3.2` | Default Ollama model when host auto-fetch is unavailable |
| `TAVILY_API_KEY` | All clients | No | — | Tavily API key for web search context enrichment |
| `DISCORD_WEBHOOK_URL` | website-bubble | No | — | Discord webhook for lead capture delivery |
| `PORT` | website-bubble | No | `3000` | Express dev server port |
| `DISPLAY` | linux-desktop-bubble | Yes (Linux) | `:0` | X11 display for GTK3 rendering |
| `HF_WORKER_URL` | All clients | No | — | Deployed Cloudflare Worker URL for HuggingFace inference |
| `HF_WORKER_SECRET` | All clients | No | — | Shared secret matching `BUBBLE_SHARED_SECRET` on the Worker |
| `HF_CHAT_MODEL` | All clients | No | `meta-llama/Llama-3.1-8B-Instruct` | HuggingFace model ID for primary chat |
| `HF_CONTEXT_ENABLED` | All clients (except windows-desktop) | No | `false` | Set `true` to enable the contextualizing agent |
| `HF_TOKEN` | cloudflare-hf-worker (secret) | Yes | — | HuggingFace API token with Inference Providers permission |
| `BUBBLE_SHARED_SECRET` | cloudflare-hf-worker (secret) | Yes | — | Shared auth secret validated via `X-Bubble-Auth` header |
| `HF_DEFAULT_MODEL` | cloudflare-hf-worker (var) | No | `meta-llama/Llama-3.1-8B-Instruct` | Worker-side default chat model |
| `HF_CONTEXT_MODEL` | cloudflare-hf-worker (var) | No | `Qwen/Qwen2.5-7B-Instruct` | Worker-side contextualizing agent model |
| `ALLOWED_ORIGINS` | cloudflare-hf-worker (var) | No | — | Comma-separated CORS origin allowlist |

---

## Per-Component Configuration

### Browser Extension

The browser extension stores all configuration in `chrome.storage.local`, set via the extension Options page (`options.html`).

**Options page settings:**

| Setting | Storage Key | Provider Tab | Description |
|---------|------------|--------------|-------------|
| Anthropic API Key | `apiKey` | Anthropic | Claude API key |
| Anthropic Model | `model` | Anthropic | One of: `claude-haiku-4-5-20250514`, `claude-sonnet-4-6-20250827`, `claude-opus-4-6-20250827` |
| Ollama Host | `ollamaHost` | Ollama | Ollama instance URL |
| Ollama Model | `ollamaModel` | Ollama | Selected from live model list fetch |
| HF Worker URL | `hfWorkerUrl` | HF (CF Worker) | Deployed Worker URL |
| HF Worker Secret | `hfWorkerSecret` | HF (CF Worker) | Shared auth secret |
| HF Chat Model | `hfChatModel` | HF (CF Worker) | HuggingFace model ID |
| Context Agent | `hfContextEnabled` | HF (CF Worker) | Boolean toggle |
| Tavily API Key | `tavilyApiKey` | — | Web search enrichment key |
| Active Provider | `provider` | — | `anthropic`, `ollama`, or `hf` |

No `.env` file is used. All keys persist in browser local storage and survive extension updates.

### Linux Desktop (`linux-desktop-bubble/`)

Configuration via `.env` file or exported environment variables. Copy `.env.example` to `.env`:

```bash
cp desktop-bubble/linux-desktop-bubble/.env.example desktop-bubble/linux-desktop-bubble/.env
```

**Docker passthrough:** `docker-compose.yml` forwards `ANTHROPIC_API_KEY` and `DISPLAY` from the host environment. Additional variables in `.env` are loaded by `python-dotenv` inside the container.

**Required for Docker:** `ANTHROPIC_API_KEY` must be set in the host shell before running `./run.sh`. The script validates its presence and exits with an error if missing.

### Windows Desktop (`windows-desktop-bubble/`)

Configuration via `.env` file in the project root. Copy `.env.example` to `.env`:

```bash
cp desktop-bubble/windows-desktop-bubble/.env.example desktop-bubble/windows-desktop-bubble/.env
```

**Keyring storage:** API keys entered through the settings overlay are stored in the OS keyring via the `keyring` crate (service name: `windows-desktop-bubble`). Functions:

| Rust Function | Operation | Keyring Entry |
|--------------|-----------|---------------|
| `store_key(service, key)` | Write | `windows-desktop-bubble/{key}` |
| `get_key(service, key)` | Read | `windows-desktop-bubble/{key}` |
| `delete_key(service, key)` | Delete | `windows-desktop-bubble/{key}` |

**Limitation:** The Windows desktop client currently supports only Anthropic and Ollama providers. HuggingFace Worker and contextualizing agent configuration variables are accepted but unused.

### Website Widget (`website-bubble/`)

**Development:** Configuration via `.env` file. Copy `.env.example` to `.env`:

```bash
cp website-bubble/.env.example website-bubble/.env
```

**Production (Cloudflare Pages):** Set environment variables as encrypted secrets in the CF dashboard under **Pages → Settings → Environment Variables**. The serverless functions in `functions/api/` read these at runtime.

**Client-side embed configuration:** The widget accepts runtime overrides via `window.BUBBLE_CONFIG`:

```javascript
window.BUBBLE_CONFIG = {
  chatEndpoint: '/api/chat',       // API proxy path
  contactEndpoint: '/api/contact', // Lead capture path
  contextEndpoint: '/api/context', // Context agent path
  title: 'AI Assistant',           // Panel header title
  welcomeMessage: '...',           // Initial greeting
  accentColor: '#0924a5',          // Brand accent
  tavilyApiKey: '...',             // Client-side Tavily (dev only)
};
```

### Cloudflare Worker (`cloudflare-hf-worker/`)

Configuration uses two mechanisms:

**Wrangler variables** (in `wrangler.toml`, committed as `wrangler.toml.example`):

```toml
[vars]
HF_DEFAULT_MODEL = "meta-llama/Llama-3.1-8B-Instruct"
HF_CONTEXT_MODEL = "Qwen/Qwen2.5-7B-Instruct"
ALLOWED_ORIGINS  = "https://yourdomain.com,chrome-extension://,tauri://localhost"
```

**Wrangler secrets** (set via CLI, never committed):

```bash
npx wrangler secret put HF_TOKEN            # HuggingFace API token
npx wrangler secret put BUBBLE_SHARED_SECRET # Shared client auth secret
```

Variables are visible in the Cloudflare dashboard. Secrets are encrypted and never displayed after setting.

---

## Provider Selection Cascade

When multiple providers are configured, clients select the active provider using a priority cascade:

```
HF_WORKER_URL set?  ──yes──►  HuggingFace via Cloudflare Worker
        │
        no
        │
        ▼
OLLAMA_HOST set?    ──yes──►  Ollama (local inference)
        │
        no
        │
        ▼
ANTHROPIC_API_KEY   ──yes──►  Anthropic Claude (cloud)
```

The browser extension and desktop apps override this cascade with an in-app provider selector. The website widget follows the cascade strictly — the highest-priority configured provider is used.

---

## Supported Models

| Provider | Models | Notes |
|----------|--------|-------|
| Anthropic Claude | `claude-haiku-4-5-20250514` (default), `claude-sonnet-4-6-20250827`, `claude-opus-4-6-20250827` | Direct API calls to `api.anthropic.com/v1/messages`. `anthropic-version: 2023-06-01` header. |
| Ollama | Any locally installed model | Model list fetched dynamically from `{host}/api/tags`. Falls back to `OLLAMA_MODEL` env var if fetch fails. |
| HuggingFace (via CF Worker) | Any public or gated model | Default: `meta-llama/Llama-3.1-8B-Instruct`. Gated models require HF token with accepted license. Alternative models listed in `wrangler.toml.example` include `cmndcntrlcyber/qwen14b-code-trainer-v6-gguf`. |
| HuggingFace Context Agent | `Qwen/Qwen2.5-7B-Instruct` (default) | Used only for the contextualizing agent. Configurable via `HF_CONTEXT_MODEL`. |

---

## Related Documents

- [Architecture](../architecture/architecture.md) — provider priority, SSE normalization, credential storage model
- [Security](../security/security.md) — credential handling, API key rotation, CORS configuration
- [Deployment Index](../deployment/README.md) — per-component deployment guides with config steps
- [Cloudflare Worker Deployment](../deployment/cloudflare-worker.md) — wrangler secrets and variable setup
