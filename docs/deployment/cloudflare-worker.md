# Cloudflare Worker Deployment

**Component:** `cloudflare-hf-worker/`
**Target:** Cloudflare Workers edge runtime
**Purpose:** Secure proxy between bubble clients and HuggingFace Inference Router

The Worker keeps HuggingFace tokens server-side, normalizes OpenAI-compatible SSE into the Anthropic SSE format that all bubble clients already consume, and optionally runs a parallel contextualizing agent.

## Prerequisites

- Node.js 18+ and npm
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- A [HuggingFace token](https://huggingface.co/settings/tokens) with the **"Make calls to Inference Providers"** permission enabled

## Deploy

```bash
cd cloudflare-hf-worker
npm install

# Deploy the Worker to Cloudflare
npx wrangler deploy
```

## Secrets Setup

Set the two required secrets (you will be prompted to paste each value):

```bash
npx wrangler secret put HF_TOKEN
# Paste your HuggingFace token: hf_...

npx wrangler secret put BUBBLE_SHARED_SECRET
# Paste a random secret shared with all clients:
#   openssl rand -hex 32
```

| Secret | Required | Description |
|---|---|---|
| `HF_TOKEN` | Yes | HuggingFace API token with Inference Provider permission |
| `BUBBLE_SHARED_SECRET` | Yes | Shared authentication secret — must match client configs |

## Configuration

Edit `wrangler.toml` before deploying (copy `wrangler.toml.example` as a starting point):

```toml
[vars]
HF_DEFAULT_MODEL = "meta-llama/Llama-3.1-8B-Instruct"   # primary chat model
HF_CONTEXT_MODEL = "Qwen/Qwen2.5-7B-Instruct"           # contextualizing agent model
ALLOWED_ORIGINS  = "https://yourdomain.com,chrome-extension://,tauri://localhost"
```

| Variable | Default | Description |
|---|---|---|
| `HF_DEFAULT_MODEL` | `meta-llama/Llama-3.1-8B-Instruct` | Model used for primary chat requests |
| `HF_CONTEXT_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | Model used for contextualizing agent |
| `ALLOWED_ORIGINS` | — | Comma-separated CORS origin allowlist |

## Operating Modes

The Worker accepts POST requests with a JSON body and operates in two modes:

### Chat Mode (default)

Standard chat inference using `HF_DEFAULT_MODEL` (or a per-request `model` override).

```json
{
  "model": "meta-llama/Llama-3.1-8B-Instruct",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```

### Context Mode

Contextualizing agent inference using `HF_CONTEXT_MODEL`. Adds a system prompt instructing the model to provide factual clarifications, alternative viewpoints, and caveats.

```json
{
  "messages": [{"role": "user", "content": "What is quantum computing?"}],
  "mode": "context",
  "stream": true
}
```

## SSE Format Normalization

The Worker converts OpenAI-compatible SSE from HuggingFace:

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
```

Into Anthropic-compatible SSE that all bubble clients consume:

```
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}
```

This is implemented as a `TransformStream` (`openAiToAnthropicSse()`) that processes chunks in-flight.

## CORS Configuration

The `ALLOWED_ORIGINS` variable accepts a comma-separated list of origins.

- Exact match for full URLs: `https://yourdomain.com`
- Prefix match for extensions: `chrome-extension://` matches any extension origin
- Tauri apps: `tauri://localhost`

Requests from unlisted origins receive a 403 response.

## Authentication

All requests must include the `X-Bubble-Auth` header with the shared secret:

```
X-Bubble-Auth: your-shared-secret
```

The Worker uses timing-safe string comparison to validate the secret, preventing timing-based attacks. Missing or incorrect secrets receive a 401 response.

## Smoke Test

After deploying, verify the Worker is responding:

```bash
WORKER_URL="https://bubble-hf-worker.YOUR_ACCOUNT.workers.dev"
SECRET="your-shared-secret"

# Primary chat — expect Anthropic-SSE lines
curl -N -X POST "$WORKER_URL" \
  -H "X-Bubble-Auth: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"model":"meta-llama/Llama-3.1-8B-Instruct","messages":[{"role":"user","content":"Hello"}],"stream":true}'

# Context agent
curl -N -X POST "$WORKER_URL" \
  -H "X-Bubble-Auth: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is quantum computing?"}],"mode":"context","stream":true}'

# Missing auth — expect 401
curl -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

## Private and Gated Models

Set `HF_DEFAULT_MODEL` (or pass `model` per-request) to any model ID that the HF token's account has accepted the license for. The Worker forwards the `Authorization: Bearer hf_xxx` header to the Inference Router transparently.

To use a private or gated model:

1. Visit the model page on HuggingFace
2. Accept the model's license agreement
3. Set the model ID in `wrangler.toml` or pass it per-request
