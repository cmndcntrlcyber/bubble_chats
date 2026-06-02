# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**bubble-chats** is a multi-platform AI assistant suite that provides Claude-powered floating chat bubbles across four deployment targets: a browser extension, a Linux GTK3 desktop app, a Windows/cross-platform Tauri app, and an embeddable web widget.

Primary features across all targets: streaming chat with Anthropic models, optional Ollama local LLM, screenshot capture, Tavily web search, and lead capture via Discord webhooks.

## Components & Commands

### Browser Extension (`browser-bubble/`)
No build step. Load unpacked in Chrome (`chrome://extensions` → Developer mode → Load unpacked) or Firefox (`about:debugging` → Load Temporary Add-on). Entry points: `background.js` (service worker), `content.js` (injected UI), `options.html` (settings).

### Linux Desktop (`desktop-bubble/linux-desktop-bubble/`)
```bash
# Docker (recommended — handles GTK3/X11 deps)
export ANTHROPIC_API_KEY=sk-ant-...
./run.sh   # wraps docker compose up --build

# Native
pip install -r requirements.txt
DISPLAY=:0 python bubble.py
```
Requires an X11 display (`DISPLAY=:0`). The Dockerfile builds on Ubuntu 22.04 with GTK3.

### Windows/Cross-Platform Desktop (`desktop-bubble/windows-desktop-bubble/`)
```bash
npm install           # JS frontend deps
cargo tauri dev       # Dev mode (hot reload)
cargo tauri build     # Package executable
```
Rust backend in `src-tauri/src/main.rs`; TypeScript/HTML frontend in `src/`.

### Website Widget (`website-bubble/`)
```bash
npm install
npm start     # Express dev server on http://localhost:3000
```
`/js/bubble.js` is the embeddable widget. `server.js` is the Express dev proxy. For production, deploy to Cloudflare Pages — `functions/api/chat.js` is the serverless handler.

**Embed snippet:**
```html
<script>
  window.BUBBLE_CONFIG = {
    chatEndpoint: '/api/chat',
    contactEndpoint: '/api/contact',
  };
</script>
<script src="/js/bubble.js"></script>
```

## Architecture

All four targets share the same UX pattern — a 56px draggable bubble that opens a ~420px chat panel — but are otherwise independent codebases.

**LLM support (all targets):** Anthropic Claude (Haiku 4.5 default, Sonnet 4.6, Opus 4.6) and optional Ollama via configurable host URL. Model is selectable at runtime.

**Lead capture flow:** Chat panel includes a contact form; submissions POST to a `/api/contact` endpoint and are forwarded to a Discord webhook. Tavily search is optionally called before Claude to inject web context.

**Streaming:** All targets use SSE/streaming responses. The web widget proxies through Express (dev) or a Cloudflare Function (prod). The browser extension streams directly from the service worker to content script via Chrome messaging.

**Shadow DOM isolation:** Both `browser-bubble` and `website-bubble` inject UI inside Shadow DOM to prevent host-page style conflicts.

**API key storage per platform:**
- Browser extension → Chrome/Firefox `storage.local`
- Windows Tauri → system keyring (`keyring` crate)
- Linux Python / Node.js server → environment variables

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (all) | Claude API key |
| `OLLAMA_HOST` | No | e.g. `http://localhost:11434` |
| `OLLAMA_MODEL` | No | Default: `llama3.2` |
| `TAVILY_API_KEY` | No | Enables web search context |
| `DISCORD_WEBHOOK_URL` | No | Lead capture notifications |
| `DISPLAY` | Linux only | X11 display (usually `:0`) |
| `PORT` | website-bubble | Dev server port, default `3000` |

Copy `website-bubble/.env.example` to `.env` for the web widget dev server.
