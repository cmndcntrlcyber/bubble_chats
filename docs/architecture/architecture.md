# Architecture

**Status:** Current
**Date:** 2026-10-25

---

## Overview

bubble-chats consists of four independent client codebases and one serverless proxy, all sharing the same UX pattern: a 56px (or 64px) draggable floating bubble that opens a ~400x540px chat panel. Each client reimplements the chat UI, streaming logic, and provider handling independently in its own language and framework.

Three LLM providers are supported across all clients: Anthropic Claude (direct API), local Ollama, and HuggingFace models via a Cloudflare Worker proxy that normalizes SSE formats. An optional contextualizing agent runs a parallel inference call to produce a collapsible annotation beneath each reply.

---

## System Topology

```
                          ┌──────────────────────────────────┐
                          │         LLM Providers            │
                          │                                  │
                          │  ┌───────────┐  ┌─────────────┐  │
                          │  │ Anthropic │  │   Ollama     │  │
                          │  │ Claude API│  │ (local)      │  │
                          │  └─────▲─────┘  └──────▲──────┘  │
                          │        │               │         │
                          │  ┌─────┼───────────────┼──────┐  │
                          │  │     │    CF Worker   │      │  │
                          │  │     │   (HF proxy)  │      │  │
                          │  │     │  ┌─────────┐  │      │  │
                          │  │     │  │HuggingFace│ │      │  │
                          │  │     │  │ Inference│  │      │  │
                          │  │     │  └─────▲───┘  │      │  │
                          │  │     │        │      │      │  │
                          │  └─────┼────────┼──────┼──────┘  │
                          └────────┼────────┼──────┼─────────┘
                                   │        │      │
              ┌────────────────────┼────────┼──────┼───────────────┐
              │                    │        │      │               │
    ┌─────────▼──────┐  ┌─────────▼──┐  ┌──▼──────▼──┐  ┌────────▼───────┐
    │ Browser Bubble  │  │  Linux     │  │  Windows   │  │ Website Bubble │
    │ (Extension)     │  │  Desktop   │  │  Desktop   │  │ (Widget)       │
    │                 │  │  (GTK3)    │  │  (Tauri)   │  │                │
    │ Chrome/Firefox  │  │  Python    │  │  Rust+JS   │  │ JS / CF Pages  │
    │ Manifest V3     │  │  Docker    │  │  Keyring   │  │ Express (dev)  │
    └─────────────────┘  └───────────┘  └────────────┘  └────────────────┘
```

---

## Component Map

| Component | Language | Framework | Source Lines | Feature Status |
|-----------|----------|-----------|-------------|----------------|
| `browser-bubble/` | JavaScript | Chrome Manifest V3 | ~1,452 | Full (Claude + Ollama + HF + Context Agent) |
| `desktop-bubble/linux-desktop-bubble/` | Python | GTK3 / PyGObject | ~989 | Full (Claude + Ollama + HF + Context Agent) |
| `desktop-bubble/windows-desktop-bubble/` | Rust + JavaScript | Tauri v2 | ~974 | Partial (Claude + Ollama only, no HF, no Context Agent, no streaming) |
| `website-bubble/` | JavaScript | Express / CF Pages | ~1,141 | Full (Claude + Ollama + HF + Context Agent + Lead Capture) |
| `cloudflare-hf-worker/` | JavaScript | Cloudflare Workers | ~170 | Complete |

**Total source:** ~4,726 lines across all components.

---

## Data Flow

### Chat Message Lifecycle

```
 User types message in chat panel
          │
          ▼
 ┌─────────────────────┐
 │  Provider Selection  │    Priority: HF Worker > Ollama > Anthropic
 └────────┬────────────┘
          │
          ├── Anthropic ──► POST api.anthropic.com/v1/messages
          │                   (streaming SSE, Anthropic format)
          │
          ├── Ollama ─────► POST {host}/api/chat
          │                   (streaming NDJSON → converted to Anthropic SSE
          │                    in website-bubble; native NDJSON in others)
          │
          └── HF Worker ──► POST {worker_url}
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Cloudflare Worker   │
                    │  X-Bubble-Auth check │
                    │  ────────────────    │
                    │  POST router.        │
                    │  huggingface.co      │
                    │  /v1/chat/completions│
                    │  ────────────────    │
                    │  OpenAI SSE →        │
                    │  Anthropic SSE       │
                    │  (TransformStream)   │
                    └──────────┬──────────┘
                               │
                               ▼
              Anthropic-format SSE stream
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Client SSE Parser  │
                    │  readAnthropicSse   │
                    │  Stream()           │
                    └──────────┬──────────┘
                               │
                               ▼
                  Tokens rendered incrementally
                  in the chat panel
```

### Optional Enrichments (per-request)

1. **Tavily Web Search:** When `TAVILY_API_KEY` is configured, the user's last message is sent to `api.tavily.com/search`. The top 3 results are prepended to the system prompt as context before calling the LLM.

2. **Screenshot Capture:** The user can attach a screenshot of their current view. The image is base64-encoded and sent as an `image` content block in the Anthropic message format.

3. **Contextualizing Agent:** When enabled, a parallel inference call runs using a separate open-source model (see below). Its response appears as a collapsible annotation beneath the primary reply.

---

## SSE Normalization

All bubble clients consume a single SSE wire format — the Anthropic Messages API streaming format:

```
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
```

