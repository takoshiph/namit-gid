// ─────────────────────────────────────────────────────────────────────────────
//  _worker.js — Namit Gid Admin API
//  Mirrors the Takoshi Worker so the shared admin (takoshi.ca/admin) can manage
//  both brands. Place at the root of the Cloudflare Pages project (namit-gid-site).
//
//  Cloudflare Pages → Settings → Environment variables (Encrypt the secrets):
//    SUPABASE_URL               https://ktgclbvdkhvfvebajtao.supabase.co
//    SUPABASE_KEY               Supabase anon key (namit-gid-by-leni)
//    SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key — REQUIRED. Every table
//                               in this project has RLS on with no policies, so
//                               anything but the service role reads back empty and
//                               writes silently affect zero rows.
//    CORRECT_PIN                admin PIN — MUST match Takoshi's so the shared
//                               admin's login token is accepted here too.
//    TOKEN_SECRET               long random string — MUST match Takoshi's, for
//                               the same reason (tokens are validated by secret).
//    RESEND_API_KEY   (optional) order-confirmation emails; skipped if unset.
//    TURNSTILE_SECRET_KEY (optional) bot check on order submit. LEAVE UNSET unless
//                               you also add a Turnstile widget to index.html — the
//                               storefront sends no token, so setting this alone
//                               makes every order fail the check.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_MS  = 24 * 60 * 60 * 1000; // 24h session
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS   = 15 * 60 * 1000;
const DEPOSIT          = 10;
const BLOCK_WINDOW_MIN = 90;   // one order reserves a 1.5h prep window

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

// ── Order shape translation ──────────────────────────────────────────────────
// Namit Gid's orders table speaks a different vocabulary from Takoshi's
// (dish/qty/customer_name/contact vs size/filling/sauce/name/phone), but the
// shared admin only knows Takoshi's. Translate on the way out and back on the
// way in, so one admin renders both brands without a fork.
//
// Status: Namit allows pending|confirmed|ready|picked_up|cancelled; the admin
// knows pending|confirmed|completed|cancelled.

const STATUS_OUT = { picked_up: 'completed', ready: 'confirmed' };
const STATUS_IN  = { completed: 'picked_up' };

function toAdminOrder(o) {
  const total = o.total != null ? Number(o.total) : null;
  const balance = o.balance_due != null
    ? Number(o.balance_due)
    : (total != null ? Math.max(0, total - DEPOSIT) : null);
  return {
    ...o,                                  // keep dish/qty/unit_price/total intact
    status:      STATUS_OUT[o.status] || o.status || 'pending',
    name:        o.customer_name,
    phone:       o.contact,
    email:       o.email || null,
    size:        total != null ? `${o.dish} · $${total.toFixed(2)}` : o.dish,
    filling:     o.qty != null ? `Qty ${o.qty}` : '',
    sauce:       o.deposit_amount != null
      ? `Half, $${Number(o.deposit_amount).toFixed(2)}${o.deposit_screenshot_url ? ' · screenshot sent' : ''}`
      : (o.deposit_screenshot_url ? 'Deposit screenshot received' : 'No deposit screenshot'),
    pickup_date: o.pickup_date || null,
    pickup_time: o.pickup_time || null,
    balance_due: balance,
    discount_type: 'none',
    discount_pct:  0,
  };
}

// ── Pickup-time helpers (same scale as the submit-order edge function) ───────

function timeToMin(t) {
  const m = String(t || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

// Everything a customer typed is escaped before it goes into an email: the
// address is theirs to choose, so unescaped HTML here would let anyone send
// formatted mail from orders@takoshi.ca.
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Review request email (admin-triggered) ─────────────────────────────────────

async function sendReviewRequestEmail(resendApiKey, { name, email, dish }) {
  const n = firstName(name), d = String(dish || '').trim();
  return sendMail(resendApiKey, email, 'Was it namit gid?', emailHtml({ heading: `Was it namit gid, ${n}?`,
    paras: [`Salamat for ordering ${d ? 'the ' + d : 'from me'}. If you enjoyed it, would you write me a line or two? It helps other people find my kitchen.`],
    button: { href: `${SITE}/?review=1`, text: 'Write a review' } }));
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  // A paused or unreachable database makes fetch() itself throw, which
  // Cloudflare turns into an HTML "error 1101". Answer JSON the storefront
  // understands instead, so it falls back to "message me".
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      console.error('[namitgid] unhandled error on', new URL(request.url).pathname, e);
      return jsonResponse({ error: 'backend_unavailable', available: false, reason: 'backend_unavailable',
        message: 'I can’t take online orders right now. Please message me and I’ll sort it out.', windows: [] }, 503, request);
    }
  },
};

// ── Order requests ────────────────────────────────────────────────────────────
// A tray is a request. Leny gets an email with Yes / No; a yes asks the
// customer for half the total as a deposit (their order page has the details);
// once Leny sees it in her bank she confirms. The links carry a per-order
// secret: `token` for the customer's page, `admin_token` for Leny's buttons.
const SITE = 'https://namitgid.takoshi.ca';
const LENY_EMAIL_DEFAULT = 'takoshi.phstore@gmail.com';   // same default as the order function
const DEPOSIT_HOURS = 2;    // after a yes, how long the customer has to send the deposit
const ACTIVE_STATUSES = ['requested', 'accepted', 'verifying', 'confirmed', 'pending', 'ready'];
const ORDER_FIELDS = 'id,status,dish,total,deposit_amount,balance_due,customer_name,contact,email,notes,pickup_date,pickup_time,created_at,accepted_at,deposit_sent_at,deposit_screenshot_url,token,admin_token';

const money2 = n => '$' + Number(n || 0).toFixed(2);
// a deposit screenshot reference, as /api/upload-deposit hands it out
const DEPOSIT_REF = /^deposit:\d+-[a-z0-9]+\.(jpg|jpeg|png|webp|heic)$/;
// A link to a private screenshot that works for a few minutes. Older orders
// may hold a full public address from before the bucket went private.
async function depositShotLink(env, ref, seconds = 600) {
  if (!ref) return null;
  if (!DEPOSIT_REF.test(ref)) return /^https:\/\//.test(ref) ? ref : null;
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/deposits/${ref.slice(8)}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  return j.signedURL ? `${env.SUPABASE_URL}/storage/v1${j.signedURL}` : null;
}
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
const orderLink = o => `${SITE}/?order=${o.id}&t=${o.token}`;
const decideLink = o => `${SITE}/api/decide?id=${o.id}&t=${o.admin_token}`;
const pickupText = o => o.pickup_date
  ? new Date(o.pickup_date + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) + (o.pickup_time ? ' at ' + o.pickup_time : '')
  : 'your pickup';
