# Deployment

bubble-chats comprises five independently deployable components. Each can be set up in isolation or combined for a full multi-platform deployment.

## Deployment Guides

| Component | Target | Guide | Prerequisites |
|---|---|---|---|
| Browser Extension | Chrome 88+ / Firefox 109+ | [browser-extension.md](browser-extension.md) | API key (Anthropic, Ollama, or HF Worker) |
| Linux Desktop | X11 Linux desktop | [linux-desktop.md](linux-desktop.md) | Docker (recommended) or Python 3.10+ with GTK3 |
| Windows Desktop | Windows / cross-platform | [windows-desktop.md](windows-desktop.md) | Node.js 18+, Rust toolchain, Tauri CLI |
| Website Widget | Any web page | [website-widget.md](website-widget.md) | Node.js 18+ (dev) or Cloudflare Pages (prod) |
| Cloudflare Worker | Cloudflare edge | [cloudflare-worker.md](cloudflare-worker.md) | Node.js 18+, CF account, HuggingFace token |

## Quick Reference

| Component | Runtime | LLM Providers | Streaming | Context Agent |
|---|---|---|---|---|
| Browser Extension | Browser (Manifest V3) | Anthropic, Ollama, HF Worker | Yes (SSE) | Yes |
| Linux Desktop | Python 3.10 / GTK3 / Docker | Anthropic, Ollama, HF Worker | Yes (SSE/NDJSON) | Yes |
| Windows Desktop | Tauri v2 / Rust | Anthropic, Ollama | No | No |
| Website Widget | Express (dev) / CF Pages (prod) | Anthropic, Ollama, HF Worker | Yes (SSE) | Yes |
| Cloudflare Worker | CF Workers runtime | HuggingFace Inference Router | Yes (SSE) | Yes |

## Configuration

All components share a common set of environment variables for provider selection and API keys. See [Configuration](../configuration/configuration.md) for the full reference.

## Deployment Order

For a full deployment with HuggingFace support:

1. **Cloudflare Worker** — deploy first; clients need the Worker URL
2. **Website Widget** — deploy to Cloudflare Pages with Worker URL configured
3. **Browser Extension** — load unpacked and configure via Options page
4. **Desktop Apps** — configure `.env` with Worker URL and start
