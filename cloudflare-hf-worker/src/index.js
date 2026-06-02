/**
 * bubble-hf-worker — Cloudflare Worker
 *
 * Secure proxy between bubble-chat clients and the HuggingFace Inference Router.
 * Keeps HF_TOKEN server-side. Clients authenticate with a shared secret header.
 *
 * Endpoints: POST /           → primary chat (mode: 'chat', default)
 *            POST / + mode=context → contextualizing agent response
 *
 * Normalises HuggingFace OpenAI-compatible SSE → Anthropic-compatible SSE so
 * all existing bubble clients work without streaming-consumer changes.
 *
 * Deploy:
 *   npx wrangler deploy
 *   npx wrangler secret put HF_TOKEN
 *   npx wrangler secret put BUBBLE_SHARED_SECRET
 */

const HF_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

const CONTEXT_SYSTEM_PROMPT =
  'You are an analytical second-opinion agent. Given the conversation so far, ' +
  'briefly provide: relevant context the user may be missing, factual clarifications, ' +
  'alternative viewpoints, or important caveats. Be concise (2-4 sentences). ' +
  'Do not repeat what was already said. Plain text only, no markdown headers.';

// Constant-time string comparison — prevents timing attacks on the shared secret.
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const ae = new TextEncoder().encode(a);
  const be = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < ae.length; i++) diff |= ae[i] ^ be[i];
  return diff === 0;
}

// Transforms HuggingFace / OpenAI-compatible SSE → Anthropic-compatible SSE.
// Input:  data: {"choices":[{"delta":{"content":"..."}}]}
// Output: data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
function openAiToAnthropicSse(stream) {
  const decoder = new TextDecoder();
  let buf = '';
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, ctrl) {
        buf += decoder.decode(chunk, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete trailing line
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const evt = JSON.parse(raw);
            const text = evt.choices?.[0]?.delta?.content;
            if (text) {
              const out = {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text },
              };
              ctrl.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(out)}\n\n`)
              );
            }
          } catch { /* skip malformed frames */ }
        }
      },
    })
  );
}

export default {
  async fetch(request, env) {
    // ── CORS ────────────────────────────────────────────────────────────────
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const originAllowed = allowedOrigins.some(
      o => o === origin ||
           // prefix match lets any chrome-extension:// ID through
           (o === 'chrome-extension://' && origin.startsWith('chrome-extension://'))
    );
    const corsOrigin = originAllowed ? origin : (allowedOrigins[0] || '');

    const corsHeaders = {
      'Access-Control-Allow-Origin':  corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Bubble-Auth',
      'Access-Control-Max-Age':       '86400',
    };

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders });

    if (request.method !== 'POST')
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });

    // ── Auth ─────────────────────────────────────────────────────────────────
    const auth = request.headers.get('X-Bubble-Auth') || '';
    if (!timingSafeEqual(auth, env.BUBBLE_SHARED_SECRET || ''))
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    // ── Parse body ────────────────────────────────────────────────────────────
    let body;
    try { body = await request.json(); }
    catch {
      return new Response('Bad request — invalid JSON', {
        status: 400, headers: corsHeaders,
      });
    }

    const { messages, mode = 'chat', stream = true, max_tokens } = body;

    if (!Array.isArray(messages) || messages.length === 0)
      return new Response(
        JSON.stringify({ error: 'messages array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    // ── Select model & system prompt ──────────────────────────────────────────
    const isContext = mode === 'context';
    const model = isContext
      ? (env.HF_CONTEXT_MODEL || 'Qwen/Qwen2.5-7B-Instruct')
      : (body.model || env.HF_DEFAULT_MODEL || 'meta-llama/Llama-3.1-8B-Instruct');

    // For context mode, prepend the contextualizer system prompt.
    // For chat mode, messages already include a system message from the client.
    const hfMessages = isContext
      ? [{ role: 'system', content: CONTEXT_SYSTEM_PROMPT }, ...messages]
      : messages;

    const tokens = max_tokens || (isContext ? 384 : 1024);

    // ── Proxy to HuggingFace Inference Router ─────────────────────────────────
    const upstream = await fetch(HF_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.HF_TOKEN}`,
      },
      body: JSON.stringify({
        model,
        messages:   hfMessages,
        stream,
        max_tokens: tokens,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text().catch(() => upstream.statusText);
      return new Response(err, {
        status: upstream.status,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });
    }

    return new Response(openAiToAnthropicSse(upstream.body), {
      headers: {
        ...corsHeaders,
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  },
};