// "5:23 PM", like the pickup times (en-CA writes "5:23 p.m.", which doubles a full stop)
const torontoTime = iso => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });
const depositDeadline = o => o.accepted_at ? new Date(new Date(o.accepted_at).getTime() + DEPOSIT_HOURS * 3600_000).toISOString() : null;
function waTo(phone, text) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 10) return '';
  return 'https://wa.me/' + (d.length === 10 ? '1' + d : d) + '?text=' + encodeURIComponent(text);
}

// Every email shares one frame: paper, Leny at the top, a wooden button. Customer
// mail is in Leny's words and signed by her; mail to Leny is the order, short.
// `paras` are plain text (escaped here); `rows` values are HTML the caller escaped.
const EMAIL_FONTS = '<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=Young+Serif&family=Caveat:wght@600&display=swap" rel="stylesheet">';
const SANS = "'Atkinson Hyperlegible Next',Arial,Helvetica,sans-serif";
const SERIF = "'Young Serif',Georgia,serif";
function emailHtml({ heading, paras = [], rows = [], button, link, toLeny = false }) {
  const row = (l, v) => `<tr><td valign="top" style="padding:5px 12px 5px 0;width:34%;font:13px/1.5 ${SANS};color:#6B5747;">${escHtml(l)}</td><td style="padding:5px 0;font:14px/1.5 ${SANS};color:#2B2119;">${v}</td></tr>`;
  const top = toLeny
    ? `<p style="margin:0 0 14px;font:16px/1 ${SERIF};color:#A3462A;">Namit gid</p>`
    : `<p style="margin:0 0 18px;text-align:center;"><img src="${SITE}/assets/img/email/leny.png" width="120" height="70" alt="Leny" style="display:inline-block;border:0;width:120px;height:auto;"><br><span style="font:22px/1.4 ${SERIF};color:#A3462A;">Namit gid</span></p>`;
  const sign = toLeny ? '' : `<p style="margin:26px 0 0;font:600 26px/1 Caveat,'Segoe Print','Bradley Hand',cursive;color:#A3462A;">Leny</p>
    <p style="margin:6px 0 0;font:13px/1.6 ${SANS};color:#6B5747;">Namit Gid, near Fairview Mall<br><a href="${SITE}" style="color:#1E5A63;">namitgid.takoshi.ca</a></p>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${EMAIL_FONTS}</head>
<body style="margin:0;padding:0;background:#F3EADB;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EADB;padding:28px 14px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#FFFBF3;border:1px solid #E6D6B8;border-radius:14px 11px 13px 12px;">
  <tr><td style="padding:${toLeny ? '22px 24px' : '26px 30px 28px'};">
    ${top}
    <h1 style="margin:0 0 14px;font:400 ${toLeny ? 21 : 25}px/1.25 ${SERIF};color:#2B2119;">${escHtml(heading)}</h1>
    ${paras.map(p => `<p style="margin:0 0 12px;font:16px/1.6 ${SANS};color:#4A3B2F;">${escHtml(p)}</p>`).join('')}
    ${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EADB;border-radius:10px 8px 9px 8px;margin:8px 0 6px;"><tr><td style="padding:12px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([l, v]) => row(l, v)).join('')}</table></td></tr></table>` : ''}
    ${button ? `<p style="margin:20px 0 0;text-align:center;"><a href="${escHtml(button.href)}" style="display:inline-block;padding:13px 26px;border-radius:12px 9px 11px 10px;background:#DDB582 url(${SITE}/assets/img/email/wood.jpg) 50% 50%/cover;border:1.5px solid #8A5A30;border-bottom-width:3px;color:#3B2212;font:700 16px/1.2 ${SANS};text-decoration:none;">${escHtml(button.text)}</a></p>` : ''}
    ${link ? `<p style="margin:12px 0 0;text-align:center;font:14px/1.5 ${SANS};"><a href="${escHtml(link.href)}" style="color:#1E5A63;">${escHtml(link.text)}</a></p>` : ''}
    ${sign}
  </td></tr></table>
