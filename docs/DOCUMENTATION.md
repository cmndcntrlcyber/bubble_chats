# bubble-chats Documentation

**bubble-chats** is a multi-platform AI assistant suite that provides floating chat bubbles powered by AI across four deployment targets: a Chrome/Firefox browser extension, a Linux GTK3 desktop app, a Windows/cross-platform Tauri desktop app, and an embeddable website widget. All clients support three LLM providers — Anthropic Claude, local Ollama, and HuggingFace models via a Cloudflare Worker proxy — with optional contextualizing agent annotations and Tavily web search integration.

**Repository:** [github.com/cmndcntrlcyber/bubble_chats](https://github.com/cmndcntrlcyber/bubble_chats)
**License:** MIT

---

## Getting Started

1. [Development Setup](development/getting-started.md) — clone, install deps, run each component locally
2. [Architecture Overview](architecture/architecture.md) — system topology, data flow, provider model
3. [Configuration Reference](configuration/configuration.md) — every environment variable and config surface

---

## Architecture

| Document | Description |
|----------|-------------|
| [Architecture](architecture/architecture.md) | System topology, component map, data flow, SSE normalization, Shadow DOM, credential storage, provider priority |

## Configuration

| Document | Description |
|----------|-------------|
| [Configuration](configuration/configuration.md) | Master environment variable reference, per-component config, provider selection cascade, supported models |

## Deployment

| Document | Description |
|----------|-------------|
| [Deployment Index](deployment/README.md) | Overview and quick-reference for all deployment targets |
| [Browser Extension](deployment/browser-extension.md) | Chrome/Firefox extension loading, permissions, store publishing |
| [Linux Desktop](deployment/linux-desktop.md) | Docker and native GTK3 deployment on Linux with X11 |
| [Windows Desktop](deployment/windows-desktop.md) | Tauri v2 build, dev mode, packaging for distribution |
| [Website Widget](deployment/website-widget.md) | Express dev server and Cloudflare Pages production deployment |
| [Cloudflare Worker](deployment/cloudflare-worker.md) | HuggingFace inference proxy: deploy, secrets, smoke test |

## Development

| Document | Description |
|----------|-------------|
| [Getting Started](development/getting-started.md) | Prerequisites, clone, install, run each component locally |
| [Testing](development/testing.md) | Current testing tools, Playwright form automation, manual test plans |

## Components

| Document | Description |
|----------|-------------|
| [Browser Bubble](components/browser-bubble.md) | Manifest V3 extension: service worker, content script, Shadow DOM UI, options page |
| [Linux Desktop Bubble](components/linux-desktop-bubble.md) | GTK3 Python app: BubbleWindow, ChatPanel, threaded API calls, Docker packaging |
| [Windows Desktop Bubble](components/windows-desktop-bubble.md) | Tauri v2 app: Rust backend, HTML/JS frontend, keyring storage, screenshot capture |
| [Website Bubble](components/website-bubble.md) | Drop-in widget: Express proxy, CF Pages functions, lead capture, contact form |
| [Cloudflare HF Worker](components/cloudflare-hf-worker.md) | SSE normalizer: OpenAI→Anthropic format, auth, CORS, context agent mode |

## Security

| Document | Description |
|----------|-------------|
| [Security](security/security.md) | Credential storage model, API key handling, CORS, auth headers, Shadow DOM isolation |

## API Reference

| Document | Description |
|----------|-------------|
| [API Reference](api/api.md) | LLM provider endpoints, SSE wire formats, internal proxy routes, embed configuration |

## Troubleshooting

| Document | Description |
|----------|-------------|
| [Troubleshooting](troubleshooting/troubleshooting.md) | Common issues per platform, provider connectivity, streaming failures, Docker/X11 |

## Enhancements

| Document | Description |
|----------|-------------|
| [Future Enhancements](enhancements/future.md) | Known gaps, feature parity matrix, roadmap items |

---

## Audience Paths

### Developer

Adding features or fixing bugs across any component.

1. [Getting Started](development/getting-started.md) — set up your local environment
2. [Architecture](architecture/architecture.md) — understand system topology and data flow
3. Component deep-dive for your target: [Browser](components/browser-bubble.md) · [Linux Desktop](components/linux-desktop-bubble.md) · [Windows Desktop](components/windows-desktop-bubble.md) · [Website](components/website-bubble.md) · [CF Worker](components/cloudflare-hf-worker.md)
4. [API Reference](api/api.md) — SSE wire formats and proxy routes
5. [Testing](development/testing.md) — how to verify changes
6. [Security](security/security.md) — credential handling requirements

### Operator

Deploying and configuring bubble-chats for production use.

1. [Configuration](configuration/configuration.md) — every environment variable and config surface
2. [Deployment Index](deployment/README.md) — pick your target and follow the guide
3. [Cloudflare Worker](deployment/cloudflare-worker.md) — deploy the HF proxy (if using HuggingFace models)
4. [Security](security/security.md) — understand credential storage and auth
5. [Troubleshooting](troubleshooting/troubleshooting.md) — diagnose common issues

### Integrator

Embedding the chat widget into an existing website or workflow.

1. [Website Widget Deployment](deployment/website-widget.md) — embed snippet and CF Pages setup
2. [API Reference](api/api.md) — `BUBBLE_CONFIG` options and proxy endpoints
3. [Configuration](configuration/configuration.md) — environment variables for the widget
4. [Cloudflare Worker](deployment/cloudflare-worker.md) — optional HF model proxy
5. [Security](security/security.md) — CORS allowlist and shared secret setup
