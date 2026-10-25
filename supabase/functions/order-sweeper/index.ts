import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Runs every 5 minutes (pg_cron → pg_net). Three jobs:
//  1. A request Leny hasn't answered gets a reminder an hour after it came in,
//     then hourly, three at most.
//  2. A request she said yes to, with no deposit sent within two hours, expires:
//     the pickup time frees up and both sides hear about it.
//  3. The day after pickup, from 11 AM in Toronto, a customer who gave an email
//     gets one "was it namit gid?" note linking to their order page's review form.
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

// "Sat Nov 7, 12:30 PM", for Leny
const shortPickup = (o: { pickup_date?: string; pickup_time?: string }) => o.pickup_date
  ? new Date(o.pickup_date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '') + (o.pickup_time ? ', ' + o.pickup_time : '')
  : 'no pickup time'
const SANS = "'Atkinson Hyperlegible Next',Arial,Helvetica,sans-serif", SERIF = "'Young Serif',Georgia,serif"

// `paras` are plain text (escaped here); `rows` values are HTML the caller escaped
function frame(o: { heading: string; paras?: string[]; rows?: [string, string][]; button?: { href: string; text: string }; toLeny?: boolean }) {
  const { heading, paras = [], rows = [], button, toLeny = false } = o
  const row = ([l, v]: [string, string]) => `<tr><td valign="top" style="padding:5px 12px 5px 0;width:30%;font:13px/1.5 ${SANS};color:#6B5747;">${esc(l)}</td><td style="padding:5px 0;font:14px/1.5 ${SANS};color:#2B2119;">${v}</td></tr>`
  const top = toLeny
    ? `<p style="margin:0 0 14px;font:16px/1 ${SERIF};color:#A3462A;">Namit gid</p>`
    : `<p style="margin:0 0 18px;text-align:center;"><img src="${SITE}/assets/img/email/leny.png" width="120" height="70" alt="Leny" style="display:inline-block;border:0;width:120px;height:auto;"><br><span style="font:22px/1.4 ${SERIF};color:#A3462A;">Namit gid</span></p>`
  const sign = toLeny ? '' : `<p style="margin:26px 0 0;font:600 26px/1 Caveat,'Segoe Print','Bradley Hand',cursive;color:#A3462A;">Leny</p>
    <p style="margin:6px 0 0;font:13px/1.6 ${SANS};color:#6B5747;">Namit Gid, near Fairview Mall<br><a href="${SITE}" style="color:#1E5A63;">namitgid.takoshi.ca</a></p>`
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=Young+Serif&family=Caveat:wght@600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#F3EADB;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EADB;padding:28px 14px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#FFFBF3;border:1px solid #E6D6B8;border-radius:14px 11px 13px 12px;">
  <tr><td style="padding:${toLeny ? '22px 24px' : '26px 30px 28px'};">
    ${top}
    <h1 style="margin:0 0 14px;font:400 ${toLeny ? 21 : 25}px/1.25 ${SERIF};color:#2B2119;">${esc(heading)}</h1>
    ${paras.map(p => `<p style="margin:0 0 12px;font:16px/1.6 ${SANS};color:#4A3B2F;">${esc(p)}</p>`).join('')}
    ${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EADB;border-radius:10px 8px 9px 8px;margin:8px 0 6px;"><tr><td style="padding:12px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(row).join('')}</table></td></tr></table>` : ''}
    ${button ? `<p style="margin:20px 0 0;text-align:center;"><a href="${esc(button.href)}" style="display:inline-block;padding:13px 26px;border-radius:12px 9px 11px 10px;background:#DDB582 url(${SITE}/assets/img/email/wood.jpg) 50% 50%/cover;border:1.5px solid #8A5A30;border-bottom-width:3px;color:#3B2212;font:700 16px/1.2 ${SANS};text-decoration:none;">${esc(button.text)}</a></p>` : ''}
    ${sign}
  </td></tr></table>
</td></tr></table>
</body></html>`
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
  let reminded = 0, expired = 0, asked = 0

  // 1. reminders to Leny
  const { data: waiting } = await sb.from('orders')
    .select('id,dish,total,customer_name,contact,pickup_date,pickup_time,created_at,reminders_sent,last_reminder_at,admin_token')
    .eq('status', 'requested').lt('reminders_sent', MAX_REMINDERS)
  for (const o of waiting || []) {
    if (now - Date.parse(o.last_reminder_at || o.created_at) < REMIND_EVERY_MS) continue
    // claim this reminder first, so two runs can't both send it
    const { data: claimed } = await sb.from('orders')
      .update({ reminders_sent: o.reminders_sent + 1, last_reminder_at: new Date(now).toISOString() })
      .eq('id', o.id).eq('status', 'requested').eq('reminders_sent', o.reminders_sent).select('id')
    if (!claimed?.length) continue
    const hours = Math.max(1, Math.round((now - Date.parse(o.created_at)) / 3600_000))
    await mail(LENY_EMAIL, `Still waiting: ${o.customer_name}, ${shortPickup(o)}`, frame({ toLeny: true,
      heading: `${first(o.customer_name)} is waiting for your answer`,
      paras: [`Requested ${hours} hour${hours > 1 ? 's' : ''} ago. Reminder ${o.reminders_sent + 1} of ${MAX_REMINDERS}.`],
      rows: [['Pickup', esc(shortPickup(o))], ['Order', esc(o.dish).split(' · ').join('<br>')], ['Total', '$' + Number(o.total).toFixed(2)],
        ['Customer', [o.customer_name, o.contact].filter(Boolean).map(esc).join('<br>')]],
      button: { href: `${SITE}/api/decide?id=${o.id}&t=${o.admin_token}`, text: 'Answer now' } }))
    reminded++
  }

  // 2. a yes with no deposit in time expires
  const { data: lapsed } = await sb.from('orders')
    .update({ status: 'expired' })
    .eq('status', 'accepted').lt('accepted_at', new Date(now - DEPOSIT_HOURS * 3600_000).toISOString())
    .select('id,customer_name,email,pickup_date,pickup_time,deposit_amount,admin_token')
  for (const o of lapsed || []) {
    await mail(o.email, 'Your request has expired', frame({ heading: `Hi ${first(o.customer_name)},`,
      paras: [`I didn’t get the deposit in time, so I had to free up ${pickupText(o)} for other orders. Nothing was charged.`,
        'I’d love to cook for you another time.'],
      button: { href: SITE, text: 'Order again' } }))
    await mail(LENY_EMAIL, `Expired: ${o.customer_name}, ${shortPickup(o)}`, frame({ toLeny: true,
      heading: `${first(o.customer_name)} didn’t send the deposit`,
      paras: [`No deposit within ${DEPOSIT_HOURS} hours of your yes. The time slot is open again.`, 'If the deposit comes in late, you can still confirm.'],
      button: { href: `${SITE}/api/decide?id=${o.id}&t=${o.admin_token}`, text: 'Open order' } }))
    expired++
  }

  // 3. the day after pickup: was it namit gid?
  const tz = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(new Date(now)).map(p => [p.type, p.value]))
  const today = `${tz.year}-${tz.month}-${tz.day}`, hour = +tz.hour % 24
  if (hour >= 11 && hour < 20) {
    // only pickups from the last three days, so an old order never gets a late ask
    const since = new Date(Date.parse(today + 'T12:00:00Z') - 3 * 864e5).toISOString().slice(0, 10)
    const { data: done } = await sb.from('orders').select('id,dish,customer_name,email,token')
      .in('status', ['confirmed', 'ready', 'completed', 'picked_up']).is('review_asked_at', null).not('email', 'is', null)
      .lt('pickup_date', today).gte('pickup_date', since)
    for (const o of done || []) {
      const { data: claimed } = await sb.from('orders').update({ review_asked_at: new Date(now).toISOString() })
        .eq('id', o.id).is('review_asked_at', null).select('id')
      if (!claimed?.length) continue
      // "Palabok (Medium) ×1 · Tiramisu ×1" → "Palabok and Tiramisu"
      const names = [...new Set(String(o.dish).split(' · ').map(l => l.replace(/ \(.*$| ×.*$/, '')))]
      const what = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0]
      await mail(o.email, 'Was it namit gid?', frame({ heading: `Was it namit gid, ${first(o.customer_name)}?`,
        paras: [`Salamat for ordering the ${what}. If you enjoyed it, would you write me a line or two? It helps other people find my kitchen.`],
        button: { href: `${SITE}/?order=${o.id}&t=${o.token}`, text: 'Write a review' } }))
      asked++
    }
  }

  return new Response(JSON.stringify({ reminded, expired, asked }), { headers: { 'Content-Type': 'application/json' } })
})
