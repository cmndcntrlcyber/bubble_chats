# API Reference

**Status:** Current
**Last Updated:** 2026-10-25

## LLM Provider APIs

All bubble clients consume LLM responses in Anthropic SSE format. The Cloudflare Worker normalizes other formats (OpenAI-compatible SSE from HuggingFace, NDJSON from Ollama) into this canonical format.

### Anthropic Messages API

**Endpoint:** `https://api.anthropic.com/v1/messages`

**Headers:**

| Header | Value |
|--------|-------|
| `x-api-key` | Anthropic API key |
| `anthropic-version` | `2023-06-01` |
| `content-type` | `application/json` |

**Models:**

| Display Name | Model ID |
|-------------|----------|
| Haiku 4.5 (default) | `claude-haiku-4-5-20250514` |
| Sonnet 4.6 | `claude-sonnet-4-6-20250514` |
| Opus 4.6 | `claude-opus-4-6-20250514` |

**Request body:**

```json
{
  "model": "claude-haiku-4-5-20250514",
  "max_tokens": 8192,
  "stream": true,
  "system": "You are a helpful assistant.",
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}
```

**Screenshot attachment (image content block):**

```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "What do you see in this screenshot?"},
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/png",
        "data": "<base64-encoded-png>"
      }
    }
  ]
}
```

### Ollama Chat API

**Chat endpoint:** `{OLLAMA_HOST}/api/chat` (default: `http://localhost:11434/api/chat`)

**Model listing:** `{OLLAMA_HOST}/api/tags` — returns `{"models": [{"name": "llama3.2", ...}, ...]}`

**Request body:**

```json
{
  "model": "llama3.2",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello"}
  ],
  "stream": true
}
```

**Response format:** NDJSON (newline-delimited JSON) — one object per line:

```json
{"model":"llama3.2","message":{"role":"assistant","content":"Hi"},"done":false}
{"model":"llama3.2","message":{"role":"assistant","content":" there"},"done":false}
{"model":"llama3.2","message":{"role":"assistant","content":"!"},"done":true}
```

### HuggingFace via Cloudflare Worker

**Endpoint:** Deployed Worker URL (e.g., `https://bubble-hf-worker.YOUR_ACCOUNT.workers.dev`)

**Headers:**

| Header | Value |
|--------|-------|
| `X-Bubble-Auth` | Shared secret matching `BUBBLE_SHARED_SECRET` |
| `Content-Type` | `application/json` |

**Request body (chat mode):**

```json
{
  "model": "meta-llama/Llama-3.1-8B-Instruct",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": true
}
```

**Request body (context mode):**

```json
{
  "messages": [
    {"role": "user", "content": "What is quantum computing?"}
  ],
  "mode": "context",
  "stream": true
}
```

In context mode, the Worker uses the `HF_CONTEXT_MODEL` (default: `Qwen/Qwen2.5-7B-Instruct`) and prepends a system prompt instructing the model to provide factual clarifications, alternative viewpoints, and caveats.

**Response format:** Anthropic-compatible SSE (converted from OpenAI format by the Worker).

## SSE Format Reference

All bubble clients parse the Anthropic SSE event stream. Events arrive as `text/event-stream` with the following types:

| Event Type | Purpose | Key Fields |
|-----------|---------|------------|
| `message_start` | Stream begins | `message.id`, `message.model`, `message.role` |
| `content_block_start` | New content block | `index`, `content_block.type` |
| `content_block_delta` | Token chunk | `index`, `delta.type` ("text_delta"), `delta.text` |
| `content_block_stop` | Block complete | `index` |
| `message_delta` | Message metadata update | `delta.stop_reason`, `usage.output_tokens` |
| `message_stop` | Stream ends | (empty) |

**Example stream:**

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_01...","type":"message","role":"assistant","model":"claude-haiku-4-5-20250514","content":[]}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}

event: message_stop
data: {"type":"message_stop"}
```

## SSE Normalization

The Cloudflare Worker converts OpenAI-compatible SSE (from HuggingFace Inference Router) into Anthropic-compatible SSE using a `TransformStream`.

**Conversion mapping:**

| OpenAI SSE Field | Anthropic SSE Field |
|-----------------|-------------------|
| `choices[0].delta.content` | `delta.text` (inside `content_block_delta`) |
| `choices[0].finish_reason` | `delta.stop_reason` (inside `message_delta`) |
| `[DONE]` sentinel | `message_stop` event |

The Worker emits synthetic `message_start`, `content_block_start`, and `content_block_stop` events to match the full Anthropic event lifecycle. This allows all bubble clients to use a single SSE parser regardless of the upstream provider.

## Internal Endpoints

### `/api/chat` — Chat Proxy

**Used by:** Website widget (dev server via Express, production via CF Pages function)

**Method:** POST

**Request:** Same as Anthropic Messages API request body. The server injects the API key and proxies to the active provider (HF Worker > Ollama > Anthropic, by priority).

**Response:** Proxied SSE stream from the upstream provider.

**Implementation:** `website-bubble/server.js` (dev), `website-bubble/functions/api/chat.js` (prod)

### `/api/contact` — Lead Capture

**Used by:** Website widget contact form

**Method:** POST

**Request body:**

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "(555) 123-4567",
  "scale": "Small Business",
  "services": "General Inquiry"
}
```

**Behavior:** Constructs a Discord embed and POSTs it to the `DISCORD_WEBHOOK_URL`. Returns `200 OK` on success.

**Implementation:** `website-bubble/server.js` (route handler)

### `/api/context` — Context Agent Proxy

**Used by:** Website widget (when contextualizing agent is enabled)

**Method:** POST

**Request:** Same as chat, but proxied to the CF Worker in `mode: "context"`.

**Response:** Anthropic-compatible SSE stream from the context model.

**Implementation:** `website-bubble/functions/api/context.js` (CF Pages function)

## Message Format

All clients construct messages in Anthropic format internally:

**Text message:**

```json
{"role": "user", "content": "What is the weather today?"}
```

**Message with screenshot:**

```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "What do you see?"},
    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}}
  ]
}
```

Screenshot capture methods per platform:

| Platform | Method | Format |
|----------|--------|--------|
| Browser extension | `chrome.tabs.captureVisibleTab()` | base64 PNG |
| Linux desktop | PIL `ImageGrab.grab()` | base64 PNG |
| Windows desktop | `screenshots` crate `Screen::capture()` | base64 PNG |

## Tavily Search API

**Endpoint:** `https://api.tavily.com/search`

**Used by:** All clients when `TAVILY_API_KEY` is configured.

**Behavior:** The last user message text is sent as a search query. The top 3 results (title + content) are prepended to the system prompt as contextual information before the LLM call.

**Request:**

```json
{
  "api_key": "<TAVILY_API_KEY>",
  "query": "<user message text>",
  "max_results": 3
}
```

**Integration point:** Each client calls Tavily before assembling the LLM request, injecting results into the system prompt.

## See Also

- [Configuration Reference](../configuration/configuration.md)
- [Component Reference — Cloudflare Worker](../components/cloudflare-hf-worker.md)
- [Security](../security/security.md)
