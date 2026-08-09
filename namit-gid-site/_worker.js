// ─────────────────────────────────────────────────────────────────────────────
//  _worker.js — Namit Gid Admin API
//  Mirrors the Takoshi Worker so the shared admin (takoshi.ca/admin) can manage
//  both brands. Place at the root of the Cloudflare Pages project (namit-gid-site).
//
//  Cloudflare Pages → Settings → Environment variables (Encrypt the secrets):
//    SUPABASE_URL               https://ktgclbvdkhvfvebajtao.supabase.co
//    SUPABASE_KEY               Supabase anon key (namit-gid-by-leni)
//    SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key (server-side uploads)
//    CORRECT_PIN                admin PIN — MUST match Takoshi's so the shared
//                               admin's login token is accepted here too.
//    TOKEN_SECRET               long random string — MUST match Takoshi's, for
//                               the same reason (tokens are validated by secret).
//    RESEND_API_KEY   (optional) order-confirmation emails; skipped if unset.
//    TURNSTILE_SECRET_KEY (optional) bot check on order submit; skipped if unset.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_MS  = 24 * 60 * 60 * 1000; // 24h session
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS   = 15 * 60 * 1000;

const pinAttempts = new Map(); // IP → { count, lockedUntil }

// Origins allowed to call the API: the Namit Gid storefront (its own /api calls)
// and the shared admin hosted on takoshi.ca, plus localhost for development.
const ALLOWED_ORIGINS = [
  'https://namitgid.takoshi.ca',
  'https://takoshi.ca',
];

function corsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://namitgid.takoshi.ca',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function jsonResponse(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

// ── Stateless HMAC session tokens (must match Takoshi's scheme) ───────────────

