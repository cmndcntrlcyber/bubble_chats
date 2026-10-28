# Getting Started

**Status:** Current
**Last Updated:** 2026-10-25

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Website widget dev server, CF Worker tooling |
| Python | 3.10+ | Linux desktop app (native mode) |
| Rust toolchain | stable | Windows/cross-platform Tauri desktop app |
| Docker + Compose | latest | Linux desktop app (containerized mode) |
| Chrome | 88+ | Browser extension development |
| Firefox | 109+ | Browser extension development (alternative) |

## Repository Structure

```
bubble-chats/
├── browser-bubble/                 # Chrome/Firefox extension (Manifest V3)
│   ├── background.js               # Service worker — API streaming, screenshots
│   ├── content.js                   # Injected UI — Shadow DOM chat bubble
│   ├── manifest.json                # Extension manifest
│   ├── options.html                 # Settings page
│   ├── options.js                   # Settings page logic
│   └── icons/                       # Extension icons (16/48/128px)
├── cloudflare-hf-worker/           # CF Worker — HuggingFace proxy
│   ├── package.json
│   ├── wrangler.toml.example        # Config template (wrangler.toml is gitignored)
│   └── src/
│       └── index.js                 # Worker entry — SSE normalization + auth
├── desktop-bubble/
│   ├── linux-desktop-bubble/        # GTK3 Python desktop app
│   │   ├── bubble.py                # Main application
│   │   ├── requirements.txt         # Python dependencies
│   │   ├── Dockerfile               # Ubuntu 22.04 + GTK3
│   │   ├── docker-compose.yml       # X11 passthrough config
│   │   ├── run.sh                   # Docker launcher
│   │   └── .env.example             # Environment template
│   └── windows-desktop-bubble/      # Tauri v2 cross-platform app
│       ├── Cargo.toml               # Workspace root
│       ├── src/
│       │   ├── index.html           # Frontend HTML
│       │   ├── main.js              # Frontend JS
│       │   └── style.css            # C3S brand theme
│       ├── src-tauri/
│       │   ├── Cargo.toml           # Rust dependencies
│       │   ├── tauri.conf.json      # Tauri app config
│       │   └── src/
│       │       ├── main.rs          # Rust entry point
│       │       ├── api.rs           # LLM API calls
│       │       └── storage.rs       # OS keyring storage
│       └── .env.example             # Environment template
└── website-bubble/                  # Embeddable web widget
    ├── package.json
    ├── server.js                    # Express dev server + API proxy
    ├── js/
    │   └── bubble.js                # Drop-in widget script
    ├── functions/api/
    │   ├── chat.js                  # CF Pages serverless — chat proxy
    │   └── context.js               # CF Pages serverless — context agent
    ├── playwright-contact.js        # Headless form test tool
    └── .env.example                 # Environment template
```

## Quick Start

### Browser Extension

```bash
git clone https://github.com/cmndcntrlcyber/bubble_chats.git
cd bubble_chats
```

1. Open `chrome://extensions` (Chrome) or `about:debugging` (Firefox).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `browser-bubble/` folder.
4. Open the extension **Options** page.
5. Enter your Anthropic API key and configure your preferred provider.

No build step required — all source is vanilla JavaScript.

### Linux Desktop (Docker)

```bash
cd desktop-bubble/linux-desktop-bubble
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY at minimum
export ANTHROPIC_API_KEY=sk-ant-...
./run.sh
```

`run.sh` runs `xhost +local:docker` and `docker compose up --build`, forwarding your X11 display.

### Linux Desktop (Native)

```bash
cd desktop-bubble/linux-desktop-bubble
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
export DISPLAY=:0
python bubble.py
```

Requires system GTK3 and PyGObject (`sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1`).

### Windows / Cross-Platform Desktop

```bash
cd desktop-bubble/windows-desktop-bubble
npm install
cargo tauri dev       # Development mode with hot reload
cargo tauri build     # Package release executable
```

Requires the Rust toolchain and platform-specific Tauri prerequisites (WebView2 on Windows).

### Website Widget

```bash
cd website-bubble
npm install
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY, optionally DISCORD_WEBHOOK_URL, TAVILY_API_KEY
npm start
```

Dev server runs on `http://localhost:3000`.

### Cloudflare Worker (HuggingFace Proxy)

```bash
cd cloudflare-hf-worker
npm install
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml — set HF_DEFAULT_MODEL, HF_CONTEXT_MODEL, ALLOWED_ORIGINS
npx wrangler deploy

npx wrangler secret put HF_TOKEN              # Paste your HuggingFace token
npx wrangler secret put BUBBLE_SHARED_SECRET   # Paste a shared secret (openssl rand -hex 32)
```

## Development Workflow

Each component is independently developed with no shared build step or monorepo tooling. Changes to one component do not affect others. The typical workflow:

1. Start the component's dev environment (see Quick Start above).
2. Make changes — all frontends hot-reload or require a browser refresh.
3. Test manually against each configured LLM provider.
4. Verify Shadow DOM isolation on target pages (browser extension and website widget).

The Cloudflare Worker is the only shared infrastructure — changes there affect all clients that use HuggingFace models.

## Code Style

| Component | Language | Patterns |
|-----------|----------|----------|
| Browser extension | Vanilla JS | Chrome Extension APIs, `chrome.runtime` messaging, `ReadableStream` SSE parsing |
| Linux desktop | Python 3 | GTK3/PyGObject, GLib.idle_add for thread-safe UI updates, threading for API calls |
| Windows desktop | Rust + JS | Tauri v2 `#[tauri::command]` async functions, `window.__TAURI__.core.invoke()` IPC |
| Website widget | Vanilla JS | Shadow DOM, `fetch()` streaming, Express middleware |
| CF Worker | JS | Cloudflare Worker `fetch` handler, `TransformStream` for SSE conversion |

## See Also

- [Component Reference — Browser Extension](../components/browser-bubble.md)
- [Component Reference — Linux Desktop](../components/linux-desktop-bubble.md)
- [Component Reference — Windows Desktop](../components/windows-desktop-bubble.md)
- [Component Reference — Website Widget](../components/website-bubble.md)
- [Component Reference — Cloudflare Worker](../components/cloudflare-hf-worker.md)
- [Configuration Reference](../configuration/configuration.md)
- [Testing Guide](testing.md)
