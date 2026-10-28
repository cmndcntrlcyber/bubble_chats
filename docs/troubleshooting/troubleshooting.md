# Troubleshooting

**Status:** Current
**Last Updated:** 2026-10-25

## All Components

| Symptom | Cause | Fix |
|---------|-------|-----|
| No response from chat | API key not set or invalid | Verify the API key in the component's settings or `.env` file; test with a direct curl call (see [Testing — Provider Smoke Tests](../development/testing.md#provider-smoke-tests)) |
| Streaming stops mid-response | Network timeout or model overloaded | Retry the message; check network connectivity; try a smaller model |
| Wrong model responding | Provider priority or model selector misconfigured | Check which provider is active; HF Worker takes priority over Ollama, which takes priority over Anthropic in the website widget |
| "Model not found" error | Model ID typo or model not available | Verify the model ID; for Ollama, run `curl http://localhost:11434/api/tags` to list available models |

## Browser Extension

| Symptom | Cause | Fix |
|---------|-------|-----|
| Bubble doesn't appear on page | Extension not loaded or disabled | Open `chrome://extensions`, verify the extension is enabled and "Load unpacked" points to `browser-bubble/` |
| Bubble appears but chat panel is empty | Content script injection blocked by page CSP | Try a different page; some pages (e.g., Chrome Web Store, `chrome://` pages) block content scripts |
| Screenshot capture fails | Page has restrictive permissions or is a protected Chrome page | Navigate to a regular webpage and retry; `chrome://` and `chrome-extension://` pages block `captureVisibleTab()` |
| Options page won't save | `chrome.storage.local` write error | Open DevTools on the Options page, check Console for errors; clear extension storage and re-enter settings |
| "Receiving end does not exist" in Console | Background service worker went idle | Close and reopen the chat panel; the service worker restarts on the next `chrome.runtime.connect()` call |
| Model dropdown is empty | Provider not configured in Options | Open Options page, select a provider tab, enter credentials, and save |
| HuggingFace provider not working | Worker URL or shared secret incorrect | Verify `HF Worker URL` and `Shared Secret` in the Options HF tab match your deployed Worker |

## Linux Desktop

| Symptom | Cause | Fix |
|---------|-------|-----|
| GTK window doesn't appear | `DISPLAY` not set or X11 not forwarded | Run `export DISPLAY=:0` before launching; for Docker, ensure `run.sh` calls `xhost +local:docker` |
| "Couldn't connect to display :0" | X11 socket not mounted in Docker container | Verify `docker-compose.yml` mounts `/tmp/.X11-unix:/tmp/.X11-unix` and sets `DISPLAY=${DISPLAY}` |
| Docker build fails during `apt-get` | Network issues fetching Ubuntu packages | Check internet connectivity; rebuild with `docker compose build --no-cache` |
| `ModuleNotFoundError: No module named 'gi'` | PyGObject not installed (native mode) | Install: `sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1` |
| `run.sh: Permission denied` | Script not executable | Run `chmod +x run.sh` |
| "Invalid API Key" on launch | `ANTHROPIC_API_KEY` not set or empty | Export the key: `export ANTHROPIC_API_KEY=sk-ant-...` or set it in `.env` |
| Chat works but screenshot is black | Wayland display server (not X11) | PIL `ImageGrab` requires X11; switch to X11 session or use XWayland |

## Windows Desktop (Tauri)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `cargo tauri dev` fails to compile | Missing Rust toolchain or Tauri CLI | Install: `rustup update stable` and `cargo install tauri-cli` |
| White window with no UI | WebView2 not installed (Windows) | Download and install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |
| API key not persisting between launches | OS keyring service unavailable or locked | Check that Windows Credential Manager (or equivalent) is running; try storing a test credential with `keyring` |
| Window appears off-screen | Multi-monitor setup, bottom-right calculation wrong | Move the window manually or reset window position in `tauri.conf.json` |
| Ollama models not listed | Ollama host URL incorrect or Ollama not running | Verify Ollama is running: `curl http://localhost:11434/api/tags`; check the configured host URL |

## Website Widget

| Symptom | Cause | Fix |
|---------|-------|-----|
| CORS errors in browser console | Request origin not in `ALLOWED_ORIGINS` on the CF Worker | Add your origin to `ALLOWED_ORIGINS` in `wrangler.toml` and redeploy: `npx wrangler deploy` |
| Contact form never appears | LLM not generating `[SERVICE_INTEREST: ...]` token | The system prompt must instruct the LLM to append this token when it detects user interest; verify the system prompt in `server.js` or `bubble.js` |
| Discord webhook not receiving submissions | `DISCORD_WEBHOOK_URL` not set or invalid | Set the variable in `.env` (dev) or CF Pages secrets (prod); test the webhook URL directly with curl |
| CF Pages functions return 500 | Environment variables not configured in Pages dashboard | Go to CF Pages → Settings → Environment Variables and set all required secrets |
| `npm start` fails with port conflict | Port 3000 already in use | Set a different port: `PORT=3001 npm start` or kill the conflicting process |
| Widget styles look wrong on host page | Shadow DOM boundary broken or host page uses `!important` on `*` | Verify the widget renders inside Shadow DOM; check for global `* { }` rules on the host page that use `!important` |
| Chat responses are not streaming | HF Worker or Express proxy not forwarding Transfer-Encoding | Check that the proxy sets `Transfer-Encoding: chunked` and does not buffer the response body |

## Cloudflare Worker

| Symptom | Cause | Fix |
|---------|-------|-----|
| HTTP 401 Unauthorized | `X-Bubble-Auth` header missing or secret mismatch | Re-set the secret: `npx wrangler secret put BUBBLE_SHARED_SECRET`; update all client configs to match |
| HTTP 500 from Worker | HuggingFace Inference Router error or token invalid | Check Worker logs: `npx wrangler tail`; verify `HF_TOKEN` has the "Make calls to Inference Providers" permission |
| Model returns "Model not found" | Model ID incorrect or not available on HF Inference | Verify the model ID on HuggingFace; check if the model supports the Inference Router |
| Context mode returns empty or errors | `HF_CONTEXT_MODEL` not set in `wrangler.toml` | Add `HF_CONTEXT_MODEL = "Qwen/Qwen2.5-7B-Instruct"` to `[vars]` in `wrangler.toml` and redeploy |
| Private/gated model returns 403 | HF token hasn't accepted model license | Visit the model page on HuggingFace and accept the license agreement |
| Slow first response after idle | Cloudflare Worker cold start | Normal behavior; subsequent requests in the same isolate are fast |

## Diagnostic Commands

```bash
# Verify Ollama is running and list models
curl http://localhost:11434/api/tags

# Test Anthropic API key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20250514","max_tokens":10,"messages":[{"role":"user","content":"ping"}]}'

# Test CF Worker authentication
curl -X POST "$HF_WORKER_URL" \
  -H "X-Bubble-Auth: $BUBBLE_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ping"}],"stream":false}'

# Tail CF Worker logs
npx wrangler tail

# Check Chrome extension errors
# Navigate to chrome://extensions → click "Errors" on the extension card
```

## See Also

- [Testing Guide](../development/testing.md)
- [Configuration Reference](../configuration/configuration.md)
- [Security](../security/security.md)
