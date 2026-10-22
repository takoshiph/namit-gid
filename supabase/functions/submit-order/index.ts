import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Secrets live in Supabase → Edge Functions → Secrets. Never inline a key here:
// this file is in the repo, and GitHub's push protection will (correctly) block it.
// If the key is missing the order still saves — only the notification email is skipped.
const RESEND_API_KEY = Deno.env.get('NOTIFY_RESEND_API_KEY') ?? Deno.env.get('RESEND_API_KEY') ?? ''
const NOTIFY_EMAIL   = Deno.env.get('NOTIFY_EMAIL') ?? 'takoshi.phstore@gmail.com'

const DEPOSIT = 10                       // an order from an older page keeps the fixed deposit
// A tray is a request: Leny says yes or no, then the customer pays half.
const DEPOSIT_SHARE = 0.5
// Leny shops after she says yes, so a pickup needs a day's notice.
const LEAD_HOURS = 24, LEAD_MS = LEAD_HOURS * 3600_000
const SITE = Deno.env.get('SITE_URL') ?? 'https://namitgid.takoshi.ca'
// statuses that hold a pickup time
const ACTIVE = ['requested', 'accepted', 'verifying', 'confirmed', 'pending', 'ready']
// a link secret: 24 random bytes, hex
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('')
const waLink = (phone: string, text: string) => {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length < 10) return ''
  return 'https://wa.me/' + (d.length === 10 ? '1' + d : d) + '?text=' + encodeURIComponent(text)
}

// The dish string is built by the storefront as `Name` or `Name (Variant)`.
// This table is the price authority — the browser's number is never trusted.
const MENU: Record<string, number> = {
  'Shawarma Rice (Small)': 50,
  'Shawarma Rice (Medium)': 65,
  'Lumpiang Shanghai (30 pcs)': 35,
  'Lumpiang Shanghai (50 pcs)': 45,
  'Baked Sushi (Small)': 45,
  'Baked Sushi (Large)': 60,
  'Palabok (Small)': 50,
  'Palabok (Medium)': 65,
  'Tiramisu': 25,
  'Cheesecake (Regular)': 15,
  'Cheesecake (Matcha)': 15,
  'Cheesecake (Pistachio)': 15,
  'Banana Bread Loaf': 10,
  'Chocolate Dreamcake': 20,
}

const MIN_QTY: Record<string, number> = {
  'Cheesecake (Regular)': 4,
  'Cheesecake (Matcha)': 4,
  'Cheesecake (Pistachio)': 4,
  'Chocolate Dreamcake': 4,
}

// Dishes sold by the batch: a batch is a fixed count at a fixed price, and the
// customer allocates flavours inside however many batches they order. The flavour
// counts must add up to batches x size exactly — anything else is a mistake, not a
// discount, so it's rejected rather than quietly repriced.
const BATCH: Record<string, { size: number; price: number; max: number }> = {
  'Cheesecake': { size: 4, price: 60, max: 5 },
}

const round2 = (n: number) => Math.round(n * 100) / 100

function esc(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ── Toronto-relative time helpers (ported from the Takoshi submit-order function) ──
// Everything is projected onto one "naive-as-UTC" scale so a pickup written as
// "2026-08-22" + "4:30 PM" can be compared against closure windows stored as true
// UTC instants without a timezone shift.

function naiveMs(s: string): number | null {
  if (!s) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(String(s))
  const d = new Date(hasZone ? s : String(s) + 'Z')
  if (isNaN(d.getTime())) return null
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(d)) p[part.type] = part.value
  const hr = p.hour === '24' ? 0 : +p.hour
  return Date.UTC(+p.year, +p.month - 1, +p.day, hr, +p.minute)
}

function timeToMin(t: string): number | null {
  const m = String(t || '').match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const ap = m[3].toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return h * 60 + min
}

function pickupMs(dateStr: string, timeStr: string): number | null {
  const dm = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const mins = timeToMin(timeStr)
  if (!dm || mins === null) return null
  return Date.UTC(+dm[1], +dm[2] - 1, +dm[3], Math.floor(mins / 60), mins % 60)
}

