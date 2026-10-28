# Cloudflare HuggingFace Worker (cloudflare-hf-worker)

**Component:** `cloudflare-hf-worker/`
**Type:** Cloudflare Worker (serverless edge function)
**Total Lines:** ~170 (single source file)
**Runtime:** Cloudflare Workers (V8 isolate)

A standalone Cloudflare Worker that acts as a secure proxy between all bubble clients and the HuggingFace Inference Router. It keeps the HF token server-side, normalizes OpenAI-compatible SSE into Anthropic SSE format, and optionally runs a parallel contextualizing agent with a separate model.

## File Map

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/index.js` | ~170 | Worker entry: request handling, auth, SSE normalization, CORS |
| `package.json` | — | Node.js manifest (wrangler dependency) |
| `wrangler.toml.example` | — | Deployment config template with default models and CORS settings |

## Architecture

```
                    All Bubble Clients
                    (browser, desktop, website)
                           │
                  POST with X-Bubble-Auth
                           │
                           ▼
              ┌─────────────────────────┐
              │  Cloudflare Worker      │
              │                         │
              │  1. Validate auth       │
              │  2. Check CORS origin   │
              │  3. Route by mode:      │
              │     ├── "chat"    ──────┼──► HF Inference Router
              │     └── "context" ──────┼──► HF Inference Router
              │  4. Transform SSE       │     (different model)
              │     OpenAI → Anthropic  │
              │  5. Stream response     │
              └─────────────────────────┘
```

The Worker handles a single POST endpoint with two modes:

| Mode | Trigger | Model Source | System Prompt |
|------|---------|-------------|---------------|
| `chat` (default) | `mode` absent or `"chat"` | `HF_DEFAULT_MODEL` or request `model` field | Passthrough from client |
| `context` | `mode: "context"` | `HF_CONTEXT_MODEL` | Built-in second-opinion prompt |

## SSE Normalization

The HuggingFace Inference Router returns OpenAI-compatible SSE. The Worker transforms this to Anthropic-compatible SSE via the `openAiToAnthropicSse()` TransformStream so all bubble clients consume a single format.

**Input (OpenAI format):**
```
data: {"id":"...","choices":[{"delta":{"content":"Hello"},"index":0}]}
```

**Output (Anthropic format):**
```
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
```

The TransformStream also emits the required Anthropic lifecycle events:

```
event: message_start     → {"type":"message_start","message":{"role":"assistant"}}
event: content_block_start → {"type":"content_block_start","index":0}
... content_block_delta events ...
event: content_block_stop → {"type":"content_block_stop","index":0}
event: message_delta     → {"type":"message_delta","delta":{"stop_reason":"end_turn"}}
event: message_stop      → {"type":"message_stop"}
```

## Authentication

Every request must include the `X-Bubble-Auth` header with a value matching the `BUBBLE_SHARED_SECRET` secret.

- **Timing-safe comparison:** The Worker uses a constant-time string comparison to prevent timing attacks that could leak the secret length or content.
- **Missing or invalid header:** Returns HTTP 401 with `{"error": "Unauthorized"}`.
- The secret is set via `npx wrangler secret put BUBBLE_SHARED_SECRET` (never in `wrangler.toml`).

## CORS

The Worker enforces an origin allowlist configured via the `ALLOWED_ORIGINS` environment variable:

- Comma-separated list of allowed origins.
- **Prefix matching** for `chrome-extension://` — any extension ID is accepted.
- **Exact matching** for all other origins.
- Requests from disallowed origins receive no CORS headers (browser blocks the response).
- Preflight `OPTIONS` requests are handled with appropriate `Access-Control-Allow-*` headers.

Example configuration:
```
ALLOWED_ORIGINS = "https://yourdomain.com,chrome-extension://,tauri://localhost"
```

## Configuration

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `HF_TOKEN` | Secret | Yes | HuggingFace API token (set via `wrangler secret put`) |
| `BUBBLE_SHARED_SECRET` | Secret | Yes | Shared auth secret (set via `wrangler secret put`) |
| `HF_DEFAULT_MODEL` | Variable | No | Primary chat model (default: `meta-llama/Llama-3.1-8B-Instruct`) |
| `HF_CONTEXT_MODEL` | Variable | No | Context agent model (default: `Qwen/Qwen2.5-7B-Instruct`) |
| `ALLOWED_ORIGINS` | Variable | No | Comma-separated CORS origin allowlist |

**Secrets** are encrypted at rest and never appear in `wrangler.toml`. Set them with:
```bash
npx wrangler secret put HF_TOKEN
npx wrangler secret put BUBBLE_SHARED_SECRET
```

**Variables** are set in `wrangler.toml` under `[vars]` and can be changed without redeployment via the Cloudflare dashboard.

## Context Agent Mode

When `mode: "context"` is set in the request body, the Worker:

1. Routes to `HF_CONTEXT_MODEL` instead of `HF_DEFAULT_MODEL`.
2. Prepends a built-in system prompt instructing the model to act as a contextualizing agent:
   - Provide factual clarifications and corrections.
   - Offer alternative viewpoints or interpretations.
   - Flag caveats, limitations, or missing nuance.
   - Keep annotations concise and supplementary.
3. The response is streamed back in the same Anthropic-compatible SSE format.

Clients display context agent output in a collapsible annotation block beneath the primary AI reply.

## Custom and Private Models

The Worker supports any model available through the HuggingFace Inference Router:

- **Public models:** Set `HF_DEFAULT_MODEL` to the model ID (e.g., `meta-llama/Llama-3.1-8B-Instruct`).
- **Gated models:** The HF token's account must have accepted the model's license agreement on HuggingFace.
- **Private/custom models:** Supported if the HF token has access. The `wrangler.toml.example` references `cmndcntrlcyber/qwen14b-code-trainer-v6-gguf` as an example custom model.
- **Per-request override:** Clients can pass a `model` field in the request body to override the default.

The Worker forwards the `Authorization: Bearer hf_xxx` header to the HF Inference Router transparently.

## Cross-References

- [Deployment: Cloudflare Worker](../deployment/cloudflare-worker.md)
- [Security](../security/security.md)
- [Website Widget Component](website-bubble.md)
- [Browser Extension Component](browser-bubble.md)
- [Architecture Overview](../architecture/architecture.md)
