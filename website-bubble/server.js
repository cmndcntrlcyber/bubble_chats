/**
 * website-bubble — local development server
 *
 * Proxies /api/chat to Anthropic, handles /api/contact → Discord webhook,
 * exposes /api/playwright-fill for headless form submission testing,
 * and injects bubble.js into every HTML page automatically.
 *
 * Usage:
 *   cp .env.example .env   # fill in your keys
 *   npm install
 *   npm start
 */

require('dotenv').config();

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const { execFile } = require('child_process');
const app          = express();
const PORT         = process.env.PORT || 3000;

// ── Customise ─────────────────────────────────────────────────────────────────

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a helpful assistant for [YOUR COMPANY NAME].
[DESCRIBE YOUR COMPANY, SERVICES, AND HOW TO HANDLE VISITOR QUERIES.]

Lead capture:
- When a visitor clearly and explicitly expresses intent to engage (e.g. "I want to get started", "how do I hire you", "I'd like to schedule"), end your response with this exact token on its own line: [SERVICE_INTEREST: <specific service name>]
- Use the most specific service name that matches the visitor's interest. Use "General Inquiry" if unclear.
- Only emit this token when the visitor is ready to engage — not for general questions.
- Never explain or reference the token in your reply.`;

// ── /api/contact — Discord webhook lead delivery ──────────────────────────────

app.post('/api/contact', express.json(), async (req, res) => {
  const { name, email, phone_number, desired_scale, desired_services } = req.body || {};
  if (!name || !email || !phone_number)
    return res.status(400).json({ error: 'name, email, and phone_number are required.' });

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl)
    return res.status(500).json({ error: 'DISCORD_WEBHOOK_URL not configured.' });

  const payload = {
    embeds: [{
      title: 'New contact form submission',
      color: 0x0924A5,
      fields: [
        { name: 'Name',             value: name,                    inline: false },
        { name: 'Email',            value: email,                   inline: false },
        { name: 'Phone',            value: phone_number,            inline: false },
        { name: 'Scale',            value: desired_scale    || '—', inline: false },
        { name: 'Service Interest', value: desired_services || '—', inline: false },
      ],
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const dr = await fetch(webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!dr.ok) return res.status(502).json({ error: 'Webhook delivery failed.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── /api/playwright-fill — headless form submission ───────────────────────────

app.post('/api/playwright-fill', express.json(), (req, res) => {
  const { name, email, phone_number, desired_scale, desired_services } = req.body || {};
  if (!name || !email || !phone_number)
    return res.status(400).json({ error: 'name, email, and phone_number are required.' });

  execFile('node', [
    path.join(__dirname, 'playwright-contact.js'),
    '--name', name, '--email', email, '--phone', phone_number,
    '--scale', desired_scale || '', '--services', desired_services || '',
  ], { cwd: __dirname }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, output: stdout.trim() });
  });
});

// ── /api/chat — SSE proxy to Anthropic ───────────────────────────────────────

app.post('/api/chat', express.json(), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured.' });

  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'messages array required.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const upstream = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: SYSTEM_PROMPT, messages, stream: true }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.json().catch(() => ({}));
      res.write(`data: ${JSON.stringify({ type: 'error', message: errBody?.error?.message || upstream.statusText })}\n\n`);
      return res.end();
    }

    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    req.on('close', () => reader.cancel());
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// ── Inject bubble.js into HTML responses ─────────────────────────────────────

function injectBubble(req, res, next) {
  if (req.method !== 'GET') return next();
  let filePath;
  if (req.path === '/') filePath = path.join(__dirname, 'index.html');
  else if (req.path.endsWith('.html')) filePath = path.join(__dirname, req.path);
  else return next();

  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return next();
    const injected = html.replace('</body>', '<script src="/js/bubble.js"></script>\n</body>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(injected);
  });
}

app.use(injectBubble);
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html'), err => {
  if (err) res.status(404).send('Not found');
}));

app.listen(PORT, '0.0.0.0', () => console.log(`website-bubble dev server → http://localhost:${PORT}`));
