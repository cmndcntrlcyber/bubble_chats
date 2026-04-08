/**
 * Cloudflare Pages Function — /api/chat  (website-bubble template)
 *
 * Copy this file to your project's functions/api/chat.js.
 *
 * Anthropic (default): set ANTHROPIC_API_KEY as an encrypted secret in
 *   Cloudflare Pages → Settings → Environment Variables.
 *
 * Ollama: set OLLAMA_HOST to a publicly reachable Ollama endpoint
 *   (localhost is NOT reachable from Cloudflare Workers — use a tunnel
 *   such as ngrok, Cloudflare Tunnel, or a hosted Ollama service).
 *   Optionally set OLLAMA_MODEL (default: llama3.2).
 *
 * Edit SYSTEM_PROMPT to match your business / use case.
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-haiku-4-5-20251001';
const MAX_TOKENS    = 1024;

// ── Customise this prompt for your site ─────────────────────────────────────

const SYSTEM_PROMPT = `You are a helpful assistant for [YOUR COMPANY NAME].
[DESCRIBE YOUR COMPANY, SERVICES, AND HOW TO HANDLE VISITOR QUERIES.]

Lead capture:
- When a visitor clearly and explicitly expresses intent to engage (e.g. "I want to get started", "how do I hire you", "I'd like to schedule"), end your response with this exact token on its own line: [SERVICE_INTEREST: <specific service name>]
- Use the most specific service name that matches the visitor's interest. Use "General Inquiry" if unclear.
- Only emit this token when the visitor is ready to engage — not for general questions.
- Never explain or reference the token in your reply.`;

// ─────────────────────────────────────────────────────────────────────────────

function toOllamaMessages(messages, systemPrompt) {
  const result = [{ role: 'system', content: systemPrompt }];
  for (const m of messages) {
    const content = Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : (m.content || '');
    const images = Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'image').map(b => b.source?.data)
      : [];
    const msg = { role: m.role, content };
    if (images.length) msg.images = images;
    result.push(msg);
  }
  return result;
}

// Re-stream Ollama NDJSON as Anthropic-compatible SSE so bubble.js works unchanged.
function ollamaNdjsonToSseStream(ndjsonStream) {
  const decoder = new TextDecoder();
  let buf = '';

  const transform = new TransformStream({
    transform(chunk, controller) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          const text = evt.message?.content;
          if (text) {
            const sseEvt = { type: 'content_block_delta', delta: { type: 'text_delta', text } };
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(sseEvt)}\n\n`));
          }
        } catch { /* skip malformed */ }
      }
    },
  });

  return ndjsonStream.pipeThrough(transform);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'messages array required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sseHeaders = {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'X-Accel-Buffering': 'no',
  };

  // ── Ollama path ──────────────────────────────────────────────────────────
  const ollamaHost  = env.OLLAMA_HOST  || '';
  const ollamaModel = env.OLLAMA_MODEL || 'llama3.2';

  if (ollamaHost) {
    const ollamaMessages = toOllamaMessages(messages, SYSTEM_PROMPT);
    const upstream = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, messages: ollamaMessages, stream: true }),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Ollama error: ${upstream.statusText}` }),
        { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(ollamaNdjsonToSseStream(upstream.body), { headers: sseHeaders });
  }

  // ── Anthropic path ───────────────────────────────────────────────────────
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key not configured on server.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const upstream = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages, stream: true }),
  });

  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    const msg = errBody?.error?.message || upstream.statusText;
    return new Response(
      JSON.stringify({ error: msg }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(upstream.body, { headers: sseHeaders });
}
