# Security

**Status:** Current
**Last Updated:** 2026-10-25

## Credential Storage

| Platform | Mechanism | Scope | Sync |
|----------|-----------|-------|------|
| Browser extension | `chrome.storage.local` | Per-browser profile | Not synced (local only) |
| Windows / Tauri | OS keyring (`keyring` crate, service: `windows-desktop-bubble`) | Per-OS-user | Managed by OS credential store |
| Linux desktop | `.env` file / environment variables | Per-session | Not persisted beyond process |
| Website widget (dev) | `.env` file → Express `process.env` | Server-side only | Never sent to browser |
| Website widget (prod) | Cloudflare Pages encrypted secrets | Per-deployment | Encrypted at rest |
| CF Worker | Wrangler secrets (`wrangler secret put`) | Per-Worker | Encrypted at rest, never in source |

## API Key Protection

**Server-side isolation.** The website widget and Cloudflare Pages functions never expose API keys to client-side JavaScript. All LLM calls are proxied through server-side endpoints (`/api/chat`, `/api/context`), which inject credentials from environment variables.

**HuggingFace token confinement.** The `HF_TOKEN` is stored exclusively in the Cloudflare Worker as a Wrangler secret. Bubble clients authenticate to the Worker via the `X-Bubble-Auth` shared secret — they never see or need the HF token.

**Browser extension storage.** API keys are stored in `chrome.storage.local`, which is sandboxed to the extension's origin and not accessible to web pages. The `storage` permission is scoped; `storage.sync` is not used, preventing unintended cloud sync of credentials.

**Tauri keyring.** The Windows desktop app stores API keys in the operating system's native credential manager (Windows Credential Manager, macOS Keychain, or Linux Secret Service) via the `keyring` crate under service name `windows-desktop-bubble`.

## Transport Security

All external API calls use HTTPS:

| Endpoint | Protocol | Authentication |
|----------|----------|----------------|
| Anthropic Messages API | HTTPS | `x-api-key` header |
| Ollama local | HTTP (localhost only) | None (local-only access) |
| HuggingFace Inference Router | HTTPS | `Authorization: Bearer` (via CF Worker) |
| CF Worker | HTTPS | `X-Bubble-Auth` header |
| Tavily Search API | HTTPS | API key in request body |
| Discord Webhooks | HTTPS | Webhook URL contains token |

The Cloudflare Worker validates the `X-Bubble-Auth` header using **timing-safe string comparison** to prevent timing attacks that could leak the shared secret byte-by-byte.

## CORS Policy

The Cloudflare Worker enforces an origin allowlist via the `ALLOWED_ORIGINS` environment variable:

```toml
ALLOWED_ORIGINS = "https://yourdomain.com,chrome-extension://,tauri://localhost"
```

- **Exact match** for web origins (e.g., `https://yourdomain.com`)
- **Prefix match** for `chrome-extension://` — allows any extension origin (the extension ID varies per installation)
- **Tauri origin** `tauri://localhost` for the desktop app

Requests from unlisted origins receive no `Access-Control-Allow-Origin` header and are blocked by the browser's CORS policy.

## Shadow DOM Isolation

Both the browser extension (`content.js`) and website widget (`bubble.js`) render their entire UI inside a Shadow DOM boundary. This provides:

- **Style isolation** — host page CSS cannot override or interfere with the chat bubble's appearance
- **DOM isolation** — host page JavaScript cannot traverse into the Shadow DOM to read chat content or manipulate the UI
- **Event containment** — click and keyboard events inside the bubble do not propagate to the host page's event listeners

## .gitignore Protection

The repository `.gitignore` excludes sensitive and generated files:

| Pattern | Protects |
|---------|----------|
| `.env` | API keys and secrets in environment files |
| `wrangler.toml` | Cloudflare account ID and Worker config |
| `node_modules/` | Third-party dependencies |
| `dist/`, `build/` | Build artifacts |
| `target/` | Rust build artifacts |

## Known Considerations

| Consideration | Impact | Mitigation |
|---------------|--------|------------|
| Shared secret is symmetric | If `BUBBLE_SHARED_SECRET` is compromised, any client can call the Worker | Rotate the secret with `wrangler secret put` and update all client configs |
| Browser extension has broad host permissions | `activeTab` + `<all_urls>` allows content script injection on any page | Required for floating bubble functionality; extension is not published to stores |
| No CSP headers on website widget | The Express dev server and CF Pages do not set Content-Security-Policy headers | Add CSP headers in production reverse proxy or CF Pages `_headers` file |
| No rate limiting on CF Worker | Unauthenticated requests are rejected (401), but authenticated clients have no request cap | Add Cloudflare Rate Limiting rules or implement token-bucket in Worker |
| Ollama runs on plain HTTP | Local Ollama instance uses unencrypted HTTP on localhost | Acceptable for localhost-only access; do not expose Ollama to external networks |

## Incident History

| Date | Severity | Description | Resolution |
|------|----------|-------------|------------|
| 2026-06-15 | Medium | Cloudflare account ID was committed in `wrangler.toml` | Removed in commit `fix: remove exposed Cloudflare account ID and gitignore wrangler.toml`; `wrangler.toml` added to `.gitignore`; `wrangler.toml.example` provided as template |

## See Also

- [Configuration Reference](../configuration/configuration.md)
- [Deployment — Cloudflare Worker](../deployment/cloudflare-worker.md)
- [API Reference](../api/api.md)
- [Troubleshooting](../troubleshooting/troubleshooting.md)
