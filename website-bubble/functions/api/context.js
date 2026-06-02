/**
 * Cloudflare Pages Function — /api/context
 *
 * Streams a contextualizing-agent response from the bubble-hf-worker.
 * Called in parallel with /api/chat; response is displayed as a collapsible
 * "🔍 Context" annotation beneath the primary AI reply. Never stored in history.
 *
 * Required CF Pages environment variables (set as encrypted secrets):
 *   HF_WORKER_URL     — URL of your deployed bubble-hf-worker
 *   HF_WORKER_SECRET  — shared secret for X-Bubble-Auth header
 *   HF_CONTEXT_ENABLED — set to "true" to activate (default: disabled)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  const hfWorkerUrl      = env.HF_WORKER_URL    || '';
  const hfWorkerSecret   = env.HF_WORKER_SECRET || '';
  const hfContextEnabled = (env.HF_CONTEXT_ENABLED || '').toLowerCase() === 'true';

  if (!hfWorkerUrl || !hfContextEnabled) {
    return new Response(
      JSON.stringify({ error: 'Context agent not configured.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
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

  const hfMessages = messages.map(m => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : (m.content || ''),
  }));

  const upstream = await fetch(hfWorkerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bubble-Auth': hfWorkerSecret },
    body: JSON.stringify({ messages: hfMessages, mode: 'context', stream: true }),
  });

  if (!upstream.ok) {
    const err = await upstream.text().catch(() => upstream.statusText);
    return new Response(JSON.stringify({ error: err }), {
      status: upstream.status, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
