# bubble-chats

A multi-platform AI assistant suite that provides Claude-powered floating chat bubbles across browser extensions, Linux desktop, and web widgets.

## Repository Structure

```
bubble-chats/
├── browser-bubble/    # Chrome/Firefox extension (Manifest V3)
├── desktop-bubble/    # GTK3 Python desktop app (Linux)
└── website-bubble/    # Drop-in web widget (Node.js / Cloudflare Pages)
```

---

## browser-bubble

A Chrome and Firefox extension that injects a draggable floating chat bubble into every webpage, with optional screenshot capture for visual troubleshooting.

### Prerequisites

- Chrome 88+ or Firefox 109+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

1. Clone or download this repo.
2. Open `chrome://extensions` (or `about:debugging` in Firefox).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `browser-bubble/` folder.
5. Open the extension **Options** page and enter your Anthropic API key.

### Features

- Floating bubble fixed to the bottom-right corner (draggable)
- Model selection: Haiku 4.5 (fast), Sonnet 4.6 (balanced), Opus 4.6 (powerful)
- Screenshot capture for visual context
- API key stored securely in Chrome/Firefox storage
- Works on all URLs

---

## desktop-bubble

A native Linux desktop application built with GTK3 and Python that provides a floating Claude chat window on your desktop.

### Prerequisites

- Docker & Docker Compose (recommended), **or**
- Python 3.10+, GTK3, and an X11 display

### Installation & Usage

**Via Docker (recommended):**

```bash
cd desktop-bubble
export ANTHROPIC_API_KEY=sk-ant-...
./run.sh
```

`run.sh` validates your API key and runs `docker compose up --build`, passing through your X11 display.

**Without Docker:**

```bash
pip install -r desktop-bubble/requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python desktop-bubble/bubble.py
```

### Configuration

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `DISPLAY` | Yes | X11 display (usually `:0`) |

---

## website-bubble

A drop-in JavaScript widget that adds a floating Claude-powered chat bubble to any website. Includes contact form lead capture, Discord webhook delivery, and optional Tavily search integration.

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- (Optional) [Tavily API key](https://tavily.com) for service research context
- (Optional) Discord webhook URL for lead delivery

### Installation

```bash
cd website-bubble
npm install
cp .env.example .env
# Edit .env with your API keys
npm start
```

The dev server runs on `http://localhost:3000` (configurable via `PORT`).

### Configuration

Copy `.env.example` to `.env` and fill in:

```env
ANTHROPIC_API_KEY=your-anthropic-api-key-here
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_TOKEN
TAVILY_API_KEY=your-tavily-api-key-here   # optional
PORT=3000                                  # optional, default 3000
```

### Embedding the Widget

Add to any HTML page:

```html
<script>
  window.BUBBLE_CONFIG = {
    // optional overrides
  };
</script>
<script src="/js/bubble.js"></script>
```

### Deployment to Cloudflare Pages

1. Push to a Git repository connected to Cloudflare Pages.
2. Set your environment variables as encrypted secrets under **Pages → Settings → Environment Variables**:
   - `ANTHROPIC_API_KEY`
   - `DISCORD_WEBHOOK_URL`
   - `TAVILY_API_KEY` (optional)
3. The `functions/api/chat.js` serverless function handles API proxying automatically.

### Playwright Form Automation

A headless form submission script is included for automated lead capture testing:

```bash
node playwright-contact.js \
  --name "Jane Smith" \
  --email "jane@example.com" \
  --phone "(555) 123-4567" \
  --scale "Small Business" \
  --services "General Inquiry"
```

Install the Playwright browser first:

```bash
npm run install-browsers
```

---

## License

MIT
