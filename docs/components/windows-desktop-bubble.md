# Windows Desktop App (windows-desktop-bubble)

**Component:** `desktop-bubble/windows-desktop-bubble/`
**Type:** Tauri v2 cross-platform desktop application
**Languages:** Rust (backend) + JavaScript/HTML/CSS (frontend)
**Total Lines:** ~974 across 7 source files
**App Identifier:** `com.c3s.windows-desktop-bubble`

A cross-platform desktop chat bubble built with Tauri v2. The Rust backend handles API calls, credential storage via the OS keyring, and screenshot capture. The JavaScript frontend provides the chat UI.

## File Map

| File | Lines | Responsibility |
|------|-------|----------------|
| `Cargo.toml` | — | Workspace root manifest |
| `src-tauri/Cargo.toml` | — | Rust dependencies for the Tauri backend |
| `src-tauri/build.rs` | — | Tauri build script |
| `src-tauri/tauri.conf.json` | — | App config: window size, title, permissions |
| `src-tauri/src/main.rs` | ~50 | Entry point: registers Tauri commands, window positioning |
| `src-tauri/src/api.rs` | ~263 | API calls: Claude, Ollama, Tavily — async Tauri commands |
| `src-tauri/src/storage.rs` | ~32 | OS keyring credential storage |
| `src/index.html` | ~91 | Frontend HTML: chat panel layout |
| `src/main.js` | ~290 | Frontend logic: provider toggle, settings, message handling |
| `src/style.css` | ~248 | C3S brand theme, drag regions, responsive layout |

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Tauri v2 Application                            │
│                                                  │
│  ┌─────────────── Frontend ───────────────────┐  │
│  │  index.html + main.js + style.css          │  │
│  │                                            │  │
│  │  Chat UI ◄──── window.__TAURI__ ────►      │  │
│  │  Settings     .core.invoke("cmd", args)    │  │
│  │  Model Select                              │  │
│  └────────────────────┬───────────────────────┘  │
│                       │ IPC                       │
│  ┌────────────────────┼───────────────────────┐  │
│  │  Rust Backend      │                       │  │
│  │                    │                       │  │
│  │  ┌────────────┐  ┌┴───────────────────┐   │  │
│  │  │ main.rs    │  │ api.rs             │   │  │
│  │  │ Window pos │  │ send_message()     │   │  │
│  │  │ Screenshot │  │ send_message_      │   │  │
│  │  │            │  │   ollama()         │   │  │
│  │  └────────────┘  │ fetch_ollama_      │   │  │
│  │                  │   models()         │   │  │
│  │  ┌────────────┐  │ tavily_search()    │   │  │
│  │  │ storage.rs │  └────────────────────┘   │  │
│  │  │ store_key  │                           │  │
│  │  │ get_key    │                           │  │
│  │  │ delete_key │                           │  │
│  │  └────────────┘                           │  │
│  └───────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

The Rust backend exposes the following Tauri commands to the frontend:

| Command | Source | Purpose |
|---------|--------|---------|
| `send_message` | `api.rs` | Anthropic Claude API call (non-streaming) |
| `send_message_ollama` | `api.rs` | Ollama API call (non-streaming) |
| `fetch_ollama_models` | `api.rs` | List available Ollama models from `/api/tags` |
| `tavily_search` | `api.rs` | Tavily web search for context enrichment |
| `store_key` | `storage.rs` | Save a credential to the OS keyring |
| `get_key` | `storage.rs` | Retrieve a credential from the OS keyring |
| `delete_key` | `storage.rs` | Remove a credential from the OS keyring |
| `capture_screenshot` | `main.rs` | Capture primary screen as base64 PNG |

The frontend calls commands via `window.__TAURI__.core.invoke("command_name", { args })`.

## Credential Storage

API keys are stored in the operating system's native keyring via the `keyring` crate:

- **Service name:** `windows-desktop-bubble`
- **Entries:** One per credential (e.g., `anthropic_api_key`, `ollama_host`)
- **Backends:** Windows Credential Manager, macOS Keychain, Linux Secret Service

This avoids storing keys in plaintext files or environment variables on the desktop.

## Screenshot Capture

Uses the `screenshots` crate for cross-platform screen capture:

1. `Screen::all()` enumerates displays; the primary screen is selected.
2. `Screen::capture()` returns a raw image buffer.
3. The buffer is encoded as PNG and base64-encoded.
4. Returned to the frontend as a data URI for display and inclusion in API messages.

## UI

| Property | Value |
|----------|-------|
| Window size | 420x560px |
| Decorations | Off (custom title bar) |
| Always on top | Yes |
| Transparent background | Yes |
| Drag region | Header bar via `-webkit-app-region: drag` |
| Position | Bottom-right corner of primary display |

**C3S Brand Palette:**

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-dark` | `#050f3c` | Main background |
| `--accent` | `#0924a5` | Buttons, active states |
| Text | `#e8eaf6` | Body text |

## Rust Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| `tauri` | 2 | Desktop application framework |
| `reqwest` | 0.12 | HTTP client for API calls |
| `keyring` | 3 | OS-native credential storage |
| `screenshots` | 0.8 | Cross-platform screen capture |
| `serde` | 1 | Serialization framework |
| `serde_json` | 1 | JSON parsing and generation |
| `tokio` | 1 | Async runtime |
| `base64` | 0.22 | Screenshot encoding |

## Known Gaps

The Windows/Tauri client is the least feature-complete of the four targets:

| Feature | Status | Notes |
|---------|--------|-------|
| Anthropic Claude | Supported | Non-streaming only |
| Ollama | Supported | Non-streaming only |
| HuggingFace (CF Worker) | **Not implemented** | No HF provider code in `api.rs` |
| Streaming responses | **Not implemented** | Uses blocking `reqwest` calls |
| Contextualizing agent | **Not implemented** | Depends on HF provider |
| Lead capture | **Not applicable** | Desktop app, no contact form |

These gaps are tracked in [Enhancements: Future](../enhancements/future.md).

## Cross-References

- [Deployment: Windows Desktop](../deployment/windows-desktop.md)
- [Security: Credential Storage](../security/security.md)
- [Architecture Overview](../architecture/architecture.md)