The Cloudflare Worker translates HuggingFace's OpenAI-compatible SSE format into this Anthropic format using a `TransformStream`:

| OpenAI SSE (HuggingFace) | Anthropic SSE (all clients) |
|--------------------------|----------------------------|
| `{"choices":[{"delta":{"content":"Hello"}}]}` | `{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}` |
| `[DONE]` | `{"type":"message_stop"}` |

This means adding a new HuggingFace model requires zero client-side changes — only the Worker's `HF_DEFAULT_MODEL` variable needs updating.

For Ollama, the `website-bubble` serverless function (`functions/api/chat.js`) performs a similar conversion from Ollama's NDJSON streaming format to Anthropic SSE via `ollamaNdjsonToSseStream()`. The browser extension and desktop clients handle Ollama's NDJSON natively.

---

## Shadow DOM Isolation

Both `browser-bubble` and `website-bubble` inject their entire UI inside a Shadow DOM tree. This prevents host-page CSS from breaking the chat panel and prevents the bubble's styles from leaking into the host page.

```
<div id="ai-bubble-root">
  #shadow-root (open)
    <style>/* all bubble CSS */</style>
    <div class="bubble-container">
      <div class="bubble-btn">...</div>
      <div class="chat-panel">...</div>
    </div>
</div>
```

The Linux and Windows desktop apps do not use Shadow DOM — they run in their own OS-level windows with no style conflict risk.

---

## Credential Storage

| Platform | Mechanism | Scope | Notes |
|----------|-----------|-------|-------|
| Browser Extension | `chrome.storage.local` | Per-extension, synced across devices if Chrome Sync enabled | Set via Options page |
| Linux Desktop (Python) | Environment variables / `.env` file | Process-scoped | Loaded by `python-dotenv`; Docker passes via `--env-file` |
| Windows Desktop (Tauri) | OS keyring (`keyring` crate) | Per-user, OS-managed | Service name: `windows-desktop-bubble` |
| Website Widget (dev) | `.env` file | Process-scoped | Loaded by `dotenv` in Express server |
| Website Widget (prod) | CF Pages encrypted secrets | Deploy-time, server-side only | Set in CF dashboard under Pages → Settings |
| CF Worker | Wrangler secrets | Deploy-time, server-side only | Set via `wrangler secret put` |

See [Security](../security/security.md) for the full credential handling model.

---

## Lead Capture Flow

The website widget includes an AI-driven lead capture system:

```
 User expresses interest in services during chat
          │
          ▼
 ┌─────────────────────────────┐
 │  LLM system prompt includes │
 │  instruction to append      │
 │  [SERVICE_INTEREST: <svc>]  │
 │  token when intent detected │
 └──────────┬──────────────────┘
            │
            ▼
 ┌──────────────────────────────┐
 │  Widget parses response for  │
 │  [SERVICE_INTEREST:] token   │
 │  ─────────────────────────   │
 │  • Strip token from visible  │
 │    reply text                │
 │  • Show contact form overlay │
 └──────────┬───────────────────┘
            │
            ▼
 ┌──────────────────────────────┐
 │  User fills contact form     │
 │  (name, email, phone, scale, │
 │   services)                  │
 └──────────┬───────────────────┘
            │
            ▼
 POST /api/contact
            │
            ▼
 ┌──────────────────────────────┐
 │  Server forwards embed to    │
 │  Discord webhook URL         │
 └──────────────────────────────┘
```

This flow is exclusive to the website widget. The browser extension and desktop apps do not include lead capture.

---

## Contextualizing Agent

When enabled, each primary LLM response triggers a parallel inference call to a separate open-source model. The contextualizing agent provides:

- Factual clarifications and corrections
- Alternative viewpoints or caveats
- Supporting context the primary model may have omitted

**Default model:** `Qwen/Qwen2.5-7B-Instruct` (configurable via `HF_CONTEXT_MODEL`)

The agent response is displayed as a collapsible "Context" annotation beneath the primary reply. The CF Worker supports this via a `mode: "context"` parameter that routes to a dedicated model with a second-opinion system prompt.

**Feature support by client:**

| Client | Context Agent Support |
|--------|-----------------------|
| Browser Extension | Yes |
| Linux Desktop | Yes |
| Windows Desktop | No |
| Website Widget | Yes |

---

## Provider Priority

When multiple providers are configured, clients select the active provider using a priority cascade:

```
HF_WORKER_URL set?  ──yes──►  Use HuggingFace via CF Worker
        │
        no
        │
        ▼
OLLAMA_HOST set?    ──yes──►  Use Ollama (local)
        │
        no
        │
        ▼
ANTHROPIC_API_KEY   ──yes──►  Use Anthropic Claude (default)
```

The browser extension and desktop apps allow runtime switching between configured providers via an in-app dropdown. The website widget uses the first available provider from the cascade above.

See [Configuration](../configuration/configuration.md) for all provider-related environment variables.

---

## Related Documents

- [Configuration Reference](../configuration/configuration.md) — all environment variables and config surfaces
- [Security Model](../security/security.md) — credential handling, CORS, auth headers
- [API Reference](../api/api.md) — LLM provider endpoints and SSE wire formats
- Component deep-dives: [Browser](../components/browser-bubble.md) · [Linux Desktop](../components/linux-desktop-bubble.md) · [Windows Desktop](../components/windows-desktop-bubble.md) · [Website](../components/website-bubble.md) · [CF Worker](../components/cloudflare-hf-worker.md)
