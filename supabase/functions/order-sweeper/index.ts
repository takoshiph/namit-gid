import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Runs every 5 minutes (pg_cron → pg_net). Two jobs:
//  1. A request Leny hasn't answered gets a reminder an hour after it came in,
//     then hourly, three at most.
//  2. A request she said yes to, with no deposit sent within two hours, expires:
//     the pickup time frees up and both sides hear about it.
// Every step is gated on the order's state, so running it early or twice does
// nothing extra; that is why it needs no secret to call.
const RESEND_API_KEY = Deno.env.get('NOTIFY_RESEND_API_KEY') ?? Deno.env.get('RESEND_API_KEY') ?? ''
const LENY_EMAIL = Deno.env.get('NOTIFY_EMAIL') ?? 'takoshi.phstore@gmail.com'
const SITE = Deno.env.get('SITE_URL') ?? 'https://namitgid.takoshi.ca'
const REMIND_EVERY_MS = 60 * 60_000, MAX_REMINDERS = 3, DEPOSIT_HOURS = 2

const esc = (s: unknown) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const first = (n: string) => String(n || '').trim().split(/\s+/)[0] || 'there'
const pickupText = (o: { pickup_date?: string; pickup_time?: string }) => o.pickup_date
  ? new Date(o.pickup_date + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) + (o.pickup_time ? ' at ' + o.pickup_time : '')
  : 'the pickup'

function frame(kicker: string, heading: string, paras: string[], button?: { href: string; text: string }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f6efe6;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:36px 18px;"><tr><td align="center">
<table width="100%" style="max-width:500px;background:#fffaf3;border-radius:16px;border:1px solid #ece0d1;">
<tr><td style="padding:28px 32px;">
  <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#1f5c3d;margin-bottom:16px;">Namit Gid</div>
  <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#c2604a;">${esc(kicker)}</p>
  <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:22px;color:#2a241f;">${esc(heading)}</h1>
  ${paras.map(p => `<p style="margin:0 0 14px;font-size:15px;color:#6f645a;line-height:1.6;">${esc(p)}</p>`).join('')}
  ${button ? `<p style="margin:10px 0 0;text-align:center;"><a href="${esc(button.href)}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#1E5A63;color:#fff;font-size:16px;font-weight:700;text-decoration:none;">${esc(button.text)}</a></p>` : ''}
</td></tr></table></td></tr></table></body></html>`
}
async function mail(to: string | null, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: 'Namit Gid <orders@takoshi.ca>', to: [to], subject, html }),
  })
  if (!r.ok) console.error('[namitgid] sweeper email failed', r.status, await r.text().catch(() => ''))
}

serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const now = Date.now()
  let reminded = 0, expired = 0

  // 1. reminders to Leny
  const { data: waiting } = await sb.from('orders')
    .select('id,dish,total,customer_name,pickup_date,pickup_time,created_at,reminders_sent,last_reminder_at,admin_token')
    .eq('status', 'requested').lt('reminders_sent', MAX_REMINDERS)
  for (const o of waiting || []) {
    if (now - Date.parse(o.last_reminder_at || o.created_at) < REMIND_EVERY_MS) continue
    // claim this reminder first, so two runs can't both send it
    const { data: claimed } = await sb.from('orders')
      .update({ reminders_sent: o.reminders_sent + 1, last_reminder_at: new Date(now).toISOString() })
      .eq('id', o.id).eq('status', 'requested').eq('reminders_sent', o.reminders_sent).select('id')
    if (!claimed?.length) continue
    const hours = Math.max(1, Math.round((now - Date.parse(o.created_at)) / 3600_000))
    await mail(LENY_EMAIL, `⏰ Still waiting: ${o.customer_name}, ${pickupText(o)}`, frame('Reminder',
      `${first(o.customer_name)} is waiting for your answer`,
      [`They asked ${hours} hour${hours > 1 ? 's' : ''} ago for ${pickupText(o)}: ${o.dish} ($${Number(o.total).toFixed(2)}).`],
      { href: `${SITE}/api/decide?id=${o.id}&t=${o.admin_token}`, text: 'Answer now' }))
    reminded++
  }

  // 2. a yes with no deposit in time expires
  const { data: lapsed } = await sb.from('orders')
    .update({ status: 'expired' })
    .eq('status', 'accepted').lt('accepted_at', new Date(now - DEPOSIT_HOURS * 3600_000).toISOString())
    .select('id,customer_name,email,pickup_date,pickup_time,deposit_amount,admin_token')
  for (const o of lapsed || []) {
    await mail(o.email, 'Your Namit Gid request expired', frame('Request expired', `Hi ${first(o.customer_name)},`,
      [`We didn't get the deposit in time, so ${pickupText(o)} has been freed up. Nothing was charged.`,
        `Still hungry? Send a new request any time at ${SITE.replace('https://', '')}.`],
      { href: SITE, text: 'Order again' }))
    await mail(LENY_EMAIL, `Expired: ${o.customer_name}, ${pickupText(o)}`, frame('Expired',
      `${first(o.customer_name)} didn't send the deposit`,
      [`No deposit within ${DEPOSIT_HOURS} hours of your yes, so ${pickupText(o)} is free again. If it comes in late, you can still confirm the order.`],
      { href: `${SITE}/api/decide?id=${o.id}&t=${o.admin_token}`, text: 'See the request' }))
    expired++
  }

  return new Response(JSON.stringify({ reminded, expired }), { headers: { 'Content-Type': 'application/json' } })
})