function torontoNowMs(): number {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(new Date())) p[part.type] = part.value
  const hr = p.hour === '24' ? 0 : +p.hour
  return Date.UTC(+p.year, +p.month - 1, +p.day, hr, +p.minute)
}

// ── Pricing ─────────────────────────────────────────────────────────────────
// A tray is a list of lines. A plain line is one dish (with its size, if it
// has sizes) and a quantity; a batch line (the cheesecake box) is a number of
// batches and the flavour count in each. Every line is priced from MENU /
// BATCH here; nothing the browser says about money is used. The stored label
// is rebuilt here too.
type Priced = { label: string; qty: number; total: number } | { error: string; detail?: Record<string, unknown> }
const MAX_LINES = 20, MAX_QTY = 50

function priceLine(line: Record<string, unknown>): Priced {
  const dish = String(line?.dish ?? '').trim()
  const batch = BATCH[dish]
  if (batch && Array.isArray(line?.items)) {
    const batches = parseInt(String(line?.batches), 10) || 0
    let count = 0
    const parts: string[] = []
    for (const it of line.items as Record<string, unknown>[]) {
      const label = String(it?.label ?? '')
      const n = parseInt(String(it?.qty), 10) || 0
      if (MENU[`${dish} (${label})`] === undefined || n < 0) return { error: 'invalid_order' }
      if (n === 0) continue
      count += n
      parts.push(`${n} ${label}`)
    }
    const expected = batches * batch.size
    if (batches < 1 || batches > batch.max || count !== expected) {
      return { error: 'invalid_order', detail: { batchSize: batch.size, maxBatches: batch.max, expected } }
    }
    return { label: `${dish} \u00d7${batches} ${batches === 1 ? 'batch' : 'batches'} (${parts.join(', ')})`, qty: batches, total: round2(batch.price * batches) }
  }
  const size = String(line?.size ?? '').trim()
  // a sized dish is keyed "Name (Size)"; a dish with one size is keyed by name
  const key = size && MENU[`${dish} (${size})`] !== undefined ? `${dish} (${size})` : dish
  const unit = MENU[key]
  const min = MIN_QTY[key] || 1
  const qty = parseInt(String(line?.qty), 10) || 0
  if (!unit || qty < min || qty > MAX_QTY) return { error: 'invalid_order', detail: { dish: key, min } }
  return { label: `${key} \u00d7${qty}`, qty, total: round2(unit * qty) }
}

function priceTray(lines: unknown): Priced {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) return { error: 'invalid_order' }
  const labels: string[] = []
  let total = 0
  for (const l of lines) {
    const p = priceLine(l as Record<string, unknown>)
    if ('error' in p) return p
    labels.push(p.label)
    total += p.total
  }
  return { label: labels.join(' \u00b7 '), qty: lines.length, total: round2(total) }
}

