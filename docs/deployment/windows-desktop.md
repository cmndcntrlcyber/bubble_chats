# Windows Desktop Deployment

**Component:** `desktop-bubble/windows-desktop-bubble/`
**Target:** Windows (cross-platform via Tauri v2)
**Runtime:** Rust backend + HTML/JS/CSS frontend
**App Identifier:** `com.c3s.windows-desktop-bubble`

## Prerequisites

- Node.js 18+
- Rust toolchain (install via [rustup.rs](https://rustup.rs))
- Tauri CLI: `cargo install tauri-cli`
- Windows: Microsoft Visual Studio C++ Build Tools
- Linux/macOS: system WebView library (WebKitGTK on Linux, WebView2 on Windows)

## Development

```bash
cd desktop-bubble/windows-desktop-bubble
npm install
cargo tauri dev
```

Hot-reloads the frontend on file changes. The Rust backend recompiles on save.

## Production Build

```bash
cargo tauri build
```

Output location varies by platform:
- **Windows:** `src-tauri/target/release/bundle/msi/` (`.msi` installer)
- **Linux:** `src-tauri/target/release/bundle/deb/` or `appimage/`
- **macOS:** `src-tauri/target/release/bundle/dmg/`

## Configuration

Copy `.env.example` to `.env` in the `windows-desktop-bubble/` directory:

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key (stored in OS keyring after first entry) |
| `OLLAMA_HOST` | No | — | Ollama instance URL |
| `OLLAMA_MODEL` | No | `llama3.2` | Default Ollama model |
| `TAVILY_API_KEY` | No | — | Web search context enrichment |

### OS Keyring Storage

API keys entered through the settings overlay are stored in the OS keyring via the `keyring` crate (service name: `windows-desktop-bubble`). This keeps credentials out of environment variables and config files at runtime.

Tauri commands for credential management:
- `store_key(service, key)` — save to keyring
- `get_key(service)` — retrieve from keyring
- `delete_key(service)` — remove from keyring

## Window Configuration

| Property | Value |
|---|---|
| Window size | 420 x 560 px |
| Decorations | Off (custom title bar) |
| Always on top | Yes |
| Transparent background | Yes |
| Initial position | Bottom-right corner |
| Draggable | Yes (via `-webkit-app-region: drag`) |

## Known Limitations

- **No HuggingFace provider support** — only Anthropic and Ollama are implemented in `api.rs`
- **No contextualizing agent** — the parallel second-opinion call is not yet wired up
- **Non-streaming API calls** — unlike the other clients, the Tauri app uses blocking request/response (no SSE streaming)
- **Screenshot capture** — uses the `screenshots` crate (`Screen::capture()`), which requires display access permissions on some platforms

## Rust Backend Entry Points

| File | Purpose |
|---|---|
| `src-tauri/src/main.rs` | Tauri app initialization, command registration, window positioning |
| `src-tauri/src/api.rs` | `send_message()` (Claude), `send_message_ollama()`, `fetch_ollama_models()`, `tavily_search()` |
| `src-tauri/src/storage.rs` | OS keyring credential management |
