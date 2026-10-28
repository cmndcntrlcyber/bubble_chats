# Enhancements and Roadmap

**Status:** Current
**Last Updated:** 2026-10-25

## Known Gaps

| # | Gap | Component | Priority | Description |
|---|-----|-----------|----------|-------------|
| 1 | Missing HuggingFace provider | windows-desktop-bubble | **HIGH** | Tauri client only supports Anthropic and Ollama; HF Worker integration not yet implemented |
| 2 | Non-streaming API calls | windows-desktop-bubble | **HIGH** | Tauri backend uses blocking `reqwest` calls instead of streaming; responses appear all at once instead of token-by-token |
| 3 | No automated test suite | All components | **HIGH** | No unit, integration, or E2E tests; only a manual Playwright form-fill script exists |
| 4 | Missing contextualizing agent | windows-desktop-bubble | **MEDIUM** | Tauri client does not support the parallel second-model annotation feature available in other clients |
| 5 | No CI/CD pipeline | Repository | **MEDIUM** | No GitHub Actions, no automated linting, no automated builds or deploys |
| 6 | No rate limiting on CF Worker | cloudflare-hf-worker | **MEDIUM** | Authenticated clients have unlimited request throughput; no token-bucket or Cloudflare Rate Limiting rules |
| 7 | Duplicated logic across codebases | All components | **MEDIUM** | SSE parsing, provider switching, message format construction, and system prompt assembly are re-implemented in each component |
| 8 | No CSP headers | website-bubble | **LOW** | Neither the Express dev server nor CF Pages set Content-Security-Policy headers |
| 9 | No lock files tracked | Repository | **LOW** | `package-lock.json` and `Cargo.lock` are not committed; builds are not reproducible across environments |

## Potential Improvements

### Shared SSE Parsing Library

Extract the common streaming logic (`readAnthropicSseStream` in the browser extension, the SSE parser in the website widget, the GLib-based parser in the Linux app) into a shared JavaScript module. This would eliminate the largest source of cross-component duplication and ensure consistent behavior when parsing edge cases (partial chunks, connection drops, malformed events).

### Unified Configuration Schema

Define a single configuration schema that all components consume, mapping to their platform-specific storage mechanism (chrome.storage, OS keyring, .env). This would make it possible to export/import settings between platforms and reduce the surface area for configuration-related bugs.

### E2E Test Suite

Build a Playwright-based E2E test suite covering:

- Browser extension: load → configure → chat → screenshot → verify response
- Website widget: embed → chat → contact form → Discord delivery
- CF Worker: authentication → chat mode → context mode → error handling

See [Testing — Recommended Test Strategy](../development/testing.md#recommended-test-strategy) for the full proposed test matrix.

### GitHub Actions CI

Implement CI workflows for:

- **JavaScript linting** (ESLint) across browser-bubble, website-bubble, and cloudflare-hf-worker
- **Python linting** (ruff/flake8) for linux-desktop-bubble
- **Rust checks** (`cargo check`, `cargo clippy`, `cargo test`) for windows-desktop-bubble
- **Playwright E2E** tests against the website widget dev server

### Conversation Persistence

Currently, all components lose chat history when the window/panel is closed. Adding conversation persistence would require:

- Browser extension: store in `chrome.storage.local` or IndexedDB
- Desktop apps: store in local SQLite or JSON file
- Website widget: store in `localStorage` or server-side per-session

### Multi-Turn Context Management

No component currently manages context window limits. Long conversations will eventually exceed the model's context window and fail. Implementing token counting and context compaction (summarization or sliding window) would prevent this.

### Mobile Platform Support

The floating bubble UX pattern translates well to mobile. Options include:

- React Native app with platform-specific overlay APIs
- Flutter app with system alert window
- Progressive Web App (PWA) using the website widget as a starting point

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-07 | Initial | Browser extension, website widget, Linux desktop; Anthropic Claude only |
| 2026-04-08 | +Ollama +Tauri | Added Ollama local LLM support; added Windows Tauri desktop client |
| 2026-06-02 | +HuggingFace | Integrated HuggingFace inference via Cloudflare Worker proxy across browser, Linux, and website clients |
| 2026-06-15 | Security fix | Removed exposed Cloudflare account ID; gitignored `wrangler.toml` |

## See Also

- [Architecture](../architecture/architecture.md)
- [Testing Guide](../development/testing.md)
- [Component Reference — Windows Desktop](../components/windows-desktop-bubble.md)
- [Security](../security/security.md)