// One order reserves a 1.5-hour prep window, so no two pickups sit closer than this.
const BLOCK_WINDOW_MIN = 90

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { order } = await req.json()

    const dish       = String(order?.dish || '').trim()
    const name       = String(order?.name || '').trim().slice(0, 120)
    const contact    = String(order?.contact || '').trim().slice(0, 120)
    const email      = String(order?.email || '').trim().slice(0, 160) || null
    const notes      = String(order?.notes || '').trim().slice(0, 500) || null
    const depositUrl = String(order?.deposit_screenshot_url || '').trim().slice(0, 500) || null

    // Pickup is optional on the wire, not because it's optional to the business, but so a
    // cached copy of the previous storefront can still place an order during a deploy.
    // Anything the storefront does send is validated strictly.
    const rawDate = String(order?.pickupDate || '').trim()
    const rawTime = String(order?.pickup || '').trim()
    const pickupDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null
    const pickupTime = timeToMin(rawTime) !== null ? rawTime : null

    // ── Pricing ───────────────────────────────────────────────────────────────
    // Two shapes. A plain dish carries one MENU key and a quantity. A mixable
    // dish carries a base name plus one line per flavour — each line is priced
    // from MENU independently, and the stored label is rebuilt here rather than
    // trusted from the browser.
    const trayPrice = Array.isArray(order?.lines) ? priceTray(order.lines) : null
    const rawItems = Array.isArray(order?.items) ? order.items : null
    const batch = BATCH[dish]
    let dishLabel = dish
    let unit: number | undefined
    let qty: number
    let total: number

    if (trayPrice) {
      if ('error' in trayPrice || !name || !contact) {
        return new Response(JSON.stringify({ error: 'invalid_order', ...('error' in trayPrice ? trayPrice.detail : {}) }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }
      dishLabel = trayPrice.label
      qty = trayPrice.qty
      total = trayPrice.total
      unit = total                         // one row per order: the admin reads the total
    } else if (rawItems && batch) {
      const batches = parseInt(order?.batches, 10) || 0
      let count = 0
      const parts: string[] = []
      for (const it of rawItems) {
        const label = String(it?.label ?? '')
        const n = parseInt(it?.qty, 10) || 0
        // the flavour has to exist on this dish, and counts can't go negative
        if (MENU[`${dish} (${label})`] === undefined || n < 0) {
          return new Response(JSON.stringify({ error: 'invalid_order' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
          })
        }
        if (n === 0) continue
        count += n
        parts.push(`${n} ${label}`)
      }
      const expected = batches * batch.size
      if (!name || !contact || batches < 1 || batches > batch.max || count !== expected) {
        return new Response(JSON.stringify({
          error: 'invalid_order', batchSize: batch.size, maxBatches: batch.max, expected,
        }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } })
      }
      qty = batches                        // one row per batch: unit x qty = total
      unit = batch.price
      total = round2(batch.price * batches)
      dishLabel = `${dish} \u00d7${batches} ${batches === 1 ? 'batch' : 'batches'} (${parts.join(', ')})`
    } else {
      unit = MENU[dish]
      const minQty = MIN_QTY[dish] || 1
      qty = Math.min(20, Math.max(minQty, parseInt(order?.qty, 10) || minQty))
      if (!unit || !name || !contact || qty < minQty) {
        return new Response(JSON.stringify({ error: 'invalid_order' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }
      total = round2(unit * qty)
    }

    const isRequest = !!trayPrice
    const deposit = isRequest ? Math.ceil(total * DEPOSIT_SHARE) : DEPOSIT
    const balanceDue = round2(Math.max(0, total - deposit))
    if (isRequest) {
      const pMs = pickupDate && pickupTime ? pickupMs(pickupDate, pickupTime) : null
      if (pMs === null || pMs < torontoNowMs() + LEAD_MS) {
        return new Response(JSON.stringify({ error: 'too_soon', leadHours: LEAD_HOURS }), {
          status: 409, headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Closure guard (hard) ──────────────────────────────────────────────────
    // The form already blocks closed slots; this rejects a manipulated or stale
    // request whose pickup lands inside any active closure window.
    if (pickupDate && pickupTime) {
      try {
        // until === null is an open-ended closure ("until we reopen"), so a
        // window is valid with either bound set, and a null end never expires.
        const wins: { from: string | null; until: string | null }[] = []
        const { data: sched } = await supabase
          .from('store_schedule')
          .select('unavailable_from, unavailable_until')
          .eq('id', 1).maybeSingle()
        if (sched?.unavailable_until || sched?.unavailable_from) {
          wins.push({ from: sched.unavailable_from || null, until: sched.unavailable_until || null })
        }
        const { data: cls } = await supabase
          .from('closures')
          .select('unavailable_from, unavailable_until')
        // Deliberately only bounded rows from `closures`. That table is the
        // history log: a stale open-ended row left behind by a failed reopen
        // would silently reject every future order forever. The live
        // open-ended state lives in store_schedule above, which the reopen
        // path always clears.
        ;(cls || []).forEach((c: { unavailable_from?: string; unavailable_until?: string }) => {
          if (c.unavailable_until) {
            wins.push({ from: c.unavailable_from || null, until: c.unavailable_until })
          }
        })
        const pMs = pickupMs(pickupDate, pickupTime)
        const nowT = torontoNowMs()
        for (const w of wins) {
          const untilMs = w.until ? naiveMs(w.until) : null
          const fromMs = w.from ? naiveMs(w.from) : null
          const openEnded = w.until == null
          if (pMs != null &&
              (openEnded || (untilMs != null && untilMs > nowT && pMs < untilMs)) &&
              (fromMs == null || pMs >= fromMs)) {
            return new Response(JSON.stringify({ error: 'closed_slot' }), {
              status: 409, headers: { 'Content-Type': 'application/json', ...CORS },
            })
          }
        }
      } catch (_e) { /* never block a real order on a schedule lookup failure */ }
    }

    // ── Slot hold ─────────────────────────────────────────────────────────────
    // A request holds its time while Leny decides and the deposit comes in, so
    // a second request too close to it goes back to pick another time. An
    // order from an older page is still taken, and flagged, as before.
    let notesOut = notes
    if (pickupDate && pickupTime) {
      try {
        const myMin = timeToMin(pickupTime)
        const { data: slotRows } = await supabase.from('orders')
          .select('pickup_time,status').eq('pickup_date', pickupDate)
        const conflict = (slotRows || []).some((o: { pickup_time?: string; status?: string }) => {
          if (!ACTIVE.includes(o.status || 'pending')) return false
          const b = timeToMin(o.pickup_time || '')
          return myMin !== null && b !== null && Math.abs(b - myMin) < BLOCK_WINDOW_MIN
        })
        if (conflict && isRequest) {
          return new Response(JSON.stringify({ error: 'closed_slot', reason: 'taken' }), {
            status: 409, headers: { 'Content-Type': 'application/json', ...CORS },
          })
        }
        if (conflict) notesOut = (notesOut ? notesOut + ' ' : '') + '[DOUBLE-BOOKED SLOT]'
      } catch (_e) { /* non-fatal */ }
    }

    // ── Insert (critical path) ────────────────────────────────────────────────
    const token = newToken(), adminToken = newToken()
    const { data: inserted, error } = await supabase.from('orders').insert([{
      dish: dishLabel, qty, unit_price: unit, total, balance_due: balanceDue,
      deposit_amount: deposit, token, admin_token: adminToken,
      customer_name: name, contact, email, notes: notesOut, status: isRequest ? 'requested' : 'pending',
      pickup_date: pickupDate, pickup_time: pickupTime,
      deposit_screenshot_url: depositUrl,
    }]).select('id').single()
    if (error) throw error

    // ── Operator notification (best effort) ───────────────────────────────────
    if (!RESEND_API_KEY) {
      console.error('[namitgid] NOTIFY_RESEND_API_KEY is not set — order #' + inserted.id +
        ' saved but no notification email was sent.')
    }
    try {
      if (!RESEND_API_KEY) throw new Error('no resend key')
      const pickupLine = pickupDate
        ? new Date(pickupDate + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
          + (pickupTime ? ' · ' + pickupTime : '')
        : 'Not specified'
      const decide = `${SITE}/api/decide?id=${inserted.id}&t=${adminToken}`
      const wa = waLink(contact, `Hi ${name.split(' ')[0]}! This is Leny from Namit Gid, about your order for ${pickupLine}.`)
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#9bb9af;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
<table width="100%" style="max-width:460px;background:#f7f0e3;border-radius:18px;overflow:hidden;">
<tr><td style="padding:26px 28px 16px;text-align:center;border-bottom:1px solid rgba(53,40,31,0.1);">
  <div style="font-size:20px;font-weight:700;color:#35281f;">Namit <span style="color:#c4633c;">Gid</span></div>
  <p style="margin:4px 0 0;font-size:12px;color:#7fa196;">${isRequest ? 'New request · please reply within an hour' : 'New order — namit gid, let\'s cook!'}</p>
</td></tr>
<tr><td style="padding:22px 28px 0;">
  <table width="100%" style="background:#fff;border:1px solid rgba(53,40,31,0.1);border-radius:14px;">
    <tr><td style="padding:18px 20px;text-align:center;">
      <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#c4633c;font-weight:700;">Cook this</div>
      <div style="font-size:24px;font-weight:700;color:#35281f;margin-top:6px;">${esc(dishLabel).split(' · ').join('<br>')}</div>
      <div style="font-size:16px;color:#c4633c;margin-top:2px;">${trayPrice ? '' : `Qty ${qty} · `}$${total}</div>
      <div style="font-size:13px;color:rgba(53,40,31,0.6);margin-top:6px;">Deposit $${deposit.toFixed(2)} · <strong>$${balanceDue.toFixed(2)}</strong> at pickup</div>
    </td></tr>
  </table>
  <table width="100%" style="margin-top:10px;"><tr><td style="background:rgba(127,161,150,0.14);border:1px solid rgba(127,161,150,0.3);border-radius:10px;padding:10px 14px;text-align:center;">
    <span style="font-size:11px;color:#5f8177;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Pickup</span>
    <div style="font-size:14px;color:#35281f;margin-top:3px;">${esc(pickupLine)}</div>
  </td></tr></table>
  ${notesOut ? `<table width="100%" style="margin-top:10px;"><tr><td style="background:rgba(196,99,60,0.1);border:1px solid rgba(196,99,60,0.25);border-radius:10px;padding:10px 14px;"><span style="font-size:11px;color:#c4633c;font-weight:700;">Notes: </span><span style="font-size:13px;color:#35281f;">${esc(notesOut)}</span></td></tr></table>` : ''}
  ${depositUrl ? `<table width="100%" style="margin-top:10px;"><tr><td style="background:rgba(127,161,150,0.14);border:1px solid rgba(127,161,150,0.3);border-radius:10px;padding:10px 14px;text-align:center;"><a href="${esc(depositUrl)}" style="font-size:13px;color:#5f8177;font-weight:700;text-decoration:none;">📎 View deposit screenshot</a></td></tr></table>` : ''}
</td></tr>
${isRequest ? `<tr><td style="padding:18px 28px 0;text-align:center;">
  <p style="margin:0 0 12px;font-size:15px;color:#35281f;">Can you make it?</p>
  <a href="${decide}&d=yes" style="display:inline-block;margin:0 4px 8px;padding:13px 20px;border-radius:10px;background:#1E5A63;color:#fff;font-size:15px;font-weight:700;text-decoration:none;">Yes, I can make it</a>
  <a href="${decide}&d=no" style="display:inline-block;margin:0 4px 8px;padding:13px 20px;border-radius:10px;background:#fff;color:#A3462A;border:1.5px solid #A3462A;font-size:15px;font-weight:700;text-decoration:none;">No, I'll message them</a>
  <p style="margin:6px 0 0;font-size:12px;color:rgba(53,40,31,0.55);">A yes asks them for the $${deposit.toFixed(2)} deposit right away.${wa ? ` To talk first: <a href="${wa}" style="color:#1E5A63;">WhatsApp them</a>.` : ''}</p>
</td></tr>` : ''}
<tr><td style="padding:18px 28px 24px;">
  <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(53,40,31,0.45);font-weight:700;">Customer</p>
  <p style="margin:0;font-size:15px;font-weight:600;color:#35281f;">${esc(name)}</p>
  <p style="margin:2px 0 0;font-size:13px;color:rgba(53,40,31,0.6);">${esc(contact)}${email ? ' · ' + esc(email) : ''}</p>
  <p style="margin:18px 0 0;font-size:11px;color:rgba(53,40,31,0.35);text-align:center;">Order #${inserted.id} · © 2026 Namit Gid · Toronto</p>
</td></tr>
</table></td></tr></table></body></html>`

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'Namit Gid Orders <orders@takoshi.ca>',
          to: [NOTIFY_EMAIL],
          // a tray's qty is its number of lines, and each line carries its own count
          subject: isRequest
            ? `🍽️ New request · reply within an hour: ${dishLabel} ($${total}) from ${name}`
            : `🍽️ Namit Gid — ${dishLabel} x${qty} ($${total}) from ${name}`,
          html,
        }),
      })
    } catch (mailErr) {
      console.error('[namitgid] email failed (order still placed):', mailErr)
    }

    return new Response(JSON.stringify({
      success: true,
      orderId: inserted.id,
      dish: dishLabel,
      total,
      balanceDue,
      deposit,
      status: isRequest ? 'requested' : 'pending',
      token,
      pickup: { date: pickupDate, time: pickupTime },
    }), { headers: { 'Content-Type': 'application/json', ...CORS } })

  } catch {
    return new Response(JSON.stringify({ error: 'Something went wrong.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})