</td></tr></table>
</body></html>`;
}
async function sendMail(key, to, subject, html) {
  if (!key || !to) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Namit Gid <orders@takoshi.ca>', to: [to], subject, html }),
  });
  if (!res.ok) throw new Error('resend ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200));
  return true;
}
// "Saturday, November 7 at 12:30 PM" for customers, "Sat Nov 7, 12:30 PM" for Leny
const shortPickup = o => o.pickup_date
  ? new Date(o.pickup_date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '') + (o.pickup_time ? ', ' + o.pickup_time : '')
  : 'no pickup time';
const weekday = o => o.pickup_date ? new Date(o.pickup_date + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'long', timeZone: 'UTC' }) : 'pickup';
const MAP_URL = 'https://maps.google.com/?q=180+Fairview+Mall+Dr,+North+York,+ON';
const dishLines = o => escHtml(o.dish).split(' · ').join('<br>');
const orderRows = o => [
  ['Order', dishLines(o)],
  ['Pickup', escHtml(pickupText(o))],
  ['Where', `<a href="${MAP_URL}" style="color:#1E5A63;">180 Fairview Mall Dr, North York</a>`],
  ['Total', money2(o.total)],
  ['Deposit', money2(o.deposit_amount)],
  ['At pickup', money2(o.balance_due)],
];
// "5:23 PM today", or "tomorrow" when the deadline crosses midnight in Toronto
function deadlineText(o) {
  const d = depositDeadline(o); if (!d) return 'soon';
  const day = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  return torontoTime(d) + (day(d) === day(o.accepted_at) ? ' today' : ' tomorrow');
}

async function sendRequestReceivedEmail(key, order, result) {
  const o = { id: result.orderId, token: result.token, dish: result.dish, total: result.total, deposit_amount: result.deposit,
    balance_due: result.balanceDue, pickup_date: order.pickupDate, pickup_time: order.pickup };
  const name = firstName(order.name);
  return sendMail(key, order.email, `I got your request, ${name}`, emailHtml({
    heading: `Salamat, ${name}!`,
    paras: [`I got your request for ${pickupText(o)}. I’ll reply within the hour.`,
      `If I can make it, I’ll send you a link for the ${money2(o.deposit_amount)} deposit. That’s half, and you pay the rest at pickup. Nothing is charged until we both agree.`],
    rows: orderRows(o), button: { href: orderLink(o), text: 'See my request' } }));
}
const customerEmails = {
  accepted: o => ['I can make your order!', emailHtml({ heading: `It’s a deal, ${firstName(o.customer_name)}!`,
    paras: [`I can make your order for ${pickupText(o)}.`,
      `To hold your spot, please send the ${money2(o.deposit_amount)} deposit by e-Transfer before ${deadlineText(o)}. Once it’s in, I’ll go shopping for your order.`],
    rows: orderRows(o), button: { href: orderLink(o), text: 'Send my deposit' } })],
  declined: o => ['About your request', emailHtml({ heading: `Really sorry, ${firstName(o.customer_name)}`,
    paras: [`I can’t make ${pickupText(o)}. I’d still love to cook for you, so I’ll message you soon to find another day.`, 'Nothing was charged.'] })],
  confirmed: o => [`You’re all set for ${weekday(o)}`, emailHtml({ heading: `See you ${weekday(o)}, ${firstName(o.customer_name)}!`,
    paras: [`I got your deposit. Salamat! Your order is booked for ${pickupText(o)}.`,
      `Please bring the other ${money2(o.balance_due)}, cash or e-Transfer.`],
    rows: orderRows(o), button: { href: MAP_URL, text: 'Get directions' }, link: { href: orderLink(o), text: 'See my order' } })],
};
async function mailCustomer(env, o, kind) {
  if (!o.email || !customerEmails[kind]) return 'no_email';
  try { const [subject, html] = customerEmails[kind](o); await sendMail(env.RESEND_API_KEY, o.email, subject, html); return 'sent'; }
  catch (e) { console.error('[namitgid] customer email failed', kind, o.id, e); return 'failed'; }
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256hex = async str => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
const reviewLink = r => `${SITE}/api/review?id=${r.id}&t=${r.admin_token}`;
// Leny's page for one review: read it, then show it on the site or keep it hidden
function lenyReviewPage(r, done) {
  const form = b => `<form method="post" action="/api/review"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="t" value="${escHtml(r.admin_token)}">${b}</form>`;
  return lenyPage('Namit Gid · review from ' + r.name, `
    <p class="tag">${r.visible ? 'On the site' : 'Hidden'}</p>
    <h1>${escHtml(done || r.name + ' wrote a review')}</h1>
    <div class="card"><p style="margin:0;font-size:18px">“${escHtml(r.review_text)}”</p>
      <p class="muted" style="margin:8px 0 0">${escHtml(r.name)}${r.dish ? ', ' + escHtml(r.dish[0].toUpperCase() + r.dish.slice(1).replace(/-/g, ' ')) : ''} · ${r.order_id ? 'from order #' + r.order_id : 'from the website'}</p></div>
    ${form(r.visible ? '<button class="no" name="d" value="hide">Hide it</button>' : '<button class="yes" name="d" value="show">Show on site</button><button class="no" name="d" value="hide">Keep it hidden</button>')}
    <p class="muted">Shown reviews appear in that dish’s window with their first name.</p>`);
}

// What Leny needs from an order, nothing more
const lenyRows = o => [
  ['Pickup', escHtml(shortPickup(o))],
  ['Order', dishLines(o)],
  ['Total', `${money2(o.total)} (deposit ${money2(o.deposit_amount)}, ${money2(o.balance_due)} at pickup)`],
  ['Customer', [o.customer_name, o.contact, o.email].filter(Boolean).map(escHtml).join('<br>')],
];

// Leny's pages, behind the buttons in her emails. A link only shows the page;
// the choice is a button on it, because mail scanners open links on their own.
function lenyPage(title, inner, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700&family=Young+Serif&display=swap" rel="stylesheet">
<style>body{margin:0;background:#F3EADB radial-gradient(70% 40% at 85% 0,rgba(233,182,107,.22),transparent 70%);font:16px/1.5 'Atkinson Hyperlegible Next',-apple-system,'Segoe UI',sans-serif;color:#2a241f}main{max-width:480px;margin:0 auto;padding:28px 18px 40px}
h1{font:400 28px/1.2 'Young Serif',Georgia,serif;margin:0 0 6px}.lead{margin:0 0 14px;color:#6f645a}.card{background:#FBF5EA;border:0;border-radius:10px 14px 11px 15px;box-shadow:inset 0 0 0 1px rgba(110,72,38,.2),0 2px 6px rgba(60,38,20,.08);padding:14px 18px;margin:14px 0}
.row{display:flex;justify-content:space-between;gap:14px;padding:5px 0;font-size:15px;border-bottom:1px solid #f1e8dc}.row:last-child{border:0}.row span:first-child{color:#8a7f74;flex:none}.row span:last-child{text-align:right}
button,.btn{display:block;width:100%;box-sizing:border-box;margin:10px 0 0;padding:16px;border-radius:12px;border:0;font-family:inherit;font-size:17px;font-weight:700;line-height:1.2;text-align:center;text-decoration:none;cursor:pointer}
.yes{color:#3B2212;text-shadow:0 1px 0 rgba(255,235,200,.6);background:linear-gradient(rgba(255,240,214,.22),rgba(90,55,25,.14)),url(/assets/img/sign-board.webp) 50% 58%/320% auto;box-shadow:inset 0 0 0 1.5px rgba(110,72,38,.55),0 3px 0 #8A5A30}.no{background:#fff;color:#A3462A;border:1.5px solid #A3462A}.wa{background:#25D366;color:#063b1b}.muted{color:#8a7f74;font-size:14px}.tag{display:inline-block;padding:3px 10px;border-radius:99px;background:#efe4d6;font-size:13px;font-weight:600}</style></head>
<body><main>${inner}</main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
const STATUS_WORDS = { requested: 'Waiting for your answer', accepted: 'Waiting for their deposit', verifying: 'Deposit sent: check your bank',
  confirmed: 'Confirmed', declined: 'You said no', expired: 'Expired: no deposit in time', cancelled: 'Cancelled', completed: 'Completed', pending: 'Order', ready: 'Ready', picked_up: 'Picked up' };
function lenyOrderCard(o) {
  const r = (l, v) => `<div class="row"><span>${escHtml(l)}</span><span>${v}</span></div>`;
  return `<div class="card">
    ${r('Order', escHtml(o.dish).split(' · ').join('<br>'))}${r('Pickup', escHtml(pickupText(o)))}
    ${r('Total', money2(o.total))}${r('Deposit', money2(o.deposit_amount))}${r('At pickup', money2(o.balance_due))}
  </div><div class="card">
    ${r('Name', escHtml(o.customer_name))}${r('Phone', escHtml(o.contact))}${o.email ? r('Email', escHtml(o.email)) : ''}${o.notes ? r('Notes', escHtml(o.notes)) : ''}
  </div>`;
}
function lenyDecidePage(o, { done, focus } = {}) {
  const first = firstName(o.customer_name), pickup = pickupText(o);
  const form = (buttons) => `<form method="post" action="/api/decide"><input type="hidden" name="id" value="${o.id}"><input type="hidden" name="t" value="${escHtml(o.admin_token)}">${buttons}</form>`;
  const waText = {
    requested: `Hi ${first}! This is Leny from Namit Gid, about your order for ${pickup}.`,
    accepted: `Hi ${first}! Leny here from Namit Gid. I can make your order for ${pickup}. Please send the ${money2(o.deposit_amount)} deposit here: ${orderLink(o)}`,
    verifying: `Hi ${first}! Leny here from Namit Gid, about your deposit for ${pickup}.`,
    confirmed: `Hi ${first}! Leny here from Namit Gid. Your order for ${pickup} is confirmed. See you then!`,
    declined: `Hi ${first}! Leny here from Namit Gid. I'm sorry, I can't make ${pickup}. Could another day or time work for you?`,
    expired: `Hi ${first}! Leny here from Namit Gid, about your order for ${pickup}. Do you still want it?`,
  }[o.status];
  const wa = waText ? waTo(o.contact, waText) : '';
  let action = '';
  if (o.status === 'requested') {
    const yes = '<button class="yes" name="d" value="yes">Yes, I can make it</button>', no = '<button class="no" name="d" value="no">No, I\'ll message them</button>';
    action = form(focus === 'no' ? no + yes : yes + no) + `<p class="muted">A yes asks ${escHtml(first)} for the ${money2(o.deposit_amount)} deposit right away. They have ${DEPOSIT_HOURS} hours to send it.</p>`;
  } else if (o.status === 'accepted') {
    action = `<p class="lead">${escHtml(first)} has until ${torontoTime(depositDeadline(o))} to send the ${money2(o.deposit_amount)} deposit.</p>` + form('<button class="no" name="d" value="paid">The deposit is already in my bank</button>');
  } else if (o.status === 'verifying') {
    action = `<p class="lead">${escHtml(first)} says the ${money2(o.deposit_amount)} deposit is sent. Check your bank, then confirm.</p>`
      + (o.deposit_screenshot_url ? `<p><a href="/api/deposit-shot?id=${o.id}&amp;t=${escHtml(o.admin_token)}">See their screenshot</a></p>` : '')
      + form('<button class="yes" name="d" value="paid">Deposit received: confirm the order</button>');
  }
  return lenyPage('Namit Gid · ' + o.customer_name, `
    <p class="tag">${escHtml(STATUS_WORDS[o.status] || o.status)}</p>
    <h1>${escHtml(done || o.customer_name + "'s request")}</h1>
    ${action}
    ${wa ? `<a class="btn wa" href="${escHtml(wa)}">Message ${escHtml(first)} on WhatsApp</a>` : ''}
    ${lenyOrderCard(o)}`);
}

async function handle(request, env) {
  {
    const url = new URL(request.url);

    // Everything that isn't /api/* is served as a static asset by Cloudflare Pages.
    if (!url.pathname.startsWith('/api/')) {
      const res = await env.ASSETS.fetch(request);
      // Pages answers an unknown path with index.html. For a missing image or
      // script that hides the mistake and feeds the browser a page instead.
      if ((url.pathname.startsWith('/assets/') || url.pathname.startsWith('/images/')) && (res.headers.get('content-type') || '').startsWith('text/html')) {
        return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
      }
      return res;
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    const SB = env.SUPABASE_URL;
    // Every table in this project has RLS enabled with no policies, so the anon
    // key reads back an empty array and writes report success while changing
    // nothing. The Worker is the trust boundary (admin routes check the session
    // token first), so it talks to PostgREST as the service role.
    const SB_ADMIN_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
    const sbHeaders = {
      'apikey': SB_ADMIN_KEY,
      'Authorization': `Bearer ${SB_ADMIN_KEY}`,
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
      if (!res.ok) return jsonResponse({ error: 'Failed to load' }, res.status, request);
      const rows = await res.json().catch(() => []);
      if (!Array.isArray(rows)) return jsonResponse(rows, 200, request);
      const out = await Promise.all(rows.map(async o => {
        const a = toAdminOrder(o);
        delete a.token; delete a.admin_token;   // the links' secrets stay out of the browser
        if (o.deposit_screenshot_url) a.deposit_shot_url = await depositShotLink(env, o.deposit_screenshot_url, 3600).catch(() => null);
        return a;
      }));
      return jsonResponse(out, 200, request);
    }

    // ── PATCH /api/orders/:id (admin) ─────────────────────────────────────────
    if (url.pathname.startsWith('/api/orders/') && request.method === 'PATCH') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      const id = url.pathname.split('/api/orders/')[1];
      if (!/^\d+$/.test(id)) return jsonResponse({ error: 'Bad id' }, 400, request);
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      // The shared admin sends Takoshi's vocabulary — translate to this table's.
      const status = STATUS_IN[body.status] || body.status;
      const allowed = ['pending', 'confirmed', 'ready', 'picked_up', 'cancelled'];
      if (!allowed.includes(status)) return jsonResponse({ error: 'Invalid status' }, 400, request);
      const res = await fetch(`${SB}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return jsonResponse({ error: 'Failed to update' }, 500, request);
      // return=representation so a policy-blocked write can't masquerade as success
      const updated = await res.json().catch(() => []);
      if (!Array.isArray(updated) || !updated.length) {
        return jsonResponse({ error: 'Order not found or not updatable' }, 404, request);
      }
      return jsonResponse({ ok: true, status }, 200, request);
    }

    // ── GET /api/availability (public) ────────────────────────────────────────
    if (url.pathname === '/api/availability' && request.method === 'GET') {
      // If the database is unreachable - a paused free-tier project, most
      // likely - this used to throw on res.json() and Cloudflare answered with
      // an HTML 500. The storefront's .catch read that as "open", so a dead
      // kitchen went on taking orders. Answer honestly instead.
      const res = await fetch(`${SB}/rest/v1/store_schedule?id=eq.1&select=*`, { headers: sbHeaders });
      let rows = null;
      try { rows = await res.json(); } catch { rows = null; }
      if (!res.ok || !Array.isArray(rows)) {
        return jsonResponse({
          available: false,
          reason: 'backend_unavailable',
          message: 'I can\u2019t take online orders right now. Please message me and I\u2019ll sort it out.',
          windows: [],
        }, 503, request);
      }
      const s = rows[0];
      if (!s) return jsonResponse({ available: true, windows: [] }, 200, request);
      const nowTs = new Date();
      const windows = [];
      // until === null means "closed until the operator reopens" — an
      // open-ended window, not the absence of one. Previously the null case
      // fell through here and the closure did nothing at all.
      if (s.unavailable_until ? new Date(s.unavailable_until) > nowTs
                              : !!s.unavailable_from) {
        windows.push({ from: s.unavailable_from || null, until: s.unavailable_until || null });
      }
      try {
        const cRes = await fetch(
          `${SB}/rest/v1/closures?or=(unavailable_until.is.null,unavailable_until.gt.${encodeURIComponent(nowTs.toISOString())})&select=unavailable_from,unavailable_until&order=unavailable_from.asc`,
          { headers: sbHeaders });
        if (cRes.ok) {
          const stamp = v => (v ? new Date(v).getTime() : null);
          (await cRes.json()).forEach(c => {
            const dup = windows.some(w =>
              stamp(w.until) === stamp(c.unavailable_until) &&
              stamp(w.from)  === stamp(c.unavailable_from));
            if (!dup) windows.push({ from: c.unavailable_from, until: c.unavailable_until || null });
          });
        }
      } catch (e) { /* fall back to single live window */ }
      const inWindow  = w => (!w.from || new Date(w.from) <= nowTs)
                          && (!w.until || new Date(w.until) > nowTs);
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
        method: 'PATCH',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          is_available: body.is_available,
          unavailable_from: body.unavailable_from || null,
          unavailable_until: body.unavailable_until || null,
          unavailable_message: body.unavailable_message || null,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) return jsonResponse({ error: 'Failed to save' }, 500, request);
      const saved = await res.json().catch(() => []);
      if (!Array.isArray(saved) || !saved.length) {
        // No row id=1 yet — create it rather than reporting a phantom success.
        const ins = await fetch(`${SB}/rest/v1/store_schedule`, {
          method: 'POST', headers: sbWrite,
          body: JSON.stringify({
            id: 1,
            is_available: body.is_available,
            unavailable_from: body.unavailable_from || null,
            unavailable_until: body.unavailable_until || null,
            unavailable_message: body.unavailable_message || null,
            updated_at: new Date().toISOString(),
          }),
        });
        if (!ins.ok) return jsonResponse({ error: 'Failed to save' }, 500, request);
      }
      try {
        const chUrl = `${SB}/rest/v1/closures`;
        const nowISO = new Date().toISOString();
        const cFrom = body.unavailable_from || null;
        const cUntil = body.unavailable_until || null;
        const closingNow = body.is_available === false;
        const scheduledFuture = body.is_available === true && cFrom && new Date(cFrom) > new Date();
        // cUntil may be null (open-ended). It used to gate this branch, which
        // is why "closed from <time>, no reopen date" wrote no history row and
        // never appeared on the Closures page.
        if (closingNow || scheduledFuture) {
          const effFrom = cFrom || nowISO;
          await fetch(`${chUrl}?unavailable_from=eq.${encodeURIComponent(effFrom)}`, { method: 'DELETE', headers: sbWrite });
          await fetch(chUrl, { method: 'POST', headers: sbWrite,
            body: JSON.stringify({ unavailable_from: effFrom, unavailable_until: cUntil, message: body.unavailable_message || null }) });
        } else if (body.is_available === true) {
          // Reopening ENDS the active closure; it does not erase it. This table
          // is the history log, so a closure that actually happened has to
          // survive as a past row — deleting it here is why the Closures page
          // could never show anything under "Past".
          // The exception is a mis-click: closed and reopened inside a minute
          // never really happened, so that row is dropped instead of logged.
          const active = `${chUrl}?unavailable_from=lte.${encodeURIComponent(nowISO)}&or=(unavailable_until.is.null,unavailable_until.gt.${encodeURIComponent(nowISO)})`;
          const MIN_LOGGED_MS = 60000;
          const openRes = await fetch(`${active}&select=unavailable_from`, { headers: sbHeaders });
          const openRows = openRes.ok ? await openRes.json().catch(() => []) : [];
          const trivial = Array.isArray(openRows) && openRows.length &&
            openRows.every(r => Date.now() - new Date(r.unavailable_from).getTime() < MIN_LOGGED_MS);
          if (trivial) {
            await fetch(active, { method: 'DELETE', headers: sbWrite });
          } else {
            await fetch(active, { method: 'PATCH', headers: sbWrite,
              body: JSON.stringify({ unavailable_until: nowISO }) });
          }
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
      // This endpoint is public by necessity (customers upload their e-Transfer
      // screenshot before they have any credential) and it writes into a PUBLIC
      // bucket with the service-role key. Two things therefore have to be
      // pinned down here, because nothing downstream will do it:
      //
      //  1. The content type must come from the extension we just validated,
      //     never from the client. Storage serves back whatever type it is
      //     given, so trusting `file.type` let anyone upload `x.jpg` marked
      //     `text/html` and get arbitrary HTML hosted on the project domain.
      //  2. There must be a size cap, or the endpoint is free unlimited
      //     file hosting billed to this project.
      const TYPES = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', heic:'image/heic' };
      const MAX_BYTES = 8 * 1024 * 1024;   // a phone screenshot is well under 1 MB
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      if (!TYPES[ext]) return jsonResponse({ error: 'Please upload a JPG, PNG or WEBP image.' }, 400, request);
      if (typeof file.size === 'number' && file.size > MAX_BYTES) {
        return jsonResponse({ error: 'That image is too large. Please send one under 8 MB.' }, 413, request);
      }
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_BYTES) {
        return jsonResponse({ error: 'That image is too large. Please send one under 8 MB.' }, 413, request);
      }
      const uploadRes = await fetch(`${SB}/storage/v1/object/deposits/${filename}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': TYPES[ext], 'x-upsert': 'false' },
        body: arrayBuffer,
      });
      if (!uploadRes.ok) return jsonResponse({ error: 'Upload failed' }, 500, request);
      // The bucket is private: the order keeps a reference, and only Leny's page
      // (or the admin) turns it into a short-lived link.
      return jsonResponse({ url: 'deposit:' + filename }, 200, request);
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

    // ── Order requests: Leny's decision, the customer's page, the deposit ─────
    const getOrder = async (id, field, value) => {
      if (!/^\d+$/.test(String(id || '')) || !/^[0-9a-f]{48}$/.test(String(value || ''))) return null;
      const r = await fetch(`${SB}/rest/v1/orders?id=eq.${id}&${field}=eq.${value}&select=${ORDER_FIELDS}`, { headers: sbHeaders });
      if (!r.ok) throw new Error('db ' + r.status);
      return (await r.json())[0] || null;
    };
    // Moves an order on only if it is still where we expect it, so a double tap
    // or two tabs can't apply a step twice.
    const moveOrder = async (o, from, patch) => {
      const r = await fetch(`${SB}/rest/v1/orders?id=eq.${o.id}&status=in.(${from.join(',')})`, {
        method: 'PATCH', headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify(patch) });
      if (!r.ok) throw new Error('db ' + r.status);
      return (await r.json())[0] || null;
    };

    // GET /api/decide?id=&t=[&d=yes|no]: Leny's page for one request
    if (url.pathname === '/api/decide' && request.method === 'GET') {
      const o = await getOrder(url.searchParams.get('id'), 'admin_token', url.searchParams.get('t'));
      if (!o) return lenyPage('Namit Gid', '<h1>This link isn\'t valid</h1><p class="lead">Open the latest email about this order.</p>', 404);
      return lenyDecidePage(o, { focus: url.searchParams.get('d') });
    }
    // Leny's yes / no / paid, from her email's page or from the admin: the order
    // moves on only from the state the step expects, and the customer is told.
    const decide = async (o, d) => {
      const now = new Date().toISOString();
      let moved = null, done = '';
      if (d === 'yes') {
        moved = await moveOrder(o, ['requested'], { status: 'accepted', accepted_at: now, responded_at: now });
        if (moved) { const m = await mailCustomer(env, moved, 'accepted'); done = m === 'sent' ? `Done. ${firstName(o.customer_name)} has been emailed for the deposit.` : `Done. Send ${firstName(o.customer_name)} the deposit link on WhatsApp.`; }
      } else if (d === 'no') {
        moved = await moveOrder(o, ['requested'], { status: 'declined', responded_at: now });
        if (moved) { await mailCustomer(env, moved, 'declined'); done = `Noted. Message ${firstName(o.customer_name)} to find another time.`; }
      } else if (d === 'paid') {
        moved = await moveOrder(o, ['accepted', 'verifying', 'expired'], { status: 'confirmed', confirmed_at: now });
        if (moved) { await mailCustomer(env, moved, 'confirmed'); done = 'Confirmed. Time to shop!'; }
      }
      return { moved, done: moved ? done : 'This was already answered' };
    };

    // POST /api/decide (form): yes / no / paid, from Leny's page
    if (url.pathname === '/api/decide' && request.method === 'POST') {
      let fd; try { fd = await request.formData(); } catch { return lenyPage('Namit Gid', '<h1>Something went wrong</h1>', 400); }
      const o = await getOrder(fd.get('id'), 'admin_token', fd.get('t'));
      if (!o) return lenyPage('Namit Gid', '<h1>This link isn\'t valid</h1>', 404);
      const { moved, done } = await decide(o, fd.get('d'));
      return lenyDecidePage(moved || o, { done });
    }

    // POST /api/orders/:id/decide {d} (admin): the same, from the admin page
    {
      const m = url.pathname.match(/^\/api\/orders\/(\d+)\/decide$/);
      if (m && request.method === 'POST') {
        if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
        let b; try { b = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
        if (!['yes', 'no', 'paid'].includes(b.d)) return jsonResponse({ error: 'Bad decision' }, 400, request);
        const r = await fetch(`${SB}/rest/v1/orders?id=eq.${m[1]}&select=${ORDER_FIELDS}`, { headers: sbHeaders });
        const o = r.ok ? (await r.json())[0] : null;
        if (!o) return jsonResponse({ error: 'not_found' }, 404, request);
        const { moved, done } = await decide(o, b.d);
        return jsonResponse({ ok: !!moved, status: (moved || o).status, message: done }, moved ? 200 : 409, request);
      }
    }

    // GET /api/deposit-shot?id=&t=: Leny opens a deposit screenshot (a link that expires in 10 minutes)
    if (url.pathname === '/api/deposit-shot' && request.method === 'GET') {
      const o = await getOrder(url.searchParams.get('id'), 'admin_token', url.searchParams.get('t'));
      const link = o && await depositShotLink(env, o.deposit_screenshot_url);
      if (!link) return lenyPage('Namit Gid', '<h1>No screenshot</h1><p class="lead">This request has no deposit screenshot, or the link isn\'t valid.</p>', 404);
      return new Response(null, { status: 302, headers: { 'Location': link, 'Cache-Control': 'no-store' } });
    }

    // GET /api/my-order?id=&t=: the customer's own order, for their page
    if (url.pathname === '/api/my-order' && request.method === 'GET') {
      const o = await getOrder(url.searchParams.get('id'), 'token', url.searchParams.get('t'));
      if (!o) return jsonResponse({ error: 'not_found' }, 404, request);
      return jsonResponse({ id: o.id, status: o.status, dish: o.dish, total: Number(o.total), deposit: Number(o.deposit_amount || 0),
        balance: Number(o.balance_due || 0), pickupDate: o.pickup_date, pickupTime: o.pickup_time, name: firstName(o.customer_name),
        depositDeadline: o.status === 'accepted' ? depositDeadline(o) : null, depositEmail: 'orders@takoshi.ca',
        reviewed: await fetch(`${SB}/rest/v1/reviews?order_id=eq.${o.id}&select=id`, { headers: sbHeaders }).then(r => r.json()).then(a => a.length > 0).catch(() => false) }, 200, request);
    }

    // POST /api/deposit-sent {id, t, screenshot}: the customer says the deposit is sent
    if (url.pathname === '/api/deposit-sent' && request.method === 'POST') {
      let b; try { b = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      const o = await getOrder(b.id, 'token', b.t);
      if (!o) return jsonResponse({ error: 'not_found' }, 404, request);
      if (o.status === 'verifying' || o.status === 'confirmed') return jsonResponse({ ok: true, status: o.status }, 200, request);
      if (o.status !== 'accepted') return jsonResponse({ error: o.status === 'expired' ? 'expired' : 'not_accepted', status: o.status }, 409, request);
      if (Date.parse(depositDeadline(o)) < Date.now()) {
        await moveOrder(o, ['accepted'], { status: 'expired' });
        return jsonResponse({ error: 'expired', status: 'expired' }, 409, request);
      }
      // a screenshot this site uploaded is needed, so Leny can match the e-Transfer
      const shot = typeof b.screenshot === 'string' && DEPOSIT_REF.test(b.screenshot) ? b.screenshot : null;
      if (!shot) return jsonResponse({ error: 'screenshot_required' }, 400, request);
      const moved = await moveOrder(o, ['accepted'], { status: 'verifying', deposit_sent_at: new Date().toISOString(), deposit_screenshot_url: shot });
      if (moved) {
        try {
          await sendMail(env.RESEND_API_KEY, env.NOTIFY_EMAIL || LENY_EMAIL_DEFAULT, `Deposit sent: ${moved.customer_name}, ${shortPickup(moved)}`,
            emailHtml({ toLeny: true, heading: `${firstName(moved.customer_name)} sent the ${money2(moved.deposit_amount)} deposit`,
              paras: ['Check your bank, then confirm.'], rows: lenyRows(moved), button: { href: decideLink(moved), text: 'Confirm order' } }));
        } catch (e) { console.error('[namitgid] deposit email to Leny failed', moved.id, e); }
      }
      return jsonResponse({ ok: true, status: 'verifying' }, 200, request);
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
      // Refuse orders while the store is closed. The storefront also gates this,
      // but a stale tab or a direct POST must not slip through.
      try {
        const availRes = await fetch(`${SB}/rest/v1/store_schedule?id=eq.1&select=*`, { headers: sbHeaders });
        const s = (await availRes.json().catch(() => []))[0];
        if (s) {
          const now = new Date();
          // A window with no end date runs until the operator reopens, so the
          // end check has to pass when unavailable_until is null.
          const started    = !s.unavailable_from || new Date(s.unavailable_from) <= now;
          const notEnded   = !s.unavailable_until || new Date(s.unavailable_until) > now;
          const liveWindow = started && notEnded && !!(s.unavailable_from || s.unavailable_until);
          const closedIndefinitely = s.is_available === false && !s.unavailable_until;
          if (liveWindow || closedIndefinitely) {
            return jsonResponse({ error: 'closed', message: s.unavailable_message || "We're currently closed for orders." }, 409, request);
          }
        }
      } catch (e) { /* never block a real order on a schedule lookup failure */ }

      const res = await fetch(`${SB}/functions/v1/submit-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.SUPABASE_KEY}`, 'apikey': env.SUPABASE_KEY },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return jsonResponse(data, res.status, request);

      // The confirmation email must never break an order — but it must not fail
      // invisibly either. That combination is what hid a dead send for months:
      // a bare try/catch around a fetch whose status nobody checked. Report the
      // outcome in the response and the log, and let the caller decide.
      let confirmation = 'not_requested';
      if (body.order?.email) {
        if (!env.RESEND_API_KEY) {
          confirmation = 'skipped_no_key';
          console.error('[namitgid] RESEND_API_KEY is not set on this deployment — order',
            data?.orderId, 'saved, no confirmation email sent to', body.order.email);
        } else {
          try {
            if (data.status === 'requested') { await sendRequestReceivedEmail(env.RESEND_API_KEY, body.order, data); confirmation = 'sent'; }
          } catch (e) {
            confirmation = 'failed';
            console.error('[namitgid] confirmation email failed for order', data?.orderId, e);
          }
        }
      }
      return jsonResponse({ ...data, confirmation }, 200, request);
    }

    // ── POST /api/send-review-request (admin) ─────────────────────────────────
    // The shared admin shows "✉ Request Review" on any order that carries an
    // email. Namit Gid orders can now carry one, so this route has to exist —
    // otherwise that button 404s.
    if (url.pathname === '/api/send-review-request' && request.method === 'POST') {
      if (!(await requireAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      if (!body.email || !body.name) return jsonResponse({ error: 'email and name required' }, 400, request);
      if (!env.RESEND_API_KEY) return jsonResponse({ error: 'Resend not configured' }, 500, request);
      try {
        // The admin sends Takoshi's field names; `size` is where the dish lands.
        await sendReviewRequestEmail(env.RESEND_API_KEY, { name: body.name, email: body.email, dish: body.dish || body.size || '' });
        return jsonResponse({ ok: true }, 200, request);
      } catch (e) {
        return jsonResponse({ error: 'Failed to send email' }, 500, request);
      }
    }

    // ── GET /api/reviews (public): approved reviews, newest first ──────────────
    if (url.pathname === '/api/reviews' && request.method === 'GET') {
      const res = await fetch(`${SB}/rest/v1/reviews?visible=eq.true&select=name,review_text,dish,order_id,created_at&order=created_at.desc&limit=200`, { headers: sbHeaders });
      const rows = await res.json().catch(() => []);
      if (!res.ok) return jsonResponse([], 500, request);
      return jsonResponse(rows.map(r => ({ name: r.name, text: r.review_text, dish: r.dish, verified: !!r.order_id })), 200, request);
    }

    // ── POST /api/submit-review (public): saved hidden; Leny approves by email ──
    // From an order page it carries the order's id and secret, and counts once
    // per order. From the site it needs the bot check, and one address can
    // send three a day.
    if (url.pathname === '/api/submit-review' && request.method === 'POST') {
      let b;
      try { b = await request.json(); } catch { return jsonResponse({ error: 'Bad request' }, 400, request); }
      const text = String(b.text || '').trim().slice(0, 600);
      const dish = /^[a-z0-9-]{1,40}$/.test(String(b.dish || '')) ? b.dish : null;
      const dishName = String(b.dishName || '').trim().slice(0, 60);
      let name = String(b.name || '').trim().split(/\s+/)[0].slice(0, 40);
      let o = null;
      if (b.order) {
        o = await getOrder(b.order, 'token', b.t);
        if (!o) return jsonResponse({ error: 'not_found' }, 404, request);
        if (!name) name = firstName(o.customer_name);
      } else if (env.TURNSTILE_SECRET_KEY) {
        const fd = new FormData();
        fd.append('secret', env.TURNSTILE_SECRET_KEY);
        fd.append('response', b.token || '');
        const cf = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
        if (!(await cf.json().catch(() => ({}))).success) return jsonResponse({ error: 'bot_check' }, 403, request);
      }
      if (!name || text.length < 3) return jsonResponse({ error: 'name and text required' }, 400, request);
      const ip = request.headers.get('CF-Connecting-IP') || '';
      const ipHash = ip ? await sha256hex('namitgid-review:' + ip) : null;
      if (!o && ipHash) {
        const since = new Date(Date.now() - 864e5).toISOString();
        const recent = await fetch(`${SB}/rest/v1/reviews?ip_hash=eq.${ipHash}&created_at=gt.${since}&select=id`, { headers: sbHeaders }).then(r => r.json()).catch(() => []);
        if (recent.length >= 3) return jsonResponse({ error: 'too_many' }, 429, request);
      }
      const res = await fetch(`${SB}/rest/v1/reviews`, {
        method: 'POST', headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ name, review_text: text, dish, order_id: o ? o.id : null, admin_token: randomHex(24), ip_hash: ipHash, visible: false }),
      });
      if (res.status === 409) return jsonResponse({ error: 'already' }, 409, request);
      if (!res.ok) return jsonResponse({ error: 'save_failed' }, 500, request);
      const r = (await res.json())[0];
      try {
        await sendMail(env.RESEND_API_KEY, env.NOTIFY_EMAIL || LENY_EMAIL_DEFAULT, `New review from ${name}${dishName ? ', ' + dishName : ''}`,
          emailHtml({ toLeny: true, heading: `${name} wrote a review`, paras: ['“' + text + '”'],
            rows: [['Dish', escHtml(dishName || 'Not picked')], ['From', o ? `Order #${o.id}, ${escHtml(o.customer_name)}` : 'The website']],
            button: { href: reviewLink(r), text: 'Show or hide it' } }));
      } catch (e) { console.error('[namitgid] review email to Leny failed', r.id, e); }
      return jsonResponse({ ok: true }, 201, request);
    }

    // GET /api/review?id=&t=: Leny's page for one review. The choice is a
    // button on the page, because mail scanners open links on their own.
    if (url.pathname === '/api/review' && (request.method === 'GET' || request.method === 'POST')) {
      let id, t, d;
      if (request.method === 'POST') {
        let fd; try { fd = await request.formData(); } catch { return lenyPage('Namit Gid', '<h1>Something went wrong</h1>', 400); }
        id = fd.get('id'); t = fd.get('t'); d = fd.get('d');
      } else { id = url.searchParams.get('id'); t = url.searchParams.get('t'); }
      if (!/^\d+$/.test(String(id || '')) || !/^[0-9a-f]{48}$/.test(String(t || ''))) return lenyPage('Namit Gid', '<h1>This link isn\'t valid</h1>', 404);
      const q = `${SB}/rest/v1/reviews?id=eq.${id}&admin_token=eq.${t}`;
      let r = (await fetch(q + '&select=*', { headers: sbHeaders }).then(x => x.json()).catch(() => []))[0];
      if (!r) return lenyPage('Namit Gid', '<h1>This link isn\'t valid</h1><p class="lead">The review may have been deleted.</p>', 404);
      let done;
      if (d === 'show' || d === 'hide') {
        const up = await fetch(q, { method: 'PATCH', headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify({ visible: d === 'show' }) });
        if (up.ok) { r = (await up.json())[0] || r; done = d === 'show' ? 'It’s on the site now' : 'It’s hidden'; }
      }
      return lenyReviewPage(r, done);
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
      if (!/^\d+$/.test(id)) return jsonResponse({ error: 'Bad id' }, 400, request);
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
      if (!/^\d+$/.test(id)) return jsonResponse({ error: 'Bad id' }, 400, request);
      const res = await fetch(`${SB}/rest/v1/reviews?id=eq.${id}`, { method: 'DELETE', headers: sbHeaders });
      return jsonResponse({ ok: res.ok }, res.ok ? 200 : 500, request);
    }

    // ── GET /api/referral-stats (admin) — best-effort so admin page 2 loads ───
    // Namit Gid has no referral programme yet; this reports honest zeros rather
    // than leaving the shared admin's referral page spinning.
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
        const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        monthly.push({ month: ym, count: monthCounts[ym] || 0 });
      }
      return jsonResponse({ total: (rows || []).length, pending, redeemed, top, monthly }, 200, request);
    }

    // ── GET /api/slot-load?date=YYYY-MM-DD (public) ──────────────────────────
    // How many live orders sit on each pickup time that day. The storefront uses
    // this to grey out slots within 90 minutes of an existing pickup.
    if (url.pathname === '/api/slot-load' && request.method === 'GET') {
      const date = url.searchParams.get('date') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResponse({ load: {} }, 200, request);
      const res = await fetch(
        `${SB}/rest/v1/orders?pickup_date=eq.${date}&status=in.(${ACTIVE_STATUSES.join(',')})&select=pickup_time,status`,
        { headers: sbHeaders });
      // ok:false, so an empty result reads as "could not check" rather than
      // "every slot is free" - which is how it looked with the DB paused.
      if (!res.ok) return jsonResponse({ load: {}, ok: false }, 200, request);
      const rows = await res.json().catch(() => []);
      const load = {};
      (rows || []).forEach(o => {
        if (o.status === 'cancelled') return;
        if (!o.pickup_time || timeToMin(o.pickup_time) === null) return;
        load[o.pickup_time] = (load[o.pickup_time] || 0) + 1;
      });
      return jsonResponse({ load, blockWindowMin: BLOCK_WINDOW_MIN }, 200, request);
    }

    return jsonResponse({ error: 'Not found' }, 404, request);
  }
}
