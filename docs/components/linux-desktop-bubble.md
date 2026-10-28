# Linux Desktop App (linux-desktop-bubble)

**Component:** `desktop-bubble/linux-desktop-bubble/`
**Type:** Native GTK3 desktop application
**Language:** Python 3.10+
**Total Lines:** ~989 (single-file app)
**Platform:** Linux with X11 display

A native Linux desktop application built with GTK3 and Python that provides a floating AI chat window. Runs natively or inside Docker with X11 passthrough. Supports all three LLM providers with threaded streaming.

## File Map

| File | Lines | Responsibility |
|------|-------|----------------|
| `bubble.py` | ~989 | Main application: UI, API threads, provider logic, chat state |
| `Dockerfile` | — | Ubuntu 22.04 base image with GTK3 and Python dependencies |
| `docker-compose.yml` | — | Docker Compose service with X11 display passthrough |
| `requirements.txt` | — | Python package dependencies |
| `run.sh` | — | Docker launcher: validates API key, enables X11, runs compose |
| `.env.example` | — | Environment variable template |

## Architecture

```
┌──────────────────────────────────────────────┐
│  GTK3 Main Thread                            │
│                                              │
│  ┌──────────────┐   ┌─────────────────────┐  │
│  │ BubbleWindow │   │ ChatPanel           │  │
│  │ (64px float) │──▶│ Messages + Input    │  │
│  │ Draggable    │   │ Model Dropdown      │  │
│  └──────────────┘   │ Screenshot Button   │  │
│                     └────────┬────────────┘  │
│                              │               │
│         GLib.idle_add()      │               │
│         (thread-safe)        │               │
│  ┌───────────────────────────┼────────────┐  │
│  │ Worker Threads            │            │  │
│  │                           │            │  │
│  │  ┌──────────┐ ┌──────────┴─────────┐  │  │
│  │  │ AIThread │ │ OllamaThread       │  │  │
│  │  │(Anthropic│ │(local models)      │  │  │
│  │  └──────────┘ └────────────────────┘  │  │
│  │  ┌──────────┐                         │  │
│  │  │ HFThread │                         │  │
│  │  │(CF Wrkr) │                         │  │
│  │  └──────────┘                         │  │
│  └───────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

The application is a single Python file (`bubble.py`) organized around two main GTK classes and three worker thread classes:

- **`BubbleWindow`** — a 64px floating button (GTK window with transparency and always-on-top). Click toggles the `ChatPanel`.
- **`ChatPanel`** — the full chat UI: message list, input area, model dropdown, and control buttons.
- **`AIThread`** — worker thread for Anthropic Claude API calls with SSE streaming.
- **`OllamaThread`** — worker thread for Ollama API calls with NDJSON streaming.
- **`HFThread`** — worker thread for HuggingFace inference via CF Worker proxy.

## Thread Safety

GTK3 is not thread-safe. All UI updates from worker threads go through `GLib.idle_add()`, which schedules a callback on the GTK main loop. Each worker thread:

1. Makes the API call and reads the streaming response.
2. For each text chunk, calls `GLib.idle_add(self.update_callback, text)`.
3. The callback runs on the main thread and appends text to the chat panel.
4. On completion or error, calls `GLib.idle_add(self.done_callback)`.

## UI

The application uses GTK3 CSS for styling with the C3S brand palette:

| Token | Value | Usage |
|-------|-------|-------|
| Primary dark | `#050f3c` / `rgba(5,15,60)` | Window background |
| Mid navy | `#0a1a60` | Input area background |
| Card tint | `#0d1f7a` | Message card background |
| Accent blue | `#0924a5` / `rgb(9,36,165)` | Buttons, links |
| Hover blue | `#1e46dc` / `rgb(30,70,220)` | Button hover state |
| Text primary | `#e8eaf6` | Body text |
| Success green | `#a6e3a1` | Status indicators |
| Error red | `#ff8a80` | Error messages |

The bubble window is draggable via GTK motion events. The chat panel is a separate top-level window positioned adjacent to the bubble.

## Provider Support

All three LLM providers are supported with runtime selection via the model dropdown:

| Provider | Thread Class | Streaming | Models |
|----------|-------------|-----------|--------|
| Anthropic | `AIThread` | SSE | Haiku 4.5, Sonnet 4.6, Opus 4.6 |
| Ollama | `OllamaThread` | NDJSON | Auto-fetched from `/api/tags` |
| HuggingFace | `HFThread` | Anthropic-compatible SSE | Configured via `HF_CHAT_MODEL` |

When `HF_WORKER_URL` and `HF_WORKER_SECRET` are set, an `HF — <model>` entry appears automatically in the model dropdown.

## Screenshot Capture

Uses PIL (Pillow) for screen capture:

1. `ImageGrab.grab()` captures the full screen.
2. The image is saved to an in-memory buffer as PNG.
3. Base64-encoded and included as an `image` content block in the Anthropic message format.

## Docker Deployment

The recommended deployment uses Docker with X11 passthrough:

```
Ubuntu 22.04 base
  └── System packages: python3, python3-pip, python3-gi, gir1.2-gtk-3.0
  └── Python packages: anthropic, python-dotenv
  └── X11 display forwarded from host
```

**`run.sh` flow:**
1. Validates `ANTHROPIC_API_KEY` is set in the environment.
2. Runs `xhost +local:docker` to allow Docker container X11 access.
3. Executes `docker compose up --build`.

**`docker-compose.yml`** mounts `/tmp/.X11-unix` and passes `DISPLAY` from the host.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `anthropic` | >=0.89.0 | Claude API SDK with streaming support |
| `python-dotenv` | >=1.0.0 | Load environment variables from `.env` |
| `PyGObject` | System | GTK3 Python bindings (installed via apt, not pip) |
| `Pillow` | System | Screenshot capture via `ImageGrab` |

## Cross-References

- [Deployment: Linux Desktop](../deployment/linux-desktop.md)
- [Configuration](../configuration/configuration.md)
- [Architecture Overview](../architecture/architecture.md)
