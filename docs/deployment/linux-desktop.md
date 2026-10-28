# Linux Desktop Deployment

**Component:** `desktop-bubble/linux-desktop-bubble/`
**Target:** X11 Linux desktop
**Runtime:** Python 3.10+ with GTK3

## Docker Deployment (Recommended)

Docker handles all GTK3, PyGObject, and X11 dependencies automatically.

### Prerequisites

- Docker Engine 20.10+
- Docker Compose v2+
- X11 display server (Wayland requires XWayland)

### Steps

```bash
cd desktop-bubble/linux-desktop-bubble
cp .env.example .env
# Edit .env with your API keys

export ANTHROPIC_API_KEY=sk-ant-...
./run.sh
```

### What `run.sh` Does

1. Validates that `ANTHROPIC_API_KEY` is set (exits with error if missing)
2. Runs `xhost +local:docker` to allow the container X11 access
3. Executes `docker compose up --build`

### Docker Compose Reference

The `docker-compose.yml` mounts the X11 socket and passes through environment variables:

- **Volume:** `/tmp/.X11-unix:/tmp/.X11-unix` — X11 socket passthrough
- **Environment:** `DISPLAY`, `ANTHROPIC_API_KEY`, and all optional provider variables
- **Network:** Host network mode for Ollama access on `localhost`

### Dockerfile Layers

| Layer | Base | Purpose |
|---|---|---|
| 1 | `ubuntu:22.04` | Base OS |
| 2 | System packages | GTK3, GObject introspection, Cairo, WebKit |
| 3 | `pip install` | `requirements.txt` (anthropic, python-dotenv) |
| 4 | App copy | `bubble.py` and `.env` |

## Native Deployment

### Prerequisites

- Python 3.10+
- GTK3 development libraries
- PyGObject (`gi` module)
- X11 display

Install system dependencies (Debian/Ubuntu):

```bash
sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1
```

### Steps

```bash
cd desktop-bubble/linux-desktop-bubble
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys

DISPLAY=:0 python bubble.py
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic Claude API key |
| `DISPLAY` | Yes | — | X11 display (usually `:0`) |
| `OLLAMA_HOST` | No | — | Ollama instance URL (e.g. `http://localhost:11434`) |
| `OLLAMA_MODEL` | No | `llama3.2` | Fallback model if host auto-fetch fails |
| `TAVILY_API_KEY` | No | — | Enables web search context per request |
| `HF_WORKER_URL` | No | — | Deployed CF Worker URL — enables HF model entry |
| `HF_WORKER_SECRET` | No | — | Must match `BUBBLE_SHARED_SECRET` on the Worker |
| `HF_CHAT_MODEL` | No | `meta-llama/Llama-3.1-8B-Instruct` | HuggingFace model ID for chat |
| `HF_CONTEXT_ENABLED` | No | `false` | Set `true` to show contextualizing annotation |

When `HF_WORKER_URL` and `HF_WORKER_SECRET` are both set, an **HF** entry appears in the in-app model dropdown.

## Application Architecture

- **`BubbleWindow`** — 64px floating GTK button, always-on-top, draggable
- **`ChatPanel`** — Chat UI window positioned adjacent to the bubble
- **`AIThread` / `OllamaThread` / `HFThread`** — Background threads for API calls; `GLib.idle_add` for thread-safe GTK updates
- **CSS theming** — C3S brand palette (navy/blue) applied via GTK CSS provider
- **Screenshot** — PIL `ImageGrab.grab()`, base64-encoded PNG attached as image content
