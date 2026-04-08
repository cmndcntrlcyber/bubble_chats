/**
 * Cloudflare Pages Function — /api/chat  (website-bubble template)
 *
 * Copy this file to your project's functions/api/chat.js.
 * Set ANTHROPIC_API_KEY as an encrypted secret in Cloudflare Pages.
 * Optionally set TAVILY_API_KEY for service-research enrichment.
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

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key not configured on server.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

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

  return new Response(upstream.body, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