async function createToken(secret) {
  const timestamp = Date.now().toString();
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp));
  const sig    = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${timestamp}.${sig}`;
}

async function verifyToken(token, secret) {
  try {
    const dot = token.indexOf('.');
    if (dot === -1) return false;
    const timestamp = token.slice(0, dot);
    const sig       = token.slice(dot + 1);
    if (Date.now() - parseInt(timestamp) > TOKEN_EXPIRY_MS) return false;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(timestamp));
  } catch {
    return false;
  }
}

function requireAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return Promise.resolve(false);
  return verifyToken(token, env.TOKEN_SECRET);
}

// ── Order confirmation email (Namit Gid branded, best-effort) ─────────────────

async function sendConfirmationEmail(resendApiKey, order) {
  const { name, email, dish, qty, notes } = order;
  const notesLine = notes
    ? `<tr><td style="padding:6px 0;color:#8a7f74;font-size:13px;">Notes</td><td style="padding:6px 0;font-size:13px;color:#3a332e;">${notes}</td></tr>`
    : '';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f6efe6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6efe6;padding:40px 20px;"><tr><td align="center">
    <table width="100%" style="max-width:520px;background:#fffaf3;border-radius:16px;overflow:hidden;border:1px solid #ece0d1;">
      <tr><td style="padding:32px 36px 20px;text-align:center;border-bottom:1px solid #efe4d6;">
        <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#1f5c3d;">Namit Gid</div>
        <p style="margin:6px 0 0;font-size:13px;color:#9a8f83;">Filipino home cooking · Toronto</p>
      </td></tr>
      <tr><td style="padding:30px 36px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#c2604a;">Order received</p>
        <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:24px;color:#2a241f;">Salamat, ${name}!</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#6f645a;line-height:1.7;">We've got your order. We cook fresh every weekend — we'll be in touch to confirm pickup.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6efe6;border-radius:12px;padding:18px 22px;margin-bottom:24px;">
          <tr><td colspan="2" style="padding-bottom:12px;font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#c07a3a;">Your order</td></tr>
          <tr><td style="padding:6px 0;color:#8a7f74;font-size:13px;width:40%;">Dish</td><td style="padding:6px 0;font-size:13px;color:#3a332e;">${dish}</td></tr>
          <tr><td style="padding:6px 0;color:#8a7f74;font-size:13px;">Quantity</td><td style="padding:6px 0;font-size:13px;color:#3a332e;">${qty}</td></tr>
          ${notesLine}
        </table>
        <p style="margin:0;font-size:13px;color:#9a8f83;">Namit gid — so delicious. 💛</p>
      </td></tr>
      <tr><td style="padding:18px 36px;text-align:center;border-top:1px solid #efe4d6;">
        <p style="margin:0;font-size:11px;color:#b6a89a;">© 2026 Namit Gid · Toronto, ON</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Namit Gid <orders@takoshi.ca>',
      to: [email],
      subject: 'Your Namit Gid order is in 💛',
      html,
    }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Everything that isn't /api/* is served as a static asset by Cloudflare Pages.
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    const SB = env.SUPABASE_URL;
    const sbHeaders = {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
    };
    const sbWrite = { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

    // ── POST /api/verify-pin ──────────────────────────────────────────────────
    if (url.pathname === '/api/verify-pin' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const now = Date.now();
      const record = pinAttempts.get(ip) || { count: 0, lockedUntil: 0 };
      if (record.lockedUntil > now) {
        return jsonResponse({ ok: false, locked: true, retryAfter: Math.ceil((record.lockedUntil - now) / 60000) }, 429, request);
      }
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ ok: false }, 400, request); }
      if (body.pin === env.CORRECT_PIN) {
        pinAttempts.delete(ip);
        return jsonResponse({ ok: true, token: await createToken(env.TOKEN_SECRET) }, 200, request);
      }
      record.count += 1;
      if (record.count >= PIN_MAX_ATTEMPTS) {
        record.lockedUntil = now + PIN_LOCKOUT_MS;
        record.count = 0;
        pinAttempts.set(ip, record);
        return jsonResponse({ ok: false, locked: true, retryAfter: PIN_LOCKOUT_MS / 60000 }, 429, request);
      }
      pinAttempts.set(ip, record);
      await new Promise(r => setTimeout(r, 1000));
      return jsonResponse({ ok: false, attemptsLeft: PIN_MAX_ATTEMPTS - record.count }, 401, request);
    }

    // ── GET /api/orders (admin) ───────────────────────────────────────────────
    if (url.pathname === '/api/orders' && request.method === 'GET') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      const res = await fetch(`${SB}/rest/v1/orders?select=*&order=created_at.desc`, { headers: sbHeaders });
      return jsonResponse(await res.json(), res.ok ? 200 : res.status, request);
    }

    // ── PATCH /api/orders/:id (admin) ─────────────────────────────────────────
    if (url.pathname.startsWith('/api/orders/') && request.method === 'PATCH') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      const id = url.pathname.split('/api/orders/')[1];
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      // Namit Gid's orders table allows: pending | confirmed | ready | picked_up | cancelled.
      // The shared admin may send Takoshi's 'completed' — map it to 'picked_up'.
      let status = body.status === 'completed' ? 'picked_up' : body.status;
      const allowed = ['pending', 'confirmed', 'ready', 'picked_up', 'cancelled'];
      if (!allowed.includes(status)) return jsonResponse({ error: 'Invalid status' }, 400, request);
      const res = await fetch(`${SB}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: sbWrite, body: JSON.stringify({ status }),
      });
      if (!res.ok) return jsonResponse({ error: 'Failed to update' }, 500, request);
      return jsonResponse({ ok: true }, 200, request);
    }

    // ── GET /api/availability (public) ────────────────────────────────────────
    if (url.pathname === '/api/availability' && request.method === 'GET') {
      const res = await fetch(`${SB}/rest/v1/store_schedule?id=eq.1&select=*`, { headers: sbHeaders });
      const rows = await res.json();
      const s = rows[0];
      if (!s) return jsonResponse({ available: true }, 200, request);
      const nowTs = new Date();
      const windows = [];
      if (s.unavailable_until && new Date(s.unavailable_until) > nowTs) {
        windows.push({ from: s.unavailable_from || null, until: s.unavailable_until });
      }
      try {
        const cRes = await fetch(
          `${SB}/rest/v1/closures?unavailable_until=gt.${encodeURIComponent(nowTs.toISOString())}&select=unavailable_from,unavailable_until&order=unavailable_from.asc`,
          { headers: sbHeaders });
        if (cRes.ok) {
          (await cRes.json()).forEach(c => {
            const dup = windows.some(w =>
              new Date(w.until).getTime() === new Date(c.unavailable_until).getTime() &&
              String(w.from || '') !== '' && c.unavailable_from &&
              new Date(w.from).getTime() === new Date(c.unavailable_from).getTime());
            if (!dup) windows.push({ from: c.unavailable_from, until: c.unavailable_until });
          });
        }
      } catch (e) { /* fall back to single live window */ }
      const inWindow  = w => (!w.from || new Date(w.from) <= nowTs) && new Date(w.until) > nowTs;
      const activeWin = windows.find(inWindow) || null;
      const closedIndefinitely = s.is_available === false && !s.unavailable_until;
      const available = !activeWin && !closedIndefinitely;
      const upcoming = windows.filter(w => w.from && new Date(w.from) > nowTs)
        .sort((a, b) => new Date(a.from) - new Date(b.from))[0] || null;
      const shown = activeWin || upcoming;
      return jsonResponse({
        available,
        message: s.unavailable_message || "We're currently closed for orders.",
        from: shown ? shown.from : null,
        until: shown ? shown.until : null,
        windows,
      }, 200, request);
    }

    // ── POST /api/availability (admin) ────────────────────────────────────────
    if (url.pathname === '/api/availability' && request.method === 'POST') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      const res = await fetch(`${SB}/rest/v1/store_schedule?id=eq.1`, {
        method: 'PATCH', headers: sbWrite,
        body: JSON.stringify({
          is_available: body.is_available,
          unavailable_from: body.unavailable_from || null,
          unavailable_until: body.unavailable_until || null,
          unavailable_message: body.unavailable_message || null,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) return jsonResponse({ error: 'Failed to save' }, 500, request);
      try {
        const chUrl = `${SB}/rest/v1/closures`;
        const nowISO = new Date().toISOString();
        const cFrom = body.unavailable_from || null;
        const cUntil = body.unavailable_until || null;
        const closingNow = body.is_available === false;
        const scheduledFuture = body.is_available === true && cFrom && new Date(cFrom) > new Date();
        if (cUntil && (closingNow || scheduledFuture)) {
          const effFrom = cFrom || nowISO;
          await fetch(`${chUrl}?unavailable_from=eq.${encodeURIComponent(effFrom)}`, { method: 'DELETE', headers: sbWrite });
          await fetch(chUrl, { method: 'POST', headers: sbWrite,
            body: JSON.stringify({ unavailable_from: effFrom, unavailable_until: cUntil, message: body.unavailable_message || null }) });
        } else if (body.is_available === true) {
          await fetch(`${chUrl}?unavailable_from=lte.${encodeURIComponent(nowISO)}&unavailable_until=gt.${encodeURIComponent(nowISO)}`, { method: 'DELETE', headers: sbWrite });
        }
      } catch (e) { /* best-effort */ }
      return jsonResponse({ ok: true }, 200, request);
    }

    // ── GET /api/closures (admin) ─────────────────────────────────────────────
    if (url.pathname === '/api/closures' && request.method === 'GET') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      const res = await fetch(`${SB}/rest/v1/closures?select=unavailable_from,unavailable_until,message&order=unavailable_from.desc`, { headers: sbHeaders });
      if (!res.ok) return jsonResponse({ error: 'Failed to load' }, 500, request);
      return jsonResponse(await res.json(), 200, request);
    }

    // ── DELETE /api/closures?from=<ISO> (admin) ───────────────────────────────
    if (url.pathname === '/api/closures' && request.method === 'DELETE') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      const from = url.searchParams.get('from') || '';
      if (!from) return jsonResponse({ error: 'Missing from' }, 400, request);
      const res = await fetch(`${SB}/rest/v1/closures?unavailable_from=eq.${encodeURIComponent(from)}`, { method: 'DELETE', headers: sbWrite });
      if (!res.ok) return jsonResponse({ error: 'Failed to delete' }, 500, request);
      try {
        const sRes = await fetch(`${SB}/rest/v1/store_schedule?id=eq.1&select=unavailable_from`, { headers: sbHeaders });
        const sRow = (await sRes.json())[0];
        if (sRow && sRow.unavailable_from && new Date(sRow.unavailable_from).getTime() === new Date(from).getTime()) {
          await fetch(`${SB}/rest/v1/store_schedule?id=eq.1`, { method: 'PATCH', headers: sbWrite,
            body: JSON.stringify({ is_available: true, unavailable_from: null, unavailable_until: null, updated_at: new Date().toISOString() }) });
        }
      } catch (e) { /* non-fatal */ }
      return jsonResponse({ ok: true }, 200, request);
    }

    // ── POST /api/upload-deposit (public) ─────────────────────────────────────
    if (url.pathname === '/api/upload-deposit' && request.method === 'POST') {
      let formData;
      try { formData = await request.formData(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      const file = formData.get('file');
      if (!file || typeof file === 'string') return jsonResponse({ error: 'No file provided' }, 400, request);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return jsonResponse({ error: 'Invalid file type' }, 400, request);
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      const uploadRes = await fetch(`${SB}/storage/v1/object/deposits/${filename}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'false' },
        body: arrayBuffer,
      });
      if (!uploadRes.ok) return jsonResponse({ error: 'Upload failed' }, 500, request);
      return jsonResponse({ url: `${SB}/storage/v1/object/public/deposits/${filename}` }, 200, request);
    }

    // ── POST /api/upload-review-photo (admin) ─────────────────────────────────
    if (url.pathname === '/api/upload-review-photo' && request.method === 'POST') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      let formData;
      try { formData = await request.formData(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      const file = formData.get('file');
      if (!file || typeof file === 'string') return jsonResponse({ error: 'No file provided' }, 400, request);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return jsonResponse({ error: 'Invalid file type' }, 400, request);
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      const uploadRes = await fetch(`${SB}/storage/v1/object/reviews/${filename}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'false' },
        body: arrayBuffer,
      });
      if (!uploadRes.ok) return jsonResponse({ error: 'Upload failed' }, 500, request);
      return jsonResponse({ url: `${SB}/storage/v1/object/public/reviews/${filename}` }, 200, request);
    }

    // ── POST /api/submit-order (public) — proxy to the Supabase edge function ──
    if (url.pathname === '/api/submit-order' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      if (env.TURNSTILE_SECRET_KEY) {
        const fd = new FormData();
        fd.append('secret', env.TURNSTILE_SECRET_KEY);
        fd.append('response', body.token || '');
        const cf = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
        const cfData = await cf.json();
        if (!cfData.success) return jsonResponse({ error: 'Security check failed. Please refresh and try again.' }, 403, request);
      }
      const res = await fetch(`${SB}/functions/v1/submit-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.SUPABASE_KEY}`, 'apikey': env.SUPABASE_KEY },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && body.order?.email && env.RESEND_API_KEY) {
        try { await sendConfirmationEmail(env.RESEND_API_KEY, body.order); } catch (e) { /* email never breaks order */ }
      }
      return jsonResponse(data, res.ok ? 200 : res.status, request);
    }

    // ── GET /api/reviews (public) ─────────────────────────────────────────────
    if (url.pathname === '/api/reviews' && request.method === 'GET') {
      const res = await fetch(`${SB}/rest/v1/reviews?visible=eq.true&order=display_order.asc`, { headers: sbHeaders });
      const data = await res.json().catch(() => []);
      return jsonResponse(data, res.ok ? 200 : 500, request);
    }

    // ── POST /api/submit-review (public) — saved hidden until admin approves ──
    if (url.pathname === '/api/submit-review' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      if (!body.name || !body.text) return jsonResponse({ error: 'name and text required' }, 400, request);
      const res = await fetch(`${SB}/rest/v1/reviews`, {
        method: 'POST', headers: sbWrite,
        body: JSON.stringify({
          name: String(body.name).slice(0, 60),
          review_text: String(body.text).slice(0, 400),
          stars: Math.min(5, Math.max(1, parseInt(body.stars, 10) || 5)),
          visible: false,
        }),
      });
      if (!res.ok) return jsonResponse({ error: 'Failed to save review' }, 500, request);
      return jsonResponse({ ok: true }, 201, request);
    }

    // ── GET /api/reviews/all (admin) ──────────────────────────────────────────
    if (url.pathname === '/api/reviews/all' && request.method === 'GET') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      const res = await fetch(`${SB}/rest/v1/reviews?order=display_order.asc`, { headers: sbHeaders });
      return jsonResponse(await res.json().catch(() => []), res.ok ? 200 : 500, request);
    }

    // ── POST /api/reviews (admin) ─────────────────────────────────────────────
    if (url.pathname === '/api/reviews' && request.method === 'POST') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      const res = await fetch(`${SB}/rest/v1/reviews`, {
        method: 'POST', headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
      });
      return jsonResponse(await res.json().catch(() => ({})), res.ok ? 201 : 500, request);
    }

    // ── PATCH /api/reviews/:id (admin) ────────────────────────────────────────
    if (url.pathname.startsWith('/api/reviews/') && request.method === 'PATCH') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      const id = url.pathname.split('/api/reviews/')[1];
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      const res = await fetch(`${SB}/rest/v1/reviews?id=eq.${id}`, {
        method: 'PATCH', headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
      });
      return jsonResponse(await res.json().catch(() => ({})), res.ok ? 200 : 500, request);
    }

    // ── DELETE /api/reviews/:id (admin) ───────────────────────────────────────
    if (url.pathname.startsWith('/api/reviews/') && request.method === 'DELETE') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      const id = url.pathname.split('/api/reviews/')[1];
      const res = await fetch(`${SB}/rest/v1/reviews?id=eq.${id}`, { method: 'DELETE', headers: sbHeaders });
      return jsonResponse({ ok: res.ok }, res.ok ? 200 : 500, request);
    }

    // ── GET /api/referral-stats (admin) — best-effort so admin page 2 loads ───
    if (url.pathname === '/api/referral-stats' && request.method === 'GET') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      const res = await fetch(`${SB}/rest/v1/referrals?select=referrer_phone,reward_status,created_at`, { headers: sbHeaders });
      if (!res.ok) return jsonResponse({ total: 0, pending: 0, redeemed: 0, top: [], monthly: [] }, 200, request);
      const rows = await res.json().catch(() => []);
      let pending = 0, redeemed = 0; const counts = {}, monthCounts = {};
      (rows || []).forEach(r => {
        if (r.reward_status === 'redeemed') redeemed++; else pending++;
        if (r.referrer_phone) counts[r.referrer_phone] = (counts[r.referrer_phone] || 0) + 1;
        if (r.created_at) { const ym = String(r.created_at).slice(0, 7); monthCounts[ym] = (monthCounts[ym] || 0) + 1; }
      });
      const top = Object.entries(counts).map(([phone, count]) => ({ phone, count })).sort((a, b) => b.count - a.count).slice(0, 5);
      const monthly = []; const now = new Date();
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthly.push({ month: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), count: monthCounts[d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')] || 0 });
      }
      return jsonResponse({ total: (rows || []).length, pending, redeemed, top, monthly }, 200, request);
    }

    // ── GET /api/slot-load (public) — Namit Gid has no timed slots yet ────────
    if (url.pathname === '/api/slot-load' && request.method === 'GET') {
      return jsonResponse({ load: {} }, 200, request);
    }

    return jsonResponse({ error: 'Not found' }, 404, request);
  },
};
