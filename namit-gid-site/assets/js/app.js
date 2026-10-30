/* Namit Gid front end. Reads window.SITE (site.config.js). */
(() => {
  const S = window.SITE;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  root.classList.add('js');
  const calm = root.classList.contains('calm');
  const money = n => '$' + (Math.round(n * 100) / 100).toLocaleString('en-CA');
  const get = path => path.split('.').reduce((o, k) => (o ? o[k] : undefined), S);
  const make = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    n.append(...kids);
    return n;
  };
  const say = msg => { $('live').textContent = msg; };

  // Copy from config
  document.querySelectorAll('[data-k]').forEach(n => { const v = get(n.dataset.k); if (v) n.textContent = v; });
  document.querySelectorAll('[data-href]').forEach(n => { const v = get(n.dataset.href); if (v) n.href = v; });

  // ── Mock mode: preview hosts only, and only when asked for ──────────────
  const isLive = location.hostname === 'namitgid.takoshi.ca';
  let mock = false;
  try {
    if (!isLive && /[?&]mock=1/.test(location.search)) sessionStorage.setItem('ng-mock', '1');
    mock = !isLive && sessionStorage.getItem('ng-mock') === '1';
  } catch (e) {}
  if (mock) $('previewStrip').hidden = false;

  // ── Menu ────────────────────────────────────────────────────────────────
  // Month-day windows in Toronto time (a window may run over New Year).
  const torontoMD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: '2-digit', day: '2-digit' }).format(new Date()).replace('/', '-');
  const inWindow = w => { if (!w) return true; const t = torontoMD(); return w.from <= w.until ? (t >= w.from && t <= w.until) : (t >= w.from || t <= w.until); };
  const HOLIDAY = (S.menu.holiday || []).filter(d => !isLive || inWindow(d.season));
  const ALL = [...S.menu.mains, ...S.menu.desserts, ...HOLIDAY];
  const byId = Object.fromEntries(ALL.map(d => [d.id, d]));
  let tray = [];
  // a saved tray keeps only dishes and sizes still on the menu (the big size is "Medium")
  try {
    tray = JSON.parse(localStorage.getItem('ng-tray') || '[]').map(l => l.size === 'Large' ? { ...l, size: 'Medium' } : l)
      .filter(l => byId[l.id] && (byId[l.id].batch || byId[l.id].sizes.some(s => s.label === l.size)));
  } catch (e) {}
  const save = () => { try { localStorage.setItem('ng-tray', JSON.stringify(tray)); } catch (e) {} };
  const lineKey = l => l.id + '|' + (l.size || '') + '|' + (l.box ? l.box.join(',') : '');
  const linePrice = l => {
    const d = byId[l.id];
    if (d.batch) return d.batch.price * l.qty;
    return d.sizes.find(s => s.label === l.size).price * l.qty;
  };
  const lineLabel = l => {
    const d = byId[l.id];
    if (d.batch) {
      const c = {}; l.box.forEach(f => { c[f] = (c[f] || 0) + 1; });
      return 'Box of 4: ' + Object.entries(c).map(([f, n]) => n + ' ' + f).join(', ');
    }
    return d.sizes.length > 1 ? l.size : '';
  };
  const count = () => tray.reduce((a, l) => a + l.qty, 0);
  const total = () => tray.reduce((a, l) => a + linePrice(l), 0);

  const STEAM = 'M30 70 C20 55 40 45 30 30 S40 10 32 0';
  // Each dish shows its newest approved review (loadReviews fills them in),
  // and anyone can write one.
  const REVIEWABLE = [...S.menu.mains, ...S.menu.desserts, ...(S.menu.holiday || [])];
  const liveQuotes = {};
  function fillQuote(slot) {
    const d = REVIEWABLE.find(x => x.id === slot.dataset.dish), q = liveQuotes[d.id];
    slot.replaceChildren(...(q ? [make('figure', { class: 'dish-quote' }, [make('blockquote', { text: '“' + q.text + '”' }),
      make('figcaption', { text: q.name + ', ordered ' + d.name })])] : []),
      make('button', { type: 'button', class: 'quote-ask', text: q ? 'Tried it too? Tell me how it was' : 'Tried it? Tell me how it was',
        onclick: () => { dishSheet.close(); openReview({ dish: d.id }); } }));
  }
  function dishQuote(d) {
    const slot = make('div', { class: 'quote-slot' });
    slot.dataset.dish = d.id;
    fillQuote(slot);
    return slot;
  }
  function dishFig(d) {
    const fig = make('figure', { class: 'dish-fig' + (d.photo ? ' is-photo' : '') });
    // absolute: a url() in a custom property resolves against the stylesheet
    // that uses it (assets/css/), not the page
    fig.style.setProperty('--m', `url("${new URL(d.img, document.baseURI).href}")`);
    fig.append(make('span', { class: 'shadow' }),
      make('img', { src: d.img, alt: d.name, width: d.w, height: d.h, loading: 'lazy', decoding: 'async' }),
      make('span', { class: 'glint' }));
    if (d.warm) {
      const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 100 70'); svg.setAttribute('class', 'steam'); svg.setAttribute('aria-hidden', 'true');
      ['M38 70 C28 55 48 45 38 30 S48 10 40 0', 'M62 70 C52 56 72 46 62 32 S70 12 64 2'].forEach(p => {
        const path = document.createElementNS(ns, 'path'); path.setAttribute('d', p); path.setAttribute('pathLength', '1'); svg.append(path);
      });
      fig.append(svg);
    }
    const lift = on => () => fig.classList.toggle('lift', on);
    fig.addEventListener('pointerdown', lift(true));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(e => fig.addEventListener(e, lift(false)));
    return fig;
  }

  function sizedDish(d) {
    let size = d.sizes[0].label;
    const el = make('article', { class: 'dish pre', id: 'dish-' + d.id });
    const fig = dishFig(d);
    const chips = d.sizes.length > 1 ? make('div', { class: 'chips', role: 'group', 'aria-label': d.name + ' size' },
      d.sizes.map(s => {
        const b = make('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.label === size) });
        b.append(s.label, make('b', { text: money(s.price) }));
        if (s.feeds) b.append(make('small', { class: 'feeds', text: 'feeds ' + s.feeds + (s.extra ? ' · ' + s.extra : '') }));
        b.addEventListener('click', () => { size = s.label; chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b))); paint(); });
        return b;
      })) : make('p', { class: 'dish-fact', text: d.sizes[0].label + ' · ' + money(d.sizes[0].price) + (d.sizes[0].feeds ? ' · feeds ' + d.sizes[0].feeds : '') });
    const row = make('div', { class: 'add-row' });
    function paint() {
      const line = tray.find(l => l.id === d.id && l.size === size);
      row.replaceChildren();
      if (!line) {
        row.append(make('button', { type: 'button', class: 'btn btn-sea', text: d.min ? 'Add ' + d.min + ' to tray' : 'Add to tray', onclick: () => { add({ id: d.id, size, qty: d.min || 1 }, fig); paint(); } }));
      } else {
        const st = make('div', { class: 'stepper' });
        st.append(
          make('button', { type: 'button', 'aria-label': 'One fewer', text: '−', onclick: () => { change(line, -1); paint(); } }),
          make('output', { text: 'In tray · ' + line.qty }),
          make('button', { type: 'button', 'aria-label': 'One more', text: '+', onclick: () => { add({ id: d.id, size, qty: 1 }, fig); paint(); } }));
        row.append(st);
      }
    }
    paint();
    el._paint = paint;
    const extra = [];
    if (d.min) extra.push(make('p', { class: 'dish-fact', text: money(d.sizes[0].price) + ' each · minimum ' + d.min }));
    if (d.gift && (!isLive || inWindow(d.gift))) extra.push(make('p', { class: 'gift-note', text: d.gift.text }));
    el.append(fig, make('div', { class: 'dish-text' }, [make('h3', { text: d.name }), make('p', { class: 'dish-desc', text: d.desc }), ...extra, dishQuote(d), d.min ? '' : chips, row]));
    return el;
  }

  function boxDish(d) {
    const el = make('article', { class: 'dish pre', id: 'dish-' + d.id });
    const fig = dishFig(d);
    const box = [];
    const slots = make('div', { class: 'cbox-slots', role: 'group', 'aria-label': 'Your box of four' });
    const note = make('p', { class: 'cbox-note' });
    const addBtn = make('button', { type: 'button', class: 'btn btn-sea', text: 'Add box · ' + money(d.batch.price) });
    // each flavour button carries a little painted cake, the same one that drops into the box
    const flav = make('div', { class: 'flavours' }, d.batch.flavours.map(f => {
      const b = make('button', { type: 'button', class: 'flavour' },
        [make('img', { src: 'assets/img/cheesecake/' + f.toLowerCase() + '.webp', alt: '', width: 28, height: 28 }), f]);
      b.addEventListener('click', () => { if (box.length < 4) { box.push(f); paint(box.length - 1); } });
      return b;
    }));
    // dropped: the slot just filled, so only that cake drops in
    function paint(dropped = -1) {
      slots.replaceChildren(...[0, 1, 2, 3].map(i => {
        const f = box[i];
        const s = make('button', { type: 'button', class: 'slot' + (i === dropped ? ' drop' : ''), 'aria-label': f ? f + ', tap to empty' : 'Empty cup' });
        if (f) { s.dataset.f = f; s.addEventListener('click', () => { box.splice(i, 1); paint(); }); }
        return s;
      }));
      const left = 4 - box.length;
      note.textContent = left ? `Pick ${left} more` : 'Box full, salamat!';
      addBtn.disabled = !!left;
      const inTray = tray.filter(l => l.id === d.id).reduce((a, l) => a + l.qty, 0);
      if (inTray) note.textContent += ` · ${inTray} ${inTray > 1 ? 'boxes' : 'box'} in your tray`;
    }
    addBtn.addEventListener('click', () => {
      if (box.length < 4) return;
      const boxesInTray = tray.filter(l => l.id === d.id).reduce((a, l) => a + l.qty, 0);
      if (boxesInTray >= d.batch.max) { note.textContent = 'That’s the most I can make per order.'; return; }
      add({ id: d.id, box: box.slice().sort(), qty: 1 }, fig);
      box.length = 0; paint();
    });
    paint();
    el._paint = paint;
    el.append(fig, make('div', { class: 'dish-text' }, [make('h3', { text: d.name }), make('p', { class: 'dish-desc', text: d.desc }), dishQuote(d),
      make('div', { class: 'cbox' }, [slots, flav, note, addBtn])]));
    return el;
  }

  $('mains').append(...S.menu.mains.map(sizedDish));
  $('desserts').append(...S.menu.desserts.map(d => d.batch ? boxDish(d) : sizedDish(d)));
  $('holiday').append(...HOLIDAY.map(sizedDish));
  const repaintDishes = () => document.querySelectorAll('.dish').forEach(n => n._paint && n._paint());

  // ── Tray ────────────────────────────────────────────────────────────────
  function add(line, fig) {
    const hit = tray.find(l => lineKey(l) === lineKey(line));
    if (hit) hit.qty += line.qty; else tray.push(line);
    save(); renderTray(true);
    if (fig) fly(fig);
    const d = byId[line.id];
    say(`Added ${d.name}${line.size && d.sizes.length > 1 ? ', ' + line.size : ''}. ${count()} in your tray, ${money(total())}.`);
  }
  function change(line, by) {
    line.qty += by;
    const dm = byId[line.id] && byId[line.id].min;
    if (line.qty <= 0 || (dm && line.qty < dm)) tray = tray.filter(l => l !== line);
    save(); renderTray(false);
    say(`${count()} in your tray, ${money(total())}.`);
  }

  function renderTray(bump) {
    const n = count();
    const bar = $('traybar');
    bar.hidden = n === 0;
    $('bilaoCount').textContent = n;
    // the bilao fills when a dish lands in it (see dip); an empty tray empties it
    if (!n) $('bilao').classList.remove('full'); else if (!bump) $('bilao').classList.add('full');
    if ($('kCount')) $('kCount').textContent = n;
    $('traySum').textContent = n + (n === 1 ? ' item' : ' items');
    $('trayTotal').textContent = money(total());
    if (bump) {
      const c = $('bilaoCount'); c.classList.remove('roll'); void c.offsetWidth; c.classList.add('roll');
    }
  }

  function lineList() {
    return make('ul', { class: 'lines' }, tray.map(l => {
      const d = byId[l.id];
      return make('li', { class: 'line-item' }, [
        make('img', { src: d.img, alt: '' }),
        make('div', {}, [make('div', { class: 'nm', text: d.name }), make('div', { class: 'sub', text: lineLabel(l) }),
          make('div', { class: 'line-ctl' }, [
            make('button', { type: 'button', 'aria-label': 'One fewer', text: '−', onclick: () => { change(l, -1); repaintDishes(); refreshSheet(); } }),
            make('span', { text: String(l.qty) }),
            make('button', { type: 'button', 'aria-label': 'One more', text: '+', onclick: () => { if (d.batch && tray.filter(x => x.id === d.id).reduce((a, x) => a + x.qty, 0) >= d.batch.max) return; change(l, 1); repaintDishes(); refreshSheet(); } }),
            make('button', { type: 'button', class: 'rm', text: 'Remove', onclick: () => { change(l, -l.qty); repaintDishes(); refreshSheet(); } })])]),
        make('div', { class: 'tot', text: money(linePrice(l)) })]);
    }));
  }
  function sums() {
    // the deposit is half, rounded up to the dollar (the server works it out the same way)
    const t = total(), dep = Math.ceil(t / 2);
    return make('div', { class: 'sums' }, [
      make('div', {}, [make('span', { text: 'Total' }), make('span', { class: 'big', text: money(t) })]),
      make('div', { class: 'small' }, [make('span', { text: 'Deposit after my yes' }), make('span', { text: money(dep) })]),
      make('div', { class: 'small' }, [make('span', { text: 'At pickup' }), make('span', { text: money(Math.max(0, t - dep)) })])]);
  }

  // The dish flies on an arc into the bilao: X runs linear, Y eases, so the path curves.
  function fly(fig) {
    if (calm) return dip();
    const target = $('bilao');
    if (!target) return;
    const a = fig.querySelector('img').getBoundingClientRect(), b = target.getBoundingClientRect();
    const size = 72;
    const x0 = a.left + a.width / 2 - size / 2, y0 = a.top + a.height / 2 - size / 2;
    const x1 = b.left + b.width / 2 - size / 2, y1 = b.top + b.height / 2 - size / 2;
    const outer = make('div', { class: 'flyer', 'aria-hidden': 'true' });
    const inner = make('div');
    inner.append(make('img', { src: fig.querySelector('img').src, alt: '' }));
    outer.append(inner); (document.querySelector('dialog[open]') || document.body).append(outer);
    const dur = 640;
    outer.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }], { duration: dur, easing: 'linear', fill: 'forwards' });
    const lift = Math.min(160, Math.abs(y1 - y0) * .35 + 60);
    inner.animate([
      { transform: `translateY(${y0}px) scale(1)`, opacity: .0 },
      { transform: `translateY(${Math.min(y0, y1) - lift}px) scale(1)`, opacity: 1, offset: .35, easing: 'cubic-bezier(.55,0,.85,.35)' },
      { transform: `translateY(${y1}px) scale(.35)`, opacity: 1 }],
      { duration: dur, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' })
      .finished.then(() => { outer.remove(); dip(); });
  }
  function dip() {
    const b = $('bilao'); b.classList.remove('dip'); void b.offsetWidth; b.classList.add('dip', 'full');
  }

  // ── Order sheet: Tray · Details · Leny's yes · Deposit ──────────────────
  // A tray is sent as a request. Leny answers within the hour; a yes asks the
  // customer for half the total, on their own order page (?order=…&t=…),
  // which is also where every email links. Nothing is paid before her yes.
  const sheet = $('sheet');
  let step = 0;
  let viewing = null, shot = null;   // the order page being shown, and a deposit screenshot
  const order = { date: null, time: null, name: '', contact: '', email: '', notes: '' };
  try { Object.assign(order, JSON.parse(localStorage.getItem('ng-me') || '{}')); } catch (e) {}
  const STEPS = ['Tray', 'Details', 'Leny’s yes', 'Deposit'], SENT = 2;
  const TITLES = ['Your tray', 'Pickup & details'];
  const TIMES = S.pickup.times || ['11:00 AM', '12:30 PM', '2:00 PM', '3:30 PM', '5:00 PM', '6:30 PM'];
  const LEAD_HOURS = 24;   // Leny shops after she says yes
  const toMin = t => { const m = String(t || '').match(/(\d+):(\d+)\s*(AM|PM)/i); return m ? (+m[1] % 12 + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + +m[2] : null; };
  // Every order holds a 90-minute prep window, so a time near a held one is full.
  let slotLoad = { date: null, load: {} };
  const isFull = t => {
    if (mock) return t === '2:00 PM';
    const load = slotLoad.date === order.date ? slotLoad.load : {}, m = toMin(t);
    return m !== null && Object.keys(load).some(k => load[k] && Math.abs(toMin(k) - m) < 90);
  };
  async function refreshSlotLoad() {
    const date = order.date;
    if (mock || !date) return;
    try {
      const r = await fetch('/api/slot-load?date=' + encodeURIComponent(date));
      if (!r.ok) return;
      slotLoad = { date, load: (await r.json()).load || {} };
      if (order.time && isFull(order.time)) order.time = null;
      if (step === 1 && !viewing && order.date === date) refreshSheet();
    } catch (e) { /* fail open: the server still refuses a taken time */ }
  }
  // Times are compared on Toronto's clock: "naive" ms, a date at 00:00 UTC plus its minutes.
  function torontoNow() {
    const tp = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return { day: new Date(Date.UTC(+tp.year, +tp.month - 1, +tp.day, 12)), ms: Date.UTC(+tp.year, +tp.month - 1, +tp.day, +tp.hour % 24, +tp.minute) };
  }
  const slotMs = (day, t) => day.getTime() - 12 * 3600e3 + toMin(t) * 60e3;
  const phoneOk = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 || (d.length === 11 && d[0] === '1'); };
  // A problem with what they entered, written in red pencil above the button.
  function flag(msg) {
    say(msg);
    const body = $('sheetBody');
    body.querySelectorAll('.nb-flag').forEach(n => n.remove());
    const btn = [...body.querySelectorAll('.btn-sea')].pop(), p = make('p', { class: 'nb-flag', role: 'alert', text: msg });
    if (btn) btn.before(p); else body.append(p);
    p.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  }
  function copyIt(text, btn, node) {
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1600); };
    const select = () => { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Selected'; };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, select); else select();
  }
  const progress = at => make('div', { class: 'progress', 'aria-hidden': 'true' }, STEPS.map((s, i) => make('span', { class: i < at ? 'on done' : i === at ? 'on now' : '', text: s })));
  const TRACK = ['Ordered', 'Confirmed', 'Pickup'];
  const tracker = (at, note) => [make('div', { class: 'progress track', 'aria-hidden': 'true' }, TRACK.map((s, i) => make('span', { class: i < at ? 'on done' : i === at ? 'on now' : '', text: s }))),
    make('p', { class: 'track-note', text: note })];
  const longDay = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

  async function sendRequest() {
    order.name = (order.name || '').trim(); order.email = (order.email || '').trim();
    if (!order.date || !order.time) return flag('Pick a pickup day and time.');
    if (!order.name) return flag('Please add your name.');
    if (!phoneOk(order.contact)) return flag('Please enter a 10-digit WhatsApp or phone number, like 416-555-0123.');
    if (order.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(order.email)) return flag('That email doesn’t look right. Check it, or leave it blank.');
    await refreshSlotLoad();
    if (!order.time || isFull(order.time)) { order.time = null; refreshSheet(); return flag('Sorry, that time was just taken. Please choose another.'); }
    try { localStorage.setItem('ng-me', JSON.stringify({ name: order.name, contact: order.contact, email: order.email })); } catch (e) {}
    place();
  }

  function openSheet(at) { viewing = null; reviewing = null; step = at || 0; refreshSheet(); if (!sheet.open) sheet.showModal(); }
  function refreshSheet() {
    if (reviewing) return renderReview();
    if (viewing) return renderOrderPage();
    if (!sheet.open && step === undefined) return;
    if (!count() && step < SENT) { $('sheetH').textContent = 'Your tray'; $('sheetBody').replaceChildren(make('p', { text: 'Your tray is empty.' })); return; }
    $('sheetH').textContent = step < SENT ? TITLES[step] : 'Request sent!';
    const body = [];
    if (step === 0) {
      body.push(lineList(), sums(), make('button', { type: 'button', class: 'btn btn-sea', text: 'Choose pickup', onclick: () => { step = 1; refreshSheet(); } }));
    } else if (step === 1) {
      // Days and times are Toronto's. A time can be picked 24 hours ahead or
      // later, so Leny can shop after she says yes.
      const now = torontoNow(), earliest = now.ms + LEAD_HOURS * 3600e3, OPEN_DAYS = S.pickup.days || [5, 6, 0];
      const iso = d => d.toISOString().slice(0, 10);
      const days = [];
      for (let i = 1; i <= (S.pickup.bookAheadDays || 28); i++) {
        const d = new Date(now.day); d.setUTCDate(now.day.getUTCDate() + i);
        if (OPEN_DAYS.includes(d.getUTCDay()) && TIMES.some(t => slotMs(d, t) >= earliest)) days.push(d);
      }
      if (!order.date || !days.some(d => iso(d) === order.date)) { order.date = iso(days[0]); order.time = null; }
      if (slotLoad.date !== order.date) refreshSlotLoad();
      const day = days.find(d => iso(d) === order.date);
      const dc = make('div', { class: 'datechips', role: 'group', 'aria-label': 'Pickup day' }, days.map(d => make('button', {
        type: 'button', 'aria-pressed': String(iso(d) === order.date), onclick: () => { order.date = iso(d); order.time = null; refreshSheet(); refreshSlotLoad(); },
      }, [d.toLocaleDateString('en-CA', { weekday: 'short', timeZone: 'UTC' }), make('b', { text: String(d.getUTCDate()) }), d.toLocaleDateString('en-CA', { month: 'short', timeZone: 'UTC' })])));
      let open = 0;
      // times less than 24 hours away are left out; held ones show as full
      const tc = make('div', { class: 'chipgrid', role: 'group', 'aria-label': 'Pickup time' }, TIMES.filter(t => slotMs(day, t) >= earliest).map(t => {
        const full = isFull(t);
        if (full && order.time === t) order.time = null;
        if (!full) open++;
        const b = make('button', { type: 'button', 'aria-pressed': String(t === order.time), class: full ? 'full' : '' }, [t]);
        if (full) { b.disabled = true; b.append(make('small', { text: ' full' })); }
        b.addEventListener('click', () => { order.time = t; refreshSheet(); });
        return b;
      }));
      if (order.time && !TIMES.filter(t => slotMs(day, t) >= earliest).includes(order.time)) order.time = null;
      const f = (id, label, type, attrs = {}) => {
        const inp = type === 'textarea' ? make('textarea', { id, rows: 3, ...attrs }) : make('input', { id, type, ...attrs });
        inp.value = order[id] || '';
        inp.addEventListener('input', () => {
          if (id === 'contact') inp.value = inp.value.replace(/[^\d()+\-.\s]/g, '');
          order[id] = inp.value;
        });
        return make('div', { class: 'field' }, [make('label', { for: id, text: label }), inp]);
      };
      startTurnstile();
      body.push(make('p', { class: 'nb-label', text: 'Pickup day' }), dc,
        make('p', { class: 'nb-label', text: 'Pickup time' }), tc,
        make('p', { class: 'small', text: open ? 'Order at least 24 hours ahead, so I can shop for it.' : 'No times left this day. Try another day.' }),
        f('name', 'Your name', 'text', { autocomplete: 'name' }),
        f('contact', 'WhatsApp or phone number', 'tel', { autocomplete: 'tel', inputmode: 'tel', placeholder: '416-555-0123' }),
        f('email', 'Email (optional, for updates)', 'email', { autocomplete: 'email' }),
        f('notes', 'Notes (allergies, anything I should know)', 'textarea'),
        make('p', { class: 'small', text: 'Nothing to pay yet. I’ll reply within an hour; if I can make it, you send half as a deposit and the rest at pickup.' }),
        make('button', { type: 'button', class: 'btn btn-sea', text: 'Send my request', onclick: sendRequest }));
    } else {
      // sent: what happens next, and their order page
      const link = placed && placed.token ? '?order=' + placed.orderId + '&t=' + placed.token : null;
      body.push(make('div', { class: 'receipt' }, [
        make('p', { class: 'stamp', text: 'Request sent' }),
        make('p', { text: `Salamat, ${order.name.split(' ')[0]}! I’ll reply within an hour${order.email ? ', by email and' : ','} on WhatsApp at ${order.contact}.` }),
        make('p', { text: `If I can make it, you’ll send ${placed ? money(placed.deposit) : 'half'} as a deposit and pay the rest at pickup.` }),
        make('p', { class: 'small', text: 'Pickup ' + longDay(order.date) + ' at ' + order.time + ' · ' + S.pickup.address }),
        ...(placed && placed.orderId ? [make('p', { class: 'small', text: 'Request #' + placed.orderId + ' · Total ' + money(placed.total) })] : [])]),
        ...(link ? [make('a', { class: 'btn btn-line', href: link, text: 'See my request' })] : []),
        make('button', { type: 'button', class: 'btn btn-line', text: 'Done', onclick: () => sheet.close() }));
    }
    $('sheetBody').replaceChildren(progress(step), ...body);
  }

  // ── Reviews: a line or two to Leny ──────────────────────────────────────
  // From an order page the form carries the order's id and secret; from the
  // site it carries the bot check. Leny reads each one before it goes up.
  let reviewing = null;
  async function loadReviews() {
    let list = [];
    if (mock) list = [{ name: 'Marites', text: 'Lasang luto ni lola. We finished the tray before we got home.', dish: 'palabok' }];
    else try { const r = await fetch('/api/reviews'); if (r.ok) list = await r.json(); } catch (e) { /* the windows just invite one */ }
    list.forEach(q => { if (q.dish && !liveQuotes[q.dish]) liveQuotes[q.dish] = q; });   // newest first
    document.querySelectorAll('.quote-slot').forEach(fillQuote);
  }
  function openReview(opts = {}) {
    viewing = null;
    reviewing = { name: String(order.name || '').trim().split(/\s+/)[0], text: '', dish: '', dishes: REVIEWABLE.map(d => d.id), ...opts };
    renderReview();
    if (!sheet.open) sheet.showModal();
    startTurnstile();
  }
  function renderReview() {
    const r = reviewing;
    $('sheetH').textContent = r.sent ? 'Salamat!' : 'Was it namit gid?';
    $('sheetBody').replaceChildren(...(r.sent
      ? [make('p', { text: `Salamat, ${r.name}! I’ll read it tonight.` }), make('button', { type: 'button', class: 'btn btn-line', text: 'Done', onclick: () => sheet.close() })]
      : [make('p', { text: 'Tell me in a line or two. I read every one.' }), ...reviewFields(r, renderReview)]));
  }
  // name, dish and the note; `after` redraws the page once it's sent
  function reviewFields(r, after) {
    const field = (id, label, el) => make('div', { class: 'field' }, [make('label', { for: id, text: label }), el]);
    const name = make('input', { id: 'rvName', type: 'text', autocomplete: 'given-name', maxlength: '40', value: r.name || '' });
    name.addEventListener('input', () => { r.name = name.value; });
    const pick = make('select', { id: 'rvDish' }, [make('option', { value: '', text: 'Pick one' }),
      ...r.dishes.map(id => { const d = REVIEWABLE.find(x => x.id === id), o = make('option', { value: id, text: d.name }); if (id === r.dish) o.selected = true; return o; })]);
    pick.addEventListener('change', () => { r.dish = pick.value; });
    const text = make('textarea', { id: 'rvText', rows: '4', maxlength: '600', placeholder: 'What did you like? How did it go at the party?' });
    text.value = r.text || '';
    text.addEventListener('input', () => { r.text = text.value; });
    const btn = make('button', { type: 'button', class: 'btn btn-sea', text: 'Send to Leny' });
    btn.addEventListener('click', () => sendReview(r, btn, after));
    return [...(r.order ? [] : [field('rvName', 'Your first name', name)]),
      ...(r.dishes.length > 1 ? [field('rvDish', 'What you had', pick)] : []),
      field('rvText', 'Your note', text),
      make('p', { class: 'small', text: 'Some notes go on the site, with your first name.' }), btn];
  }
  async function sendReview(r, btn, after) {
    if (r.dishes.length === 1) r.dish = r.dishes[0];
    if (!String(r.name || '').trim()) return flag('Add your first name, so I know who it’s from.');
    if (!r.dish) return flag('Pick what you had, so it goes in the right window.');
    if (String(r.text || '').trim().length < 3) return flag('Write a line or two first.');
    btn.disabled = true; btn.textContent = 'Sending…';
    const d = REVIEWABLE.find(x => x.id === r.dish);
    try {
      const token = r.order ? '' : await turnstileToken(btn);
      const res = mock ? { ok: true } : await fetch('/api/submit-review', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: r.name, text: r.text, dish: r.dish, dishName: d ? d.name : '', order: r.order, t: r.t, token }) });
      if (res.ok || res.status === 409) { r.sent = true; return after(); }
      throw new Error(res.status === 429 ? 'That’s a lot of notes for one day! Try again tomorrow.' : '');
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Send to Leny';
      if (!r.order) startTurnstile(true);
      flag(e.message || 'That didn’t go through. Try again in a moment.');
    }
  }
  // the menu dishes in an order's label ("Palabok (Medium) ×1 · Tiramisu ×1")
  const orderDishIds = label => [...new Set(String(label || '').split(' · ')
    .map(l => REVIEWABLE.find(d => l.startsWith(d.name))).filter(Boolean).map(d => d.id))];

  // ── The customer's order page (?order=…&t=…) ────────────────────────────
  async function loadOrderPage(id, t) {
    if (mock && id === 'demo') {
      // previews show any stage: ?mock=1&order=demo&t=x&status=accepted
      const st = new URLSearchParams(location.search).get('status') || 'accepted';
      viewing = { id: 'demo', t, status: st, dish: 'Palabok (Medium) ×1 · Chocolate Dreamcake ×4', total: 145, deposit: 73, balance: 72,
        pickupDate: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), pickupTime: '12:30 PM', name: 'Ana',
        depositDeadline: new Date(Date.now() + 7200e3).toISOString(), depositEmail: S.deposit.email };
    } else {
      try {
        const r = await fetch('/api/my-order?id=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(t));
        viewing = r.ok ? { ...(await r.json()), t } : { status: 'missing' };
      } catch (e) { viewing = { status: 'offline', id, t }; }
    }
    renderOrderPage();
    if (!sheet.open) sheet.showModal();
    watchOrder();
  }
  function renderOrderPage() {
    const o = viewing, body = [];
    const lines = () => make('ul', { class: 'lines' }, String(o.dish || '').split(' · ').map(l => make('li', { class: 'line-item plain' }, [make('div', { class: 'nm', text: l })])));
    const sumsOf = () => make('div', { class: 'sums' }, [
      make('div', {}, [make('span', { text: 'Total' }), make('span', { class: 'big', text: money(o.total) })]),
      make('div', { class: 'small' }, [make('span', { text: 'Deposit (half)' }), make('span', { text: money(o.deposit) })]),
      make('div', { class: 'small' }, [make('span', { text: 'At pickup' }), make('span', { text: money(o.balance) })])]);
    const when = () => make('p', { class: 'small', text: 'Pickup ' + longDay(o.pickupDate) + ' at ' + o.pickupTime + ' · ' + S.pickup.address });
    const refresh = make('button', { type: 'button', class: 'btn btn-line', text: 'Try again', onclick: () => loadOrderPage(o.id, o.t) });
    let title = 'Your request', at = -1, note = '';
    if (o.status === 'missing' || o.status === 'offline') {
      title = o.status === 'offline' ? 'Sandali lang' : 'Hmm, where is it?';
      body.push(make('p', { text: o.status === 'offline' ? 'I couldn’t reach my order book just now. Try again in a moment.' : 'I can’t find this request. Open the latest email or message I sent you about it.' }),
        ...(o.status === 'offline' ? [refresh] : []));
      $('sheetH').textContent = title; return $('sheetBody').replaceChildren(...body);
    }
    if (o.status === 'requested') {
      at = 1; note = 'Waiting for my answer';
      body.push(make('p', { text: `Salamat, ${o.name}! I got your request. I’ll reply within the hour, and this page will change when I do.` }), lines(), sumsOf(), when());
    } else if (o.status === 'accepted') {
      title = 'Send your deposit'; at = 1; note = 'Your deposit confirms it';
      const row = (label, value, copyText) => {
        const v = make('span', { class: 'v', text: value });
        const b = make('button', { type: 'button', class: 'copy', text: 'Copy' });
        b.addEventListener('click', () => copyIt(copyText || value, b, v));
        return make('div', { class: 'dep-row' }, [make('span', { class: 'k', text: label }), v, b]);
      };
      const pick = make('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/heic', class: 'sr-only' });
      pick.addEventListener('change', () => { shot = pick.files[0] || null; renderOrderPage(); });
      const up = make('label', { class: 'upload' + (shot ? ' has' : '') }, [pick,
        ...(shot ? [make('img', { class: 'up-prev', src: URL.createObjectURL(shot), alt: '' })] : []),
        make('span', { text: shot ? '✓ ' + shot.name + ' (tap to change)' : 'Add a screenshot of your e-Transfer' })]);
      const by = o.depositDeadline ? new Date(o.depositDeadline).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }) : null;
      body.push(make('p', { text: `It’s a deal, ${o.name}! I can make it.` }),
        make('div', { class: 'etr' }, [
          make('p', { class: 'etr-h', text: 'Send your ' + money(o.deposit) + ' deposit' }),
          make('p', { class: 'small', text: 'Half the total, by Interac e-Transfer' + (by ? ', by ' + by + '. After that the time is freed up.' : '.') }),
          row('To', o.depositEmail || S.deposit.email), row('Amount', money(o.deposit) + ' CAD', String(o.deposit)), row('Message', 'Namit Gid ' + o.name)]),
        up, sumsOf(), when(),
        make('button', { type: 'button', class: 'btn btn-sea', text: 'I’ve sent my deposit', onclick: depositSent }));
    } else if (o.status === 'verifying') {
      title = 'Checking your deposit'; at = 1; note = 'Checking your deposit';
      body.push(make('p', { text: `Salamat, ${o.name}! I’m checking my bank for your ${money(o.deposit)}. This page will change as soon as I see it.` }), lines(), sumsOf(), when());
    } else if (o.status === 'completed' || o.status === 'picked_up' || (['confirmed', 'ready'].includes(o.status) && o.pickupDate && o.pickupDate < torontoNow().day.toISOString().slice(0, 10))) {
      // after pickup the page asks how it was
      title = 'How was it?'; at = 3; note = 'Picked up. Salamat!';
      const ids = orderDishIds(o.dish);
      o.rv = o.rv || { order: o.id, t: o.t, name: o.name, text: '', dishes: ids.length ? ids : REVIEWABLE.map(d => d.id), dish: ids.length === 1 ? ids[0] : '' };
      if (o.reviewed || o.rv.sent) body.push(make('p', { text: `Salamat for your note, ${o.name}! I read every one.` }), lines());
      else body.push(make('p', { text: `Salamat for ordering, ${o.name}! Was it namit gid? Tell me in a line or two.` }), ...reviewFields(o.rv, renderOrderPage));
    } else if (o.status === 'confirmed' || o.status === 'ready') {
      title = 'Confirmed!'; at = 2; note = 'See you at pickup';
      body.push(make('div', { class: 'receipt' }, [make('p', { class: 'stamp', text: 'Confirmed' }),
        make('p', { text: `You’re all set, ${o.name}! See you ${longDay(o.pickupDate)} at ${o.pickupTime}.` }),
        make('p', { class: 'small', text: money(o.balance) + ' left to pay at pickup · ' + S.pickup.address })]),
        lines(), calendarLink(o.pickupDate, o.pickupTime));
    } else if (o.status === 'declined') {
      title = 'About your request';
      body.push(make('p', { text: `Really sorry, ${o.name}, I can’t make that time. I’ll message you to find another day. Nothing was charged.` }), lines());
    } else if (o.status === 'expired') {
      title = 'This request expired';
      body.push(make('p', { text: 'I didn’t get the deposit in time, so I had to free up the pickup time for other orders. Nothing was charged. I’d love to cook for you another time.' }),
        make('button', { type: 'button', class: 'btn btn-sea', text: 'Start a new order', onclick: () => { sheet.close(); startOver(); } }));
    } else {
      body.push(make('p', { text: 'This order is ' + String(o.status).replace('_', ' ') + '.' }), lines());
    }
    $('sheetH').textContent = title;
    $('sheetBody').replaceChildren(...(at < 0 ? [] : tracker(at, note)), ...body);
  }
  // While the order page is open it checks for Leny's answer on its own,
  // every 30 seconds and whenever they come back to the tab.
  let watchTimer = 0;
  function watchOrder() {
    clearInterval(watchTimer);
    const o = viewing;
    if (o && !mock && ['requested', 'accepted', 'verifying', 'confirmed', 'ready'].includes(o.status)) watchTimer = setInterval(checkOrder, 30e3);
  }
  async function checkOrder() {
    const o = viewing;
    if (!o || !o.t || mock || !sheet.open || document.hidden) return;
    try {
      const r = await fetch('/api/my-order?id=' + encodeURIComponent(o.id) + '&t=' + encodeURIComponent(o.t));
      if (!r.ok) return;
      const n = await r.json();
      if (viewing !== o || !n.status || n.status === o.status) return;
      viewing = { ...o, ...n, t: o.t };
      renderOrderPage();
      say($('sheetH').textContent);
      watchOrder();
    } catch (e) { /* try again on the next tick */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkOrder(); });
  async function depositSent() {
    const o = viewing, btn = [...$('sheetBody').querySelectorAll('button')].find(b => /sent my deposit/.test(b.textContent));
    if (!shot) return flag('Add a screenshot of your e-Transfer first, so I can match it to your order.');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      if (mock && o.id === 'demo') { await new Promise(r => setTimeout(r, 400)); viewing = { ...o, status: 'verifying' }; shot = null; return renderOrderPage(); }
      if (btn) btn.textContent = 'Uploading screenshot…';
      let screenshot = null;
      try {
        const fd = new FormData(); fd.append('file', shot);
        const upr = await (await fetch('/api/upload-deposit', { method: 'POST', body: fd })).json();
        if (upr.url) screenshot = upr.url;
      } catch (e) { /* told below */ }
      if (!screenshot) throw new Error('shot');
      const r = await fetch('/api/deposit-sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: o.id, t: o.t, screenshot }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok || d.status) { viewing = { ...o, status: d.status || 'verifying' }; shot = null; return renderOrderPage(); }
      throw new Error('send');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'I’ve sent my deposit'; }
      flag(e.message === 'shot' ? 'Your screenshot didn’t upload. Try another picture, or send it to me on WhatsApp.' : 'That didn’t go through. Try again in a moment, or message me on WhatsApp.');
    }
  }
  {
    const q = new URLSearchParams(location.search);
    if (q.get('order') && q.get('t')) setTimeout(() => loadOrderPage(q.get('order'), q.get('t')), 300);
    else if (q.get('review')) setTimeout(() => openReview(), 300);
    loadReviews();
  }

  // An .ics file for the pickup, so it lands in their calendar.
  function calendarLink(date = order.date, time = order.time) {
    const m = String(time || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!date || !m) return '';
    const start = (+m[1] % 12 + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + +m[2], end = start + 30;
    const stamp = mins => date.replace(/-/g, '') + 'T' + String(Math.floor(mins / 60)).padStart(2, '0') + String(mins % 60).padStart(2, '0') + '00';
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Namit Gid//Pickup//EN', 'BEGIN:VEVENT',
      'UID:' + Date.now() + '@namitgid', 'DTSTART;TZID=America/Toronto:' + stamp(start), 'DTEND;TZID=America/Toronto:' + stamp(end),
      'SUMMARY:Namit Gid pickup', 'LOCATION:' + S.pickup.address, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return make('a', { class: 'btn btn-line', download: 'namit-gid-pickup.ics', href: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics), text: 'Add pickup to my calendar' });
  }

  // The tray as the server reads it: one line per dish and size, a cheesecake
  // box as its flavour counts. Only names, sizes and counts are sent; the
  // server prices everything from its own table.
  function trayLines() {
    return tray.map(l => {
      const d = byId[l.id];
      if (d.batch) {
        const c = {};
        l.box.forEach(fl => { c[fl] = (c[fl] || 0) + l.qty; });
        return { dish: d.name, batches: l.qty, items: Object.entries(c).map(([label, qty]) => ({ label, qty })) };
      }
      return { dish: d.name, size: l.size, qty: l.qty };
    });
  }
  // A plain-text copy of the order, for when the system can't take it.
  const orderText = () => ['Namit Gid order', ...tray.map(l => '• ' + byId[l.id].name + (lineLabel(l) ? ' (' + lineLabel(l) + ')' : '') + ' ×' + l.qty),
    'Total ' + money(total()), 'Pickup ' + order.date + ' ' + (order.time || ''), order.name + ' · ' + order.contact].join('\n');
  let placed = null, placing = false;

  // ── Bot check: Cloudflare Turnstile, invisible, as on Takoshi ──────────
  // Started when the details page opens, so a token is usually ready by the
  // time they send. A token works once, so it's renewed after every send.
  let tsToken = '', tsId = null, tsLoad = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    return tsLoad || (tsLoad = new Promise(done => {
      const s = make('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: '' });
      s.onload = s.onerror = () => done();
      document.head.append(s);
    }));
  }
  // Renders once; `again` asks for a fresh token (after a send, or when one is missing).
  async function startTurnstile(again) {
    if (!S.turnstileSiteKey || mock) return;
    await loadTurnstile();
    if (!window.turnstile) return;
    if (tsId !== null) { if (again) { tsToken = ''; turnstile.reset(tsId); } return; }
    tsId = turnstile.render('#tsWidget', {
      sitekey: S.turnstileSiteKey,
      callback: t => { tsToken = t; },
      'expired-callback': () => { tsToken = ''; turnstile.reset(tsId); },
      'error-callback': () => { tsToken = ''; },
    });
  }
  async function turnstileToken(btn) {
    if (!S.turnstileSiteKey || mock) return '';
    if (tsId === null) await startTurnstile();
    // the check usually finishes while they fill in the page; if not, give it up to 8 s
    if (!tsToken && btn) btn.textContent = 'Checking…';
    for (let i = 0; i < 16 && !tsToken; i++) await new Promise(r => setTimeout(r, 500));
    return tsToken;
  }

  async function place() {
    if (placing) return;
    placing = true;
    const btn = [...$('sheetBody').querySelectorAll('button')].find(b => /Send my request/.test(b.textContent));
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    const done = res => { placed = res; step = SENT; tray = []; save(); renderTray(false); repaintDishes(); refreshSheet(); };
    const fail = (msg, offerCopy) => {
      if (btn) { btn.disabled = false; btn.textContent = 'Send my request'; }
      $('sheetBody').querySelectorAll('.place-error').forEach(n => n.remove());
      const box = make('div', { class: 'place-error', role: 'alert' }, [make('p', { text: msg })]);
      if (offerCopy) {
        const cp = make('button', { type: 'button', class: 'btn btn-line', text: 'Copy my order' });
        cp.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(orderText()).then(() => { cp.textContent = 'Copied'; }); });
        box.append(cp);
        const c = S.contacts || {};
        if (c.whatsapp) box.append(make('a', { class: 'btn btn-sea', href: 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(orderText()), target: '_blank', rel: 'noopener', text: 'Send it on WhatsApp' }));
        else if (c.messenger) box.append(make('a', { class: 'btn btn-sea', href: c.messenger, target: '_blank', rel: 'noopener', text: 'Send it on Messenger' }));
        else box.append(make('p', { class: 'small' }, ['Or email it to ', make('a', { href: 'mailto:' + S.deposit.email, text: S.deposit.email }), '.']));
      }
      $('sheetBody').append(box);
      say(msg);
    };
    const payload = { order: { lines: trayLines(), name: order.name.trim(), contact: order.contact.trim(), email: (order.email || '').trim(),
      notes: (order.notes || '').trim(), pickupDate: order.date, pickup: order.time } };
    try {
      const token = await turnstileToken(btn);
      if (S.turnstileSiteKey && !mock && !token) {
        if (btn) { btn.disabled = false; btn.textContent = 'Send my request'; }
        startTurnstile(true);
        return flag('The security check is still running. Wait a moment and try again.');
      }
      payload.token = token;
      if (btn) btn.textContent = 'Sending…';
      if (mock) {
        await new Promise(r => setTimeout(r, 500));
        const t = total(), dep = Math.ceil(t / 2);
        return done({ orderId: 'demo', token: 'x', total: t, deposit: dep, balanceDue: t - dep, status: 'requested' });
      }
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch('/api/submit-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) return done(data);
      if (res.status === 409 && data.error === 'closed_slot') { step = 1; order.time = null; refreshSheet(); return flag('That time was just taken. Please pick another.'); }
      if (res.status === 409 && data.error === 'too_soon') { step = 1; order.time = null; refreshSheet(); return flag('Pickups need 24 hours’ notice. Please pick a later time.'); }
      if (res.status === 409) return fail(data.message || 'Sarado anay kita: the kitchen isn’t taking orders right now.', true);
      if (res.status === 400) return fail('Something in the tray didn’t add up. Please check it and try again.', false);
      if (res.status === 403) { if (btn) { btn.disabled = false; btn.textContent = 'Send my request'; } return flag('The security check didn’t pass. Please try again.'); }
      fail('My order system is napping. Send me your order instead and I’ll sort it out.', true);
    } catch (e) {
      fail('My order system is napping. Send me your order instead and I’ll sort it out.', true);
    } finally {
      placing = false;
      // a token works once
      if (tsId !== null && window.turnstile) { tsToken = ''; turnstile.reset(tsId); }
    }
  }

  $('trayReview').addEventListener('click', () => openSheet(0));
  $('bilao').addEventListener('click', () => openSheet(0));
  $('sheetClose').addEventListener('click', () => sheet.close());

  // ── Leny's kitchen: pots, oven and register open to the menu ───────────
  const kitchen = $('kitchen'), menu = $('menu');

  // Eight burners along one stove, left to right. Mains take burners in
  // order (a main can ask for a vessel with "pot" in the config); today's four
  // keep the vessels they were first painted for.
  const BURNERS = [
    { pot: 'palayok', l: 2.8, t: 41, w: 9.6, h: 17.5 }, { pot: 'wok', l: 12.8, t: 41, w: 13.8, h: 17.5 },
    { pot: 'pan', l: 26.6, t: 41, w: 11, h: 17.5 }, { pot: 'dish', l: 37.8, t: 41, w: 10.8, h: 17.5 },
    { pot: 'stock', l: 52.5, t: 41, w: 12.2, h: 17.5 }, { pot: 'steamer', l: 65.1, t: 41, w: 10.3, h: 17.5 },
    { pot: 'saucepan', l: 76.6, t: 41, w: 12.6, h: 17.5 }, { pot: 'ricecooker', l: 89.9, t: 41, w: 9.6, h: 17.5 },
  ];
  const PREFERRED = { palabok: 'palayok', shawarma: 'wok', lumpia: 'pan', sushi: 'dish' };
  const seat = {};
  S.menu.mains.forEach(d => { const want = d.pot || PREFERRED[d.id]; if (want && BURNERS.some(b => b.pot === want)) seat[want] = d; });
  S.menu.mains.filter(d => !Object.values(seat).includes(d)).forEach(d => { const free = BURNERS.find(b => !seat[b.pot]); if (free) seat[free.pot] = d; });
  const world = $('kWorld'), scroller = $('kScroller'), glow = world.querySelector('.k-glow');
  if (!HOLIDAY.length) world.querySelectorAll('.k-holiday, .k-ribbon, .k-sparkle').forEach(n => n.remove());
  BURNERS.forEach((b, k) => {
    const d = seat[b.pot];
    // on the live site an empty burner is just part of the painting
    world.insertBefore(make('img', { class: 'k-layer', 'data-layer': b.pot, src: 'assets/img/kitchen/lid-' + b.pot + '.webp?v=2', alt: '', 'aria-hidden': 'true' }), glow);
    if (d) world.insertBefore(make('i', { class: 'k-wisp', 'aria-hidden': 'true', style: `--x:${b.l + b.w / 2}%;--d:${(k * 1.9) % 8}s` }), glow);
    world.append(make('button', { class: 'k-spot', type: 'button', 'data-spot': b.pot, 'data-dish': d ? d.id : 'sample',
      style: `left:${b.l}%;top:${b.t}%;width:${b.w}%;height:${b.h}%` },
      [make('span', { class: 'k-tag' + (d ? '' : ' sample'), text: d ? (d.short || d.name) : 'Soon' })]));
  });
  // Walking along the wall: drag with a mouse too, arrows step half a screen,
  // a small meter shows where you are, and a first nudge shows there's more.
  const meter = $('kMeter').firstElementChild;
  const where = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    const room = max > 4;
    $('kMeter').hidden = !room;
    if (room) { const f = scroller.clientWidth / scroller.scrollWidth; meter.style.width = (f * 100) + '%'; meter.style.left = (scroller.scrollLeft / scroller.scrollWidth * 100) + '%'; }
  };
  scroller.addEventListener('scroll', () => requestAnimationFrame(where), { passive: true });
  // (the scroller's own size also changes as the kitchen is shown on going in)
  if ('ResizeObserver' in window) new ResizeObserver(where).observe(scroller);
  else addEventListener('resize', where);
  world.querySelector('.k-wall').addEventListener('load', where);
  where();
  let drag = null, dragged = false;
  scroller.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; drag = { x: e.clientX, s: scroller.scrollLeft }; dragged = false; });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) { dragged = true; scroller.classList.add('dragging'); }
    scroller.scrollLeft = drag.s - dx;
  });
  addEventListener('pointerup', () => { drag = null; scroller.classList.remove('dragging'); });
  // a drag that moved should not also count as a tap on a pot
  scroller.addEventListener('click', e => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  const peekLid = () => {
    const first = world.querySelector('.k-layer[data-layer="palayok"]');
    if (!first || calm) return;
    first.classList.add('peek'); setTimeout(() => first.classList.remove('peek'), 1300);
  };
  if (!calm && 'IntersectionObserver' in window) {
    const lidHint = new IntersectionObserver(es => { if (es[0].isIntersecting) { lidHint.disconnect(); setTimeout(peekLid, 500); } }, { threshold: .5 });
    lidHint.observe(kitchen);
    const nudge = new IntersectionObserver(es => {
      if (!es[0].isIntersecting || scroller.scrollWidth - scroller.clientWidth < 4) return;
      nudge.disconnect();
      setTimeout(() => { scroller.scrollBy({ left: 70, behavior: 'smooth' }); setTimeout(() => scroller.scrollBy({ left: -70, behavior: 'smooth' }), 700); }, 900);
    }, { threshold: .6 });
    nudge.observe(kitchen);
  }
  const dishSheet = $('dishSheet'), dishBody = $('dishSheetBody');
  const layerOf = name => kitchen.querySelector('[data-layer="' + name + '"]');
  let openSpot = null, borrowed = [];
  const titles = { desserts: 'From the oven', holiday: 'Holiday special', register: 'Your order' };
  function closeSpot() {
    if (!openSpot) return;
    const ol = layerOf(openSpot); if (ol) ol.classList.remove('open');
    kitchen.classList.remove('oven-hot', 'dome-open');
    // the dishes go back where they live in the list
    borrowed.reverse().forEach(({ node, home, next }) => home.insertBefore(node, next && next.parentNode === home ? next : null));
    borrowed = []; openSpot = null;
  }
  function openDishes(ids, title) {
    dishBody.replaceChildren();
    const wrap = make('div', { class: 'dishes-in' });
    ids.forEach(id => {
      const node = $('dish-' + id); if (!node) return;
      borrowed.push({ node, home: node.parentNode, next: node.nextSibling });
      node.classList.remove('pre'); node.classList.add('in');
      wrap.append(node);
    });
    dishBody.append(wrap);
    $('dishSheetH').textContent = title;
    dishSheet.showModal();
  }
  kitchen.querySelectorAll('.k-spot').forEach(btn => btn.addEventListener('click', () => {
    const spot = btn.dataset.spot, dish = btn.dataset.dish;
    closeSpot();
    openSpot = spot;
    const nl = layerOf(spot); if (nl) nl.classList.add('open');
    if (spot === 'oven') kitchen.classList.add('oven-hot');
    if (spot === 'dome') kitchen.classList.add('dome-open');
    // bring the spot near the top so it stays in view above the sheet
    const r = btn.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
    scroller.scrollBy({ left: (r.left + r.width / 2) - (sr.left + sr.width / 2), behavior: calm ? 'auto' : 'smooth' });
    $('menu').scrollBy({ top: r.top - innerHeight * .12, behavior: calm ? 'auto' : 'smooth' }); // the room, on a screen too short for it
    // the sheet starts rising while the lid is still lifting (it fades in over 450 ms)
    setTimeout(() => {
      if (spot === 'register') { openSheet(0); return; }
      if (spot === 'phone') {
        const c = S.contacts || {};
        const links = [c.whatsapp && ['Message me on WhatsApp', 'https://wa.me/' + c.whatsapp], c.messenger && ['Message me on Messenger', c.messenger], c.facebook && ['Facebook', c.facebook], c.instagram && ['Instagram', c.instagram]].filter(Boolean);
        dishBody.replaceChildren(make('div', { class: 'phone-card' }, [
          make('p', { text: 'Party tray? Allergy question? Or just kumusta? Message me.' }),
          ...links.map(([t, u]) => make('p', {}, [make('a', { class: 'btn btn-sea', href: u, target: '_blank', rel: 'noopener', text: t })])),
          make('p', {}, [make('a', { href: 'mailto:' + S.deposit.email, text: S.deposit.email })])]));
        $('dishSheetH').textContent = 'Say hi'; dishSheet.showModal(); return;
      }
      if (dish === 'sample') {
        dishBody.replaceChildren(make('p', { text: 'Something new is coming to this pot. Check back soon!' }));
        $('dishSheetH').textContent = 'Coming soon'; dishSheet.showModal(); return;
      }
      if (dish === 'desserts') openDishes(S.menu.desserts.map(d => d.id), titles.desserts);
      else if (dish === 'holiday') openDishes(HOLIDAY.map(d => d.id), titles.holiday);
      else openDishes([dish], 'From the stove');
    }, calm ? 0 : 200);
  }));
  // The recipe card on the wall: how ordering works.
  $('kCard').addEventListener('click', () => {
    closeSpot();
    dishBody.replaceChildren($('howSteps').content.cloneNode(true));
    $('dishSheetH').textContent = 'How to order';
    dishSheet.showModal();
  });
  $('dishSheetClose').addEventListener('click', () => dishSheet.close());
  dishSheet.addEventListener('click', e => { if (e.target === dishSheet) dishSheet.close(); });
  dishSheet.addEventListener('close', closeSpot);
  sheet.addEventListener('close', () => { reviewing = null; clearInterval(watchTimer); if (openSpot === 'register') closeSpot(); });

  // Pull a sheet down to close it, like any phone sheet: only once its paper
  // is scrolled to the top, so scrolling the paper itself still works.
  [sheet, dishSheet].forEach(d => {
    const paper = d.querySelector('.sheet-inner');
    let y0 = null, dy = 0, t0 = 0;
    d.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || paper.scrollTop > 0) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0; t0 = performance.now();
    }, { passive: true });
    d.addEventListener('touchmove', e => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0 || paper.scrollTop > 0) { if (dy < 0) y0 = null; d.classList.remove('dragging'); d.style.transform = ''; return; }
      e.preventDefault();
      d.classList.add('dragging');
      d.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: false });
    d.addEventListener('touchend', () => {
      if (y0 === null) return;
      const fast = dy / Math.max(1, performance.now() - t0) > .6;
      y0 = null; d.classList.remove('dragging');
      if (dy > 110 || (fast && dy > 40)) {
        d.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'translateY(100%)' }], { duration: 200, easing: 'ease-in' }).onfinish = () => { d.style.transform = ''; d.close(); };
      } else if (dy > 0) {
        d.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
        d.style.transform = '';
      }
      dy = 0;
    });
  });

  // A breeze as a sheet opens: a painted sprig and a leaf blow in over its
  // top edge, tumble across and fade. Transforms and opacity only.
  if (!calm && 'MutationObserver' in window) {
    const LEAVES = [['assets/img/leaf-sprig.webp', 58], ['assets/img/leaf-one.webp', 22]];
    const gust = d => {
      const w = d.offsetWidth;
      LEAVES.forEach(([src, size], i) => {
        const leaf = make('img', { src, class: 'sheet-leaf', alt: '', 'aria-hidden': 'true' });
        leaf.style.width = size + 'px';
        leaf.style.left = -size + 'px';
        leaf.style.top = (i ? -34 : -60) + 'px';
        d.append(leaf);
        const dx = w + size * 2, fall = 40 + i * 50, spin = i ? 300 : 70;
        const at = (k, r) => `translate(${dx * k}px, ${fall * k}px) rotate(${r}deg)`;
        leaf.animate([
          { transform: 'translate(0, 0) rotate(-20deg)', opacity: 0 },
          { transform: at(.3, spin * .3 - 10), opacity: .95, offset: .18 },
          { transform: at(.65, spin * .7), opacity: .9, offset: .6 },
          { transform: at(1, spin), opacity: 0 },
        ], { duration: 1900 + i * 350, delay: 60 + i * 260, easing: 'cubic-bezier(.3,.1,.4,1)', fill: 'both' }).onfinish = () => leaf.remove();
      });
    };
    [sheet, dishSheet].forEach(d => new MutationObserver(() => { if (d.open) gust(d); }).observe(d, { attributes: true, attributeFilter: ['open'] }));
  }

  // Dish photos sit in a list nobody scrolls past, so lazy loading meant each
  // photo started downloading only when its sheet opened. Fetch them quietly
  // once the page has settled.
  const warmDishes = () => {
    document.querySelectorAll('.dish-fig img[loading="lazy"]').forEach(im => { im.loading = 'eager'; });
    ['assets/img/leaf-sprig.webp', 'assets/img/leaf-one.webp'].forEach(src => { const im = new Image(); im.src = src; im.decode && im.decode().catch(() => {}); });
  };
  const warmLater = () => setTimeout(() => (window.requestIdleCallback || setTimeout)(warmDishes), 2500);
  if (document.readyState === 'complete') warmLater(); else addEventListener('load', warmLater, { once: true });
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

  renderTray(false);

  // ── Reviews: static first, never empty ──────────────────────────────────
  // The next pickup day with a time at least 24 hours away, in Toronto (the
  // same rule as the checkout's times).
  {
    const now = torontoNow(), earliest = now.ms + LEAD_HOURS * 3600e3, open = S.pickup.days || [5, 6, 0];
    for (let i = 1; i < 15; i++) {
      const d = new Date(now.day); d.setUTCDate(now.day.getUTCDate() + i);
      if (!open.includes(d.getUTCDay()) || !TIMES.some(t => slotMs(d, t) >= earliest)) continue;
      const np = $('nextPickup'); np.hidden = false;
      np.append(make('i', { class: 'np-dot', 'aria-hidden': 'true' }), 'Next pickup: ', make('strong', { text: d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }) }));
      break;
    }
  }
  // Socials on the shell's card, only those that exist.
  { const c = S.contacts || {}, todo = document.querySelector('.beach-card .todo');
    const links = [['WhatsApp', c.whatsapp && 'https://wa.me/' + c.whatsapp], ['Facebook', c.facebook], ['Messenger', c.messenger], ['Instagram', c.instagram]].filter(x => x[1]);
    if (todo) { if (links.length) todo.replaceChildren(...links.flatMap(([t, u], i) => [i ? ' · ' : '', make('a', { href: u, target: '_blank', rel: 'noopener', text: t })])); else todo.remove(); } }

  // ── Open / closed: the lighthouse in the bar ────────────────────────────
  const showOpen = on => {
    const text = on ? 'Taking orders' : 'Closed for orders', st = $('barStatus');
    $('navLamp').classList.toggle('is-on', on);
    st.textContent = text; st.classList.toggle('closed', !on); st.classList.add('shown');
    document.querySelector('.bar-brand').setAttribute('aria-label', `Namit gid, ${text.toLowerCase()}`);
  };
  if (mock) showOpen(true);
  else fetch('/api/availability').then(r => r.json()).then(a => showOpen(a.available !== false)).catch(() => showOpen(false));

  // Previews and local copies stay out of search results.
  if (!isLive) {
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex';
    document.head.append(robots);
  }

  // ── Little life, after the intro ───────────────────────────────────────
  // Steam curls off a warm dish every few seconds while it's on screen;
  // notes flutter as they come into view.
  const lowEndDevice = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  if (!calm && 'IntersectionObserver' in window) {
    const warm = new Set();
    const steamIO = new IntersectionObserver(es => es.forEach(e => { e.isIntersecting ? warm.add(e.target) : warm.delete(e.target); }), { threshold: .4 });
    document.querySelectorAll('.dish').forEach(d => { if (d.querySelector('.steam')) steamIO.observe(d); });
    const puff = () => {
      if (!document.hidden && warm.size) {
        const list = [...warm], d = list[Math.floor(Math.random() * list.length)];
        d.classList.remove('puff'); void d.offsetWidth; d.classList.add('puff');
      }
      setTimeout(puff, 5000 + Math.random() * 3000);
    };
    setTimeout(puff, 4000);
    const noteIO = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('flutter'); setTimeout(() => e.target.classList.remove('flutter'), 700); noteIO.unobserve(e.target);
    }), { threshold: .6 });
    document.querySelectorAll('.note').forEach(n => noteIO.observe(n));
  }

  // ── Scroll entrances ────────────────────────────────────────────────────
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.remove('pre'); e.target.classList.add('in'); io.unobserve(e.target);
  }), { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.dish').forEach(n => calm ? n.classList.remove('pre') : io.observe(n));
  document.querySelectorAll('.board').forEach((n, i) => {
    if (calm) return;
    n.classList.add('pre'); n.style.animationDelay = (i % 4) * 90 + 'ms'; io.observe(n);
  });

  // ── The beach at dusk: the door on the sand ─────────────────────────────
  // All in fractions of the painting (1584 x 672). DOOR is the bottom-centre
  // of the door on the wet sand and its width. Wide screens crop the painting
  // like object-fit: cover around CROP_WIDE; tall ones show a band of its full
  // height, CROP_TALL's window across the screen, the door base at 70% down
  // and the door in the middle of the screen. The dawn intro is framed from
  // CROP_TALL.left (the island and its lighthouse in view) and walks along
  // the beach to the door once night has fallen (introPan()).
  const PAINT = 1584 / 672;
  const DOOR = { x: .41, y: .82, w: .05 };
  const CROP_WIDE = { cx: .47, keep: [.365, .715], cy: .66 };
  const CROP_TALL = { win: .35, left: .365, base: .70, below: .825 };
  const dusk = $('dusk');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function placeDusk() {
    const W = dusk.clientWidth, H = dusk.clientHeight, aspect = W / H;
    if (!W || !H) return; // inside, the beach isn't shown: placed again on the way out
    let w, x, y;
    const band = aspect < CROP_TALL.below;
    if (band) {
      w = W / CROP_TALL.win; x = clamp(W / 2 - DOOR.x * w, W - w, 0);
      y = CROP_TALL.base * H - DOOR.y * (w / PAINT);
    } else if (aspect <= PAINT) {
      // cover: the window shows win of the width; keep the door and island in it
      const win = aspect / PAINT;
      const L = clamp(clamp(CROP_WIDE.cx - win / 2, CROP_WIDE.keep[1] - win, CROP_WIDE.keep[0]), 0, 1 - win);
      w = H * PAINT; x = -L * w; y = 0;
    } else {
      // wider than the painting: full width, cropped top and bottom around y .66
      const vis = PAINT / aspect;
      w = W; x = 0; y = -clamp((CROP_WIDE.cy - vis / 2) / (1 - vis), 0, 1) * (w / PAINT - H);
    }
    const h = w / PAINT, px = n => n.toFixed(2) + 'px';
    // The same point of the painting stays in the middle of the screen
    // through a resize or a turn of the phone, as far as the new range
    // allows. The first placing is on the door view.
    const mid = pan === null || !geo.w ? null : (geo.W / 2 - pan) / geo.w;
    geo = { x, w, W, y, h };
    dusk.classList.toggle('band', band);
    const st = dusk.style;
    st.setProperty('--art-x0', px(x)); st.setProperty('--art-y', px(y));
    st.setProperty('--art-w', px(w)); st.setProperty('--art-h', px(h));
    st.setProperty('--door-y', px(y + DOOR.y * h));
    st.setProperty('--door-w', px(DOOR.w * w));
    const { min, max } = panRange(), on = max - min >= PAN_MIN;
    dusk.classList.toggle('pans', on);
    stopPan(); closeCard();
    markUnseen(on);
    writePan(mid === null || !on ? x : clamp(W / 2 - mid * w, min, max));
    placeItems();
  }

  // ── Walking along the beach ─────────────────────────────────────────────
  // Where the painting is wider than the screen, it pans sideways. pan is
  // the painting's left edge on the screen, in px; placeDusk()'s x is the
  // door view. --pan is how far that is from the door view (the art box
  // moves by translate, so a pan is a transform), and --art-x and --door-x
  // include it. Less than PAN_MIN to see and there is no pan at all.
  const PAN_MIN = 24;
  let pan = null, geo = { x: 0, w: 0, W: 0, y: 0, h: 0 };
  const panRange = () => ({ min: Math.min(0, geo.W - geo.w), max: 0 });
  const doorPan = () => geo.x;
  // where the intro is framed: a tall phone's old window, with the lighthouse
  // in it; anywhere else, the door view
  const introPan = () => dusk.classList.contains('band') ? clamp(-CROP_TALL.left * geo.w, geo.W - geo.w, 0) : geo.x;
  const canPan = () => { const r = panRange(); return r.max - r.min >= PAN_MIN; };
  function writePan(p) {
    pan = p;
    const st = dusk.style, px = n => n.toFixed(2) + 'px';
    st.setProperty('--pan', px(Math.round((p - geo.x) * 100) / 100 + 0)); // (+ 0: never "-0.00px")
    st.setProperty('--art-x', px(p));
    st.setProperty('--door-x', px(p + DOOR.x * geo.w));
    if (revealOn) revealInView(p);
  }
  // Past either end the painting gives less and less (a rubber band); rubber()
  // maps how far the finger has gone past the end to how far the painting
  // goes, unrubber() the other way.
  const RUB = .55;
  const rubber = raw => {
    const { min, max } = panRange(), W = geo.W || 1;
    const rub = d => (1 - 1 / (d * RUB / W + 1)) * W;
    return raw > max ? max + rub(raw - max) : raw < min ? min - rub(min - raw) : raw;
  };
  const unrubber = p => {
    const { min, max } = panRange(), W = geo.W || 1;
    const un = o => (W / RUB) * o / Math.max(1, W - o);
    return p > max ? max + un(p - max) : p < min ? min - un(min - p) : p;
  };

  // The painting in motion after a release: it glides on and slows down
  // (friction), or, past an end, a spring brings it back without a bounce.
  // One loop on GSAP's ticker; any new touch, wheel or key stops it.
  let glide = null, panEase = null, panGoal = null;
  let aim = null, wheelRaw = null, wheelIdle = 0;
  const FRICTION = 325, SPRING = .014; // ms; per ms
  function stopPan() {
    if (glide) { gsap.ticker.remove(glide); glide = null; }
    if (panEase) { panEase.kill(); panEase = null; }
    clearTimeout(wheelIdle); wheelIdle = 0; wheelRaw = null;
    dusk.classList.remove('panning');
  }
  function momentum(v) {
    stopPan();
    if (!window.gsap) return writePan(clamp(pan, panRange().min, panRange().max));
    // p glides in the finger's (unrubbered) space; past an end the painting
    // shows it through the same rubber band as a drag
    let p = unrubber(pan);
    dusk.classList.add('panning');
    glide = (time, dt) => {
      dt = Math.min(dt || 16, 25);
      const { min, max } = panRange(), o = p > max ? p - max : p < min ? p - min : 0;
      if (o) v += (-SPRING * SPRING * o - 2 * SPRING * v) * dt;
      else v *= Math.exp(-dt / FRICTION);
      p += v * dt;
      const o2 = p > max ? p - max : p < min ? p - min : 0;
      if (Math.abs(v) < .02 && Math.abs(o2) < .3) { writePan(clamp(p, min, max)); stopPan(); return; }
      writePan(rubber(p));
    };
    gsap.ticker.add(glide);
  }
  // To a place on the beach: at once, gliding from a speed (px/ms), or eased
  // there (at once when calm).
  function panTo(x, { instant = false, velocity } = {}) {
    stopPan();
    if (velocity !== undefined) { writePan(x); return momentum(velocity); }
    const { min, max } = panRange(), to = clamp(x, min, max);
    if (instant || calmNow() || !window.gsap) return writePan(to);
    const s = { p: pan };
    dusk.classList.add('panning'); panGoal = to;
    panEase = gsap.to(s, { p: to, duration: .55, ease: 'power3.out', onUpdate: () => writePan(s.p), onComplete: () => { panEase = null; dusk.classList.remove('panning'); } });
  }
  Object.assign(window, { panRange, doorPan, panTo });

  // At the beach and settled: not in the intro, not going in or stepping
  // out, and not in the tail of a gesture that just ended the intro (hold).
  function settledAtDoor() {
    return root.classList.contains('at-door') && !['hold', 'entering', 'leaving'].some(c => root.classList.contains(c));
  }

  // ── Four things on the sand ─────────────────────────────────────────────
  // Each .beach-spot is a point of the painting (--x, --y) with its item, a
  // label above it and, but for the sand, a card. They move with the pan; the
  // caption and the © line don't. Wherever the painting fills the screen the
  // caption is up in the sky (.dusk.sky), so only the © line is in the
  // sand's way; on a tall phone the caption sits in the night under the
  // painting, and the pickup lines are written on the sand at the foot of
  // the painting. An item that would pass under any of them at some pan is
  // lifted (--ly) just clear of them, never above its --top (default
  // ITEM_TOP, the wet sand by the water; the sand writing's is just under
  // the bangka). If that is not enough on a tall phone, or the name would
  // meet the pickup lines, the name goes up to the sky. On a tall phone an
  // item may sit elsewhere (--bx, --by, --btop), as the sand writing does.
  // Measured in the beach's own layout (offsets, not screen rects), so it
  // holds during the intro's moves too.
  const spots = [...document.querySelectorAll('.beach-spot')];
  const legalEl = document.querySelector('.dusk-legal'), nameEl = $('duskH'), pickEl = $('duskPickup');
  const spotVar = (sp, k) => {
    const b = dusk.classList.contains('band') && sp.style.getPropertyValue('--b' + k);
    return parseFloat(b || sp.style.getPropertyValue('--' + k));
  };
  const ITEM_TOP = .73, CLEAR = 8;
  const partsOf = sp => ({ btn: sp.querySelector('.beach-item'), tag: sp.querySelector('.beach-tag'), card: sp.querySelector('.beach-card'), art: sp.querySelector('.beach-item-art') });
  // How far an item and its label reach either side of the spot and above
  // it. The sand has no label (its words are painted), so its painted art
  // (the writing and the stick) counts instead.
  const reach = sp => {
    const { btn, tag, art } = partsOf(sp);
    if (tag) return { half: Math.max(btn.offsetWidth, tag.offsetWidth) / 2, up: btn.offsetHeight / 2 + 2 + tag.offsetHeight };
    return { half: Math.max(btn.offsetWidth, art ? art.offsetWidth : 0) / 2, up: Math.max(btn.offsetHeight / 2, art ? btn.offsetHeight / 2 - art.offsetTop : 0) };
  };
  function placeItems() {
    if (!geo.h || !spots.length) return;
    const { min, max } = panRange(), [p0, p1] = canPan() ? [min, max] : [pan, pan];
    const box = el => ({ l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight });
    // lifts every item clear of the © line (and the caption, when it is down
    // in the night); true if one would have to rise above its --top
    const band = dusk.classList.contains('band');
    const lift = () => {
      const obst = !band ? [box(legalEl)] : dusk.classList.contains('sky') ? [box(pickEl), box(legalEl)] : [box(nameEl), box(pickEl), box(legalEl)];
      let short = false;
      spots.forEach(sp => {
        const { btn } = partsOf(sp), fy0 = spotVar(sp, 'y');
        const top = spotVar(sp, 'top') || ITEM_TOP;
        const { half, up } = reach(sp), down = btn.offsetHeight / 2;
        const l = p0 + sp.offsetLeft - half, r = p1 + sp.offsetLeft + half;
        let fy = fy0;
        for (let k = 0; k < obst.length; k++) obst.forEach(o => {
          const ay = geo.y + fy * geo.h;
          if (r > o.l - CLEAR && l < o.r + CLEAR && ay + down > o.t - CLEAR && ay - up < o.b + CLEAR) fy = (o.t - CLEAR - down - geo.y) / geo.h;
        });
        if (fy < top) { short = true; fy = top; }
        if (fy < fy0) sp.style.setProperty('--ly', fy.toFixed(4)); else sp.style.removeProperty('--ly');
      });
      return short;
    };
    dusk.classList.toggle('sky', !band);
    const meet = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b + CLEAR && b.t < a.b + CLEAR;
    if ((lift() || (band && meet(box(nameEl), box(pickEl)))) && !dusk.classList.contains('sky')) { dusk.classList.add('sky'); lift(); }
  }

  // Where the beach pans, each item stays out of sight until it first comes
  // into view, walked to or already there when the visitor lands; then it
  // fades up into the light and stays for the visit. Those in view on
  // landing appear one after another once the door has been painted in (at
  // once after Skip, or when calm). Where the beach doesn't pan, or when
  // calm, they are all there with the door, as before. Reads no layout, so
  // it can run on every frame of a walk.
  const seenSpots = new Set();
  let revealOn = false;
  function revealSpot(sp) { seenSpots.add(sp); sp.classList.remove('unseen'); }
  function markUnseen(pans) {
    spots.forEach(sp => { if (!pans || calm || root.classList.contains('calm')) revealSpot(sp); else if (!seenSpots.has(sp)) sp.classList.add('unseen'); });
  }
  const inView = (sp, p) => { const a = p + spotVar(sp, 'x') * geo.w, r = geo.w * .03; return a + r > 0 && a - r < geo.W; };
  function revealInView(p) { spots.forEach(sp => { if (!seenSpots.has(sp) && inView(sp, p)) revealSpot(sp); }); }
  // on landing: those in view, left to right, .35 s apart (staggered), or at once
  function startReveal(staggered) {
    if (revealOn) return; revealOn = true;
    const now = spots.filter(sp => !seenSpots.has(sp) && inView(sp, pan));
    if (!staggered || calm || root.classList.contains('calm')) return revealInView(pan);
    now.forEach(sp => seenSpots.add(sp)); // (a walk meanwhile shows the rest)
    now.sort((a, b) => spotVar(a, 'x') - spotVar(b, 'x')).forEach((sp, i) => setTimeout(() => sp.classList.remove('unseen'), 250 + i * 350));
  }
  // The pan that shows a spot's item and label whole (the one it is at, or
  // heading to, if they already are).
  function spotPan(sp) {
    const cur = panEase ? panGoal : pan, { min, max } = panRange();
    const half = reach(sp).half + 16, a = cur + sp.offsetLeft;
    const to = a - half < 0 ? cur - (a - half) : a + half > geo.W ? cur - (a + half - geo.W) : cur;
    return clamp(to, min, max);
  }

  // A card opens beside its item: above the label if there is room under the
  // bar, else to the side with more room, and always on the screen at the pan
  // the beach is going to. One at a time; ×, Escape, a tap or focus anywhere
  // else, or panning closes it.
  let beachOpen = null;
  function placeCard(sp, card, goal) {
    const { btn, tag } = partsOf(sp), W = geo.W, H = dusk.clientHeight;
    card.style.setProperty('--cx', '0px'); card.style.setProperty('--cy', '0px');
    const cw = card.offsetWidth, ch = card.offsetHeight, s = btn.offsetHeight;
    const ax = goal + sp.offsetLeft, ay = geo.y + sp.offsetTop;
    const strip = $('previewStrip'), topLimit = $('bar').offsetHeight + (strip && !strip.hidden ? strip.offsetHeight : 0) + 8;
    let left = clamp(ax - cw / 2, 12, W - cw - 12), top = ay - s / 2 - 2 - (tag ? tag.offsetHeight : 0) - 10 - ch;
    if (top < topLimit) {
      const roomR = W - (ax + s / 2) - 12, roomL = ax - s / 2 - 12;
      left = clamp(roomR >= cw + 10 || roomR >= roomL ? ax + s / 2 + 10 : ax - s / 2 - 10 - cw, 12, W - cw - 12);
      top = clamp(ay - ch / 2, topLimit, H - ch - 8);
    }
    card.style.setProperty('--cx', (left - ax).toFixed(1) + 'px');
    card.style.setProperty('--cy', (top - ay).toFixed(1) + 'px');
  }
  function openCard(sp) {
    if (beachOpen === sp) return closeCard(true);
    closeCard();
    const { btn, card } = partsOf(sp);
    const goal = panReady() ? spotPan(sp) : pan;
    card.hidden = false; placeCard(sp, card, goal);
    sp.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    beachOpen = sp;
    if (Math.abs(goal - (panEase ? panGoal : pan)) > .5) panTo(goal);
    card.focus({ preventScroll: true });
  }
  function closeCard(refocus = false) {
    if (!beachOpen) return;
    const sp = beachOpen, { btn, card } = partsOf(sp);
    beachOpen = null;
    sp.classList.remove('open'); card.hidden = true; btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus({ preventScroll: true });
  }
  // A tap opens an item; a press that moves 8 px doesn't (it is a walk along
  // the beach), nor a touch or pen press that lasts 300 ms. Keyboard and
  // assistive-tech clicks have no press.
  let press = null;
  document.addEventListener('pointerdown', e => {
    const btn = e.target.closest && e.target.closest('.beach-item');
    press = btn && e.isPrimary ? { btn, id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, t: e.timeStamp, ok: false } : null;
    if (beachOpen && !beachOpen.contains(e.target)) closeCard();
  }, true);
  document.addEventListener('pointerup', e => {
    if (press && e.pointerId === press.id) press.ok = Math.hypot(e.clientX - press.x, e.clientY - press.y) < TAP_SLOP && (press.type === 'mouse' || e.timeStamp - press.t < 300);
  }, true);
  dusk.addEventListener('click', e => {
    const x = e.target.closest('.beach-card-x');
    if (x) return closeCard(true);
    const btn = e.target.closest('.beach-item');
    if (!btn) return;
    // only a press recorded on this item can veto it: assistive tech clicks with no press at all
    const tapped = !e.detail || !press || press.btn !== btn || press.ok;
    press = null;
    if (!tapped || !settledAtDoor()) return;
    hintOff();
    if (btn.dataset.item === 'sand') { closeCard(); openReview(); return; }
    openCard(btn.closest('.beach-spot'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && beachOpen) { e.preventDefault(); closeCard(true); }
  });
  document.addEventListener('focusin', e => { if (beachOpen && !beachOpen.contains(e.target)) closeCard(); });
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => placeItems());
    [nameEl, pickEl, legalEl, ...spots.map(sp => partsOf(sp).tag).filter(Boolean)].forEach(n => ro.observe(n));
  }

  // Now and then a firefly drifts over to an item on the screen, lingers,
  // and wanders off: a quiet hint that something is there.
  const flyEl = $('beachFly');
  let flyTl = null;
  function flyOff() { if (flyTl) { flyTl.kill(); flyTl = null; gsap.set(flyEl, { opacity: 0 }); spots.forEach(sp => sp.classList.remove('visited')); } }
  function flyVisit() {
    setTimeout(flyVisit, 9000 + Math.random() * 7000);
    if (!flyEl || !window.gsap || flyTl || calmNow() || lowEndDevice || document.hidden || beachOpen || !dusk.classList.contains('live')) return;
    if (!settledAtDoor()) return;
    const seen = spots.filter(sp => { const a = pan + sp.offsetLeft; return seenSpots.has(sp) && !sp.classList.contains('unseen') && a > 20 && a < geo.W - 20; });
    if (!seen.length) return;
    const sp = seen[Math.floor(Math.random() * seen.length)], side = Math.random() < .5 ? -1 : 1;
    const tx = sp.offsetLeft, ty = sp.offsetTop - partsOf(sp).btn.offsetHeight * .3;
    flyTl = gsap.timeline({ onComplete: () => { flyTl = null; } })
      .set(flyEl, { x: tx + side * (60 + Math.random() * 60), y: ty - 50 - Math.random() * 40, opacity: 0 })
      .to(flyEl, { opacity: .95, duration: .8, ease: 'sine.out' }, 0)
      .to(flyEl, { x: tx + side * 10, y: ty - 8, duration: 2.4, ease: 'sine.inOut' }, 0)
      .call(() => sp.classList.add('visited'), null, 2)
      .to(flyEl, { x: tx - side * 6, y: ty - 16, duration: 1.2, ease: 'sine.inOut' }, 2.4)
      .call(() => sp.classList.remove('visited'), null, 3.4)
      .to(flyEl, { x: tx - side * (70 + Math.random() * 50), y: ty - 90, duration: 2.6, ease: 'sine.in' }, 3.6)
      .to(flyEl, { opacity: 0, duration: 1.2, ease: 'sine.in' }, 5);
  }
  if (!calm) setTimeout(flyVisit, 6000);

  placeDusk();
  // ResizeObserver also catches the page's scrollbar coming or going
  if ('ResizeObserver' in window) new ResizeObserver(() => placeDusk()).observe(dusk);
  else addEventListener('resize', placeDusk);
  // The idle life runs only while the beach is on screen.
  if (!calm && 'IntersectionObserver' in window) {
    new IntersectionObserver(es => dusk.classList.toggle('live', es[0].isIntersecting)).observe(dusk);
  }

  // The beach pans only once you are at the door, settled: not in the
  // intro, not while going in or stepping out, and not for the tail of a
  // gesture that just ended the intro (html.hold).
  const panReady = () => settledAtDoor() && canPan();

  // Touch and mouse: the painting follows the finger 1:1 from the first
  // pixel (past the ends, the rubber band) and glides on at the finger's
  // speed when it lets go. A press that moves less than TAP_SLOP is still a
  // tap on whatever is under it (the door); one that moves more is a walk
  // and clicks nothing.
  const TAP_SLOP = 8;
  let walk = null, noClick = false;
  dusk.addEventListener('pointerdown', e => {
    if (walk || !e.isPrimary || e.button !== 0 || !panReady()) return;
    stopPan(); aim = null;
    walk = { id: e.pointerId, x0: e.clientX, raw0: unrubber(pan), moved: false, trail: [[e.timeStamp, e.clientX]] };
  });
  dusk.addEventListener('pointermove', e => {
    if (!walk || e.pointerId !== walk.id) return;
    if (!root.classList.contains('at-door')) { walk = null; return; } // the place changed under the finger
    if (e.pointerType === 'mouse' && !e.buttons) return endDrag(e); // let go outside the window
    const dx = e.clientX - walk.x0;
    if (!walk.moved && Math.abs(dx) >= TAP_SLOP) {
      walk.moved = true; hintOff(); closeCard();
      dusk.classList.add('panning');
      // only now, so a tap still lands on the door
      try { dusk.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
    }
    writePan(rubber(walk.raw0 + dx));
    walk.trail.push([e.timeStamp, e.clientX]);
    while (walk.trail.length > 2 && e.timeStamp - walk.trail[0][0] > 100) walk.trail.shift();
  });
  // The speed is the finger's over its last 100 ms; a finger that rested
  // before letting go has none, and the painting just settles.
  function endDrag(e) {
    if (!walk || e.pointerId !== walk.id) return;
    const t = walk.trail, a = t[0], b = t[t.length - 1];
    const v = e.type !== 'pointercancel' && e.timeStamp - b[0] < 60 && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
    if (walk.moved) { noClick = true; setTimeout(() => { noClick = false; }, 0); }
    walk = null;
    panTo(pan, { velocity: clamp(v, -6, 6) });
  }
  ['pointerup', 'pointercancel'].forEach(t => dusk.addEventListener(t, endDrag));
  dusk.addEventListener('click', e => { if (noClick) { e.preventDefault(); e.stopPropagation(); noClick = false; } }, true);
  // Images and text on the beach are never dragged or selected by a walk.
  dusk.addEventListener('dragstart', e => e.preventDefault());

  // The wheel. A trackpad's sideways scroll moves the painting 1:1 (the
  // trackpad brings its own glide), with the rubber band at the ends, which
  // springs back once the fingers stop. A mouse wheel (lines or pages, or a
  // big notch with no sideways part) glides the painting along, down being
  // further along the beach. A trackpad's up and down does nothing here:
  // only the door and Order go in.
  dusk.addEventListener('wheel', e => {
    if (!panReady()) return;
    const { deltaX: dx, deltaY: dy, deltaMode: m } = e, { min, max } = panRange();
    const unit = m === 1 ? 40 : m === 2 ? geo.W * .8 : 1;
    if (m !== 0 || (Math.abs(dy) >= 50 && !dx)) {
      e.preventDefault(); hintOff(); closeCard(); wheelRaw = null;
      aim = clamp((panEase && aim !== null ? aim : pan) - (Math.abs(dx) > Math.abs(dy) ? dx : dy) * unit, min, max);
      return panTo(aim);
    }
    if (!dx || Math.abs(dx) < Math.abs(dy)) return;
    e.preventDefault(); hintOff(); closeCard(); aim = null; // (and no swipe back through history)
    if (wheelRaw === null || glide || panEase) { stopPan(); wheelRaw = unrubber(pan); }
    wheelRaw -= dx;
    writePan(rubber(wheelRaw));
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => { wheelRaw = null; panTo(pan, { velocity: 0 }); }, 140);
  }, { passive: false });

  // ← and → walk a quarter of the screen each, eased; held down, they go on.
  addEventListener('keydown', e => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!panReady() || (e.target.closest && e.target.closest('input, textarea, select, dialog, [contenteditable]'))) return;
    e.preventDefault(); hintOff(); closeCard();
    const { min, max } = panRange();
    aim = clamp((panEase && aim !== null ? aim : pan) + (e.key === 'ArrowLeft' ? 1 : -1) * geo.W / 4, min, max);
    panTo(aim);
  });
  // Tabbing to something off the screen walks to it (an item with its
  // label, into full view). The browser may also have scrolled the beach's
  // boxes to show it; they never scroll.
  dusk.addEventListener('focusin', e => {
    [dusk, $('duskWipe'), $('duskStill')].forEach(n => { n.scrollLeft = 0; n.scrollTop = 0; });
    const spot = e.target.closest('.beach-spot');
    if (spot) revealSpot(spot);
    if (!panReady()) return;
    if (spot) { const to = spotPan(spot); if (Math.abs(to - (panEase ? panGoal : pan)) > .5) panTo(to); return; }
    const r = e.target.getBoundingClientRect();
    if (r.left < 0 || r.right > geo.W) panTo(pan + geo.W / 2 - (r.left + r.width / 2));
  });

  // The gesture hint: on landing at the beach where it pans, a soft
  // fingertip glides one way and back, twice, with a fading trail, starting
  // 1.2 s after the door has appeared, then fades. It stops for good, for
  // this visit, as soon as the visitor walks along the beach or taps
  // something (the door, an item, Open the Door). Never when calm.
  // For review it shows on every landing, the way the intro replays. To go
  // back to once per device: in landed(), also return when
  // localStorage.getItem('ng-seen-pan') === '1'; and in hintOff(), when seen,
  // also localStorage.setItem('ng-seen-pan', '1') (in a try, for private mode).
  const panHint = $('panHint');
  let hintT = 0, hintTl = null, panSeen = false;
  function hintOff(seen = true) {
    clearTimeout(hintT); hintT = 0;
    if (hintTl) { hintTl.kill(); hintTl = null; gsap.to(panHint, { opacity: 0, '--trail': 0, duration: .2, ease: 'sine.out' }); }
    if (seen) panSeen = true;
  }
  function landed(delay = 1200) {
    clearTimeout(hintT); hintT = 0;
    if (!panHint || hintTl || panSeen || !window.gsap || calmNow()) return;
    hintT = setTimeout(() => {
      hintT = 0;
      if (!panReady() || calmNow() || panSeen) return; // gone in: again on the way out
      const D = Math.round(Math.min(160, Math.max(70, innerWidth * .17)));
      gsap.set(panHint, { x: 0, opacity: 0, '--trail': 0, '--reach': D + 'px' });
      // one glide: from x0 to x1, the trail stretching out behind and drawing in as it slows
      const glide = (t, x1, side) => hintTl
        .to(panHint, { x: x1, duration: 1, ease: 'power2.inOut' }, t)
        .to(panHint, { '--trail': side, duration: .45, ease: 'sine.out' }, t + .05)
        .to(panHint, { '--trail': 0, duration: .5, ease: 'sine.in' }, t + .5);
      hintTl = gsap.timeline({ onComplete: () => { hintTl = null; } })
        .to(panHint, { opacity: .95, duration: .35, ease: 'sine.out' }, 0);
      glide(.2, -D, 1); glide(1.3, D * .35, -1); glide(2.4, -D * .65, 1); glide(3.5, 0, -1);
      hintTl.to(panHint, { opacity: 0, duration: .5, ease: 'sine.in' }, 4.3);
      window.__ngHint = hintTl; // for checks
    }, delay);
  }

  // ── Intro: a camera pulls back from the lighthouse at dawn, a bird and a
  // cloud pass the lens, and the beam writes the name. The pull-back lands
  // on the dusk painting's framing, and nightfall turns the dawn into the
  // painting, where the door waits (html.at-door) until the visitor goes on.
  // One GSAP timeline; transforms and opacity only.
  let tl = null, amb = null, done = false;

  // Ends the intro: the stage goes and the beach is the page's first screen.
  // settling: the timeline runs on to ease the painting's drift out.
  function endIntro(settling) {
    if (done) return false; done = true;
    if (amb) amb.kill();
    if (window.gsap) {
      gsap.ticker.remove(flyBirds);
      gsap.set(settling ? '#duskWipe' : ['#duskWipe', '#duskStill'], { clearProps: 'transform,willChange' });
    }
    root.classList.remove('intro');
    const st = $('stage'); if (st) st.remove();
    const sk = $('introSkip'); if (sk) sk.remove();
    return true;
  }
  // Ends the intro at the door, idle, and remembers that it has been seen.
  // Nightfall's own end calls it with settling = true and lets the timeline
  // run on for the last of the sign's swing and the drift; anything else
  // stops it there.
  function toDoor(settling) {
    settling = settling === true;
    if (!endIntro(settling)) return;
    if (tl && !settling) {
      tl.kill();
      if (window.gsap) {
        // the door back to the stylesheet: there at once, shut, with no wash
        gsap.set(['#doorPaint', '#door', '#doorSeam', '#doorLight'], { clearProps: 'all' });
        gsap.set('#doorSign', { clearProps: 'transform,transformOrigin,opacity,filter' });
      }
    }
    // on the door view (the intro's walk to the door may have been cut short)
    if (Math.abs(pan - doorPan()) > .5) writePan(doorPan());
    // (never both places: a door tap during the intro may have gone in already)
    if (!root.classList.contains('inside')) root.classList.add('at-door');
    // the items in view come into the light, one by one after the intro
    startReveal(settling);
    try { localStorage.setItem('ng-seen-intro', '1'); } catch (e) { /* private mode: the intro plays again */ }
    window.preloadKitchen();
    // the hint, 1.2 s after the door appeared (at the end of the intro, that
    // was WASH_END, .6 s before duskEnd; otherwise it appears now)
    landed(settling ? 600 : 1200);
  }
  // The two places: the beach (html.at-door) and the kitchen (html.inside).
  // You are always in exactly one, and the focus goes with you: to Leny's
  // greeting inside, to the door outside. push adds the step into the
  // kitchen to the browser's history, so #menu is in the URL and Back has
  // something to undo. pushedIn remembers that this page load added that
  // step, so stepping outside can be Back rather than a step of its own.
  let pushedIn = false;
  function setPlace(place, { push = false } = {}) {
    const inside = place === 'kitchen';
    closeCard();
    root.classList.toggle('inside', inside); root.classList.toggle('at-door', !inside);
    if (push) { history.pushState({ place: 'kitchen' }, '', '#menu'); pushedIn = true; }
    $(inside ? 'menuH' : 'door').focus({ preventScroll: true });
  }
  // Reduced motion or data saver, as the head script decided it (or as a
  // check sets it later on html): crossfades instead of camera moves.
  const calmNow = () => calm || root.classList.contains('calm');

  // ── Going in ──────────────────────────────────────────────────────────
  // The kitchen painting, decoded, so the page can swap to it under the
  // bloom. Starts with nightfall, or on landing at the door. Also fetches the
  // finer crop of the door's surroundings for the push in.
  // Under data saver, the rest of the kitchen waits until the visitor goes
  // in (going = true), and calm never fetches the crop (its entrance is a
  // crossfade, with no camera).
  let kitchenP = null, kitchenReady = false, kitchenAll = false;
  window.preloadKitchen = function preloadKitchen(going) {
    const img = document.querySelector('.k-wall');
    if (!kitchenP) kitchenP = (img && img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => { kitchenReady = true; });
    // the rest of the kitchen's pictures, decoded ahead too, so its first
    // paint after the swap is quick (the lazy ones wouldn't start loading
    // while the kitchen is hidden)
    if (!kitchenAll && (going === true || !navigator.connection?.saveData)) {
      kitchenAll = true;
      document.querySelectorAll('#kWorld img').forEach(i => { if (i !== img && i.decode) { i.loading = 'eager'; i.decode().catch(() => {}); } });
    }
    const crop = $('duskCrop');
    if (crop && !calmNow() && !crop.getAttribute('src')) crop.src = 'assets/img/dusk/beach-door-crop.webp';
    return kitchenP;
  };

  // Leny's greeting: two lines, each rising out of its own clip.
  const greet = $('menuH');
  greet.setAttribute('tabindex', '-1');
  const said = greet.textContent.match(/^(.*?\?)\s+(.*)$/);
  if (said) greet.replaceChildren(make('span', { class: 'line' }, [make('span', { text: said[1] })]), ' ',
    make('span', { class: 'line' }, [make('span', { text: said[2] })]));

  // The camera's push, as one move: it eases in, slows (never stops) for a
  // beat on Leny in the doorway, then speeds up through the opening. The
  // speed is drawn as keys (progress 0..1, relative speed), smoothed and
  // integrated into an ease.
  const PUSH_SPEED = [[0, 0], [.3, 1], [.5, .42], [.66, .42], [1, 3.2]];
  const pushEase = (() => {
    const N = 240, v = [], acc = [0], smooth = t => t * t * (3 - 2 * t);
    for (let i = 0; i <= N; i++) {
      const u = i / N, k = PUSH_SPEED.findIndex(([x]) => x >= u) || 1, [x0, s0] = PUSH_SPEED[k - 1], [x1, s1] = PUSH_SPEED[k];
      v.push(s0 + (s1 - s0) * smooth((u - x0) / (x1 - x0)));
    }
    for (let i = 1; i <= N; i++) acc.push(acc[i - 1] + (v[i - 1] + v[i]) / 2);
    return u => { const f = Math.min(N, Math.max(0, u * N)), i = Math.min(N - 1, Math.floor(f)); return (acc[i] + (acc[i + 1] - acc[i]) * (f - i)) / acc[N]; };
  })();

  // The camera on the doorway, shared by going in and stepping outside: the
  // beach is scaled about the middle of the doorway and panned to bring it
  // to the middle of the screen, until the opening is 1.35 screens tall.
  // cam.p drives the zoom (0 at rest, 1 in the doorway); cam.q, the pan,
  // brings the doorway to the middle. The warm light rides on the doorway.
  // Measured now, so the beach must be shown and at rest.
  function doorCamera() {
    const still = $('duskStill'), glow = $('bloomLight');
    const vw = innerWidth, vh = innerHeight;
    const dr = $('duskDoor').getBoundingClientRect(), sr = still.getBoundingClientRect();
    const O = { x: dr.left + dr.width / 2, y: dr.top + dr.height / 2 };
    const T = { x: vw / 2 - O.x, y: vh / 2 - O.y }, lnS = Math.log(Math.max(3, 1.35 * vh / dr.height));
    const cam = { p: 0, q: 0 };
    const setCam = () => {
      gsap.set(still, { scale: Math.exp(cam.p * lnS), x: T.x * cam.q, y: T.y * cam.q });
      gsap.set(glow, { x: O.x + T.x * cam.q, y: O.y + T.y * cam.q });
    };
    // No will-change here: Chrome keeps a will-change layer's raster at its
    // first scale, and the beach and the door would go soft as the push
    // nears 8x. Re-rastering as it scales costs nothing measurable here.
    gsap.set(still, { transformOrigin: `${O.x - sr.left}px ${O.y - sr.top}px` });
    gsap.set(glow, { xPercent: -50, yPercent: -50 });
    return { cam, setCam };
  }

  // Through the door into the kitchen. One timeline (__ngEnter): the door
  // gives a little, the camera pushes in while the door swings open on Leny
  // in the light, a beat on her, then on through the doorway into a warm
  // bloom; under the full bloom the page swaps to the kitchen, and the bloom
  // lifts on it with her greeting. A second call while it runs gets the same
  // promise; called while stepping outside, it waits for that to finish
  // first. Calm: the bloom just crossfades, no camera.
  let entering = null, finishEntering = null, leaving = null;
  function enterKitchen() {
    if (entering) return entering;
    if (leaving) return (entering = leaving.then(() => { entering = null; return enterKitchen(); }));
    // the beach stops where it is (a finger still down no longer walks it),
    // and the camera finds the door there. A door tap or Enter during the
    // intro ends it first (as Skip does), so the entrance starts from the
    // settled beach and the intro's own landing can't follow it in.
    if (!done) toDoor();
    stopPan(); hintOff(); closeCard(); flyOff(); walk = null;
    if (!window.gsap) { setPlace('kitchen', { push: true }); return Promise.resolve(); }
    const quiet = calmNow();
    window.preloadKitchen(true);
    const bar = $('bar'), menu = $('menu'), bloom = $('bloom'), glow = $('bloomLight');
    const still = $('duskStill'), leaf = $('doorLeaf'), leny = $('doorLeny'), light = $('doorLight');
    const seam = $('doorSeam'), caption = [...document.querySelectorAll('#duskH, #duskPickup, .dusk-legal')], crop = $('duskCrop');
    const boat = document.querySelector('.dusk-boat'), boatAside = dusk.classList.contains('band');
    const lines = greet.querySelectorAll('.line > span'), after = document.querySelectorAll('#menu .translation, #menu .sig');
    let swapped = false, over = false, tl;

    // Under the full bloom: put the beach back as it was, out of sight, for
    // stepping outside later, and swap to the kitchen (setPlace gives it the
    // focus and the step in history).
    const swap = () => {
      if (swapped) return; swapped = true;
      gsap.set([still, leaf, leny, light, seam, boat, ...caption], { clearProps: 'all' });
      if (crop) crop.hidden = true;
      root.classList.remove('entering');
      setPlace('kitchen', { push: true });
      // the greeting waits, out of sight, to rise as the light lifts
      if (!quiet) { gsap.set(lines, { yPercent: 105 }); gsap.set(after, { opacity: 0, y: 8 }); }
    };
    // A slow kitchen holds the bloom at its peak until the painting is in,
    // or for 4 s at most.
    const atPeak = () => {
      if (kitchenReady || swapped) return swap(); // (resuming passes the peak again)
      const playing = !tl.paused();
      if (playing) tl.pause('bloomPeak', true); // exactly on the peak, not a frame past it
      Promise.race([kitchenP, new Promise(r => setTimeout(r, 4000))]).then(() => { swap(); if (playing && !over) tl.resume(); });
    };

    entering = new Promise(resolve => {
      const finish = () => {
        if (over) return; over = true;
        swap();
        gsap.set([bloom, glow, menu, ...lines, ...after], { clearProps: 'all' });
        entering = finishEntering = null; resolve();
      };
      // Order (or a #menu link) while going in: stop here, in the kitchen,
      // with no bloom left over it.
      finishEntering = () => { tl.kill(); finish(); };
      tl = gsap.timeline({ onComplete: finish });
      window.__ngEnter = tl; // for frame-by-frame checks
      gsap.set(bloom, { autoAlpha: 0 });

      if (quiet) {
        // a plain crossfade through the warm light
        gsap.set(glow, { xPercent: -50, yPercent: -50, x: innerWidth / 2, y: innerHeight / 2, scale: 3 });
        tl.addLabel('push', 0)
          .to(bloom, { autoAlpha: 1, duration: .4, ease: 'sine.inOut' }, 0)
          .addLabel('bloomPeak', .4).call(atPeak, null, 'bloomPeak')
          .to(bloom, { autoAlpha: 0, duration: .4, ease: 'sine.inOut' }, .42)
          .addLabel('settled', .82);
        root.classList.add('entering');
        return;
      }

      // The idle light hands its opacity to GSAP as it is now.
      gsap.set(light, { opacity: getComputedStyle(light).opacity });
      root.classList.add('entering');
      // The finer painting of the door's surroundings, once it has decoded.
      if (crop && crop.getAttribute('src')) crop.decode().then(() => { if (!swapped) crop.hidden = false; }).catch(() => {});

      // The camera, from rest; the pan brings the doorway to the middle by
      // the beat on Leny, so the camera goes straight on through it.
      const { cam, setCam } = doorCamera(), vh = innerHeight;
      setCam(); gsap.set(glow, { scale: .3 });
      gsap.set(leaf, { rotationY: 0, transformOrigin: '0% 50%' });

      const PUSH = .1, PEAK = 1.65;
      tl.addLabel('push', PUSH)
        // anticipation: a hand on the door, it gives a little
        .to(leaf, { scale: .98, duration: .15, ease: 'power2.out' }, 0)
        .to(leaf, { scale: 1, duration: .5, ease: 'power2.out' }, .15)
        .to(caption, { opacity: 0, duration: .35, ease: 'sine.out' }, 0)
        .to(cam, { p: 1, duration: PEAK - PUSH, ease: pushEase, onUpdate: setCam }, PUSH)
        .to(cam, { q: 1, duration: 1.2, ease: 'power2.inOut', onUpdate: setCam }, PUSH)
        // the door swings open into the house, from shut, and Leny is there
        // in the light (the thin line at its seams gives way to the room)
        .to(leaf, { rotationY: 75, duration: .9, ease: 'power2.out' }, PUSH + .1)
        .to(seam, { opacity: 0, duration: .3, ease: 'sine.out' }, PUSH + .1)
        .to(light, { opacity: 1, duration: .6, ease: 'sine.out' }, PUSH + .1)
        .fromTo(leny, { opacity: 0 }, { opacity: 1, duration: .5, ease: 'sine.out' }, PUSH + .2)
        // then she steps aside to let you in, and the light fills the screen
        .to(leny, { xPercent: -42, duration: .55, ease: 'power2.inOut' }, 1.0)
        .to(glow, { scale: 6, duration: .5, ease: 'power2.in' }, PEAK - .5)
        .to(bloom, { autoAlpha: 1, duration: .45, ease: 'power2.in' }, PEAK - .45)
        .addLabel('bloomPeak', PEAK).call(atPeak, null, 'bloomPeak');
      // the bangka in front of the door (a tall phone) slides out of the way
      // as the camera nears it, so it never covers the doorway
      if (boatAside) tl.to(boat, { xPercent: 45, opacity: 0, duration: .75, ease: 'power2.in' }, PUSH);
      // The kitchen, under the lifting bloom, settles and Leny says hello.
      // The light holds a moment first: the kitchen's first paint after the
      // jump can take a frame or a few, and it happens here, unseen.
      const LIFT = PEAK + .3;
      gsap.set(menu, { transformOrigin: `50% ${(vh - bar.offsetHeight) / 2}px`, willChange: 'transform' });
      tl.to(bloom, { autoAlpha: 0, duration: .45, ease: 'power2.out' }, LIFT)
        .fromTo(menu, { scale: 1.03 }, { scale: 1, duration: .5, ease: 'power3.out', immediateRender: false }, LIFT - .1)
        .fromTo(lines, { yPercent: 105 }, { yPercent: 0, duration: .4, ease: 'expo.out', stagger: .06, immediateRender: false }, LIFT)
        .fromTo(after, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .3, ease: 'power2.out', stagger: .05, immediateRender: false }, LIFT + .1)
        .addLabel('settled', tl.duration());
    });
    return entering;
  }
  window.enterKitchen = enterKitchen;

  // ── Stepping outside ──────────────────────────────────────────────────
  // The entrance played backwards, as one timeline (__ngLeave): the warm
  // light rises over the kitchen; under it the page swaps back to the beach
  // and the camera starts where the push in ended, in the doorway with Leny
  // stepped aside. She steps back into the doorway, the door swings shut
  // in front of her, and the camera pulls out onto the beach, centred on the
  // door: quick out of the doorway, slow past Leny, easing to a stop. A
  // second call while it runs gets the same promise; called while going in,
  // it waits for the entrance to finish first. Calm: the bloom crossfades.
  const pullEase = u => 1 - pushEase(1 - u);
  function leaveKitchen() {
    if (leaving) return leaving;
    if (entering) return (leaving = entering.then(() => { leaving = null; return leaveKitchen(); }));
    if (!root.classList.contains('inside')) return Promise.resolve();
    if (!window.gsap) { setPlace('beach'); placeDusk(); panTo(doorPan(), { instant: true }); return Promise.resolve(); }
    const quiet = calmNow();
    window.preloadKitchen(); // (also fetches the finer crop of the door, after a load on #menu)
    const bar = $('bar'), menu = $('menu'), bloom = $('bloom'), glow = $('bloomLight');
    const still = $('duskStill'), leaf = $('doorLeaf'), leny = $('doorLeny'), light = $('doorLight');
    const caption = [...document.querySelectorAll('#duskH, #duskPickup, .dusk-legal')], crop = $('duskCrop'), seam = $('doorSeam');
    const boat = document.querySelector('.dusk-boat');
    const cam = { p: 1, q: 1 };
    let swapped = false, over = false, setCam = () => {};

    // Under the full bloom: the beach comes back, placed for this screen now
    // (not on the next frame) and on the door view, whatever the pan was;
    // the camera takes its place in the doorway. A sheet still open
    // inside is closed, so the beach never shows under one.
    const swap = () => {
      if (swapped) return; swapped = true;
      document.querySelectorAll('dialog[open]').forEach(d => d.close());
      gsap.set(menu, { clearProps: 'all' });
      setPlace('beach'); placeDusk(); panTo(doorPan(), { instant: true });
      if (quiet) return;
      const c = doorCamera();
      setCam = () => { c.cam.p = cam.p; c.cam.q = cam.q; c.setCam(); };
      setCam();
      if (crop && crop.getAttribute('src')) crop.decode().then(() => { if (!over) crop.hidden = false; }).catch(() => {});
    };

    leaving = new Promise(resolve => {
      const finish = () => {
        if (over) return; over = true;
        swap();
        gsap.set([bloom, glow, still, leaf, leny, light, seam, boat, ...caption], { clearProps: 'all' });
        if (crop) crop.hidden = true;
        root.classList.remove('leaving');
        leaving = null; resolve();
        landed();
      };
      const tl = gsap.timeline({ onComplete: finish });
      window.__ngLeave = tl; // for frame-by-frame checks
      // the door's light stops breathing so GSAP can fade it
      root.classList.add('leaving');
      gsap.set(bloom, { autoAlpha: 0 });

      if (quiet) {
        // a plain crossfade through the warm light
        gsap.set(glow, { xPercent: -50, yPercent: -50, x: innerWidth / 2, y: innerHeight / 2, scale: 3 });
        tl.to(bloom, { autoAlpha: 1, duration: .4, ease: 'sine.inOut' }, 0)
          .addLabel('bloomPeak', .4).call(swap, null, 'bloomPeak')
          .addLabel('closed', .4)
          .to(bloom, { autoAlpha: 0, duration: .4, ease: 'sine.inOut' }, .42)
          .addLabel('settled', .82);
        return;
      }

      // The beach waits, out of sight, as the push in left it: the door wide
      // open, Leny in the light and stepped aside, the caption gone. The
      // light fills the screen from the middle, where the doorway will be.
      const restLight = getComputedStyle(light).opacity;
      gsap.set(leaf, { rotationY: 75, transformOrigin: '0% 50%' });
      gsap.set(leny, { opacity: 1, xPercent: -42 });
      gsap.set(light, { opacity: 1 });
      gsap.set(caption, { opacity: 0 });
      gsap.set(seam, { opacity: 0 });
      gsap.set(glow, { xPercent: -50, yPercent: -50, x: innerWidth / 2, y: innerHeight / 2, scale: 6 });
      gsap.set(menu, { transformOrigin: `50% ${(innerHeight - bar.offsetHeight) / 2}px`, willChange: 'transform' });

      const PEAK = .3, CAM = 1.1, SETTLED = PEAK + CAM, moveCam = () => setCam();
      // the kitchen leans away a touch as the light rises over it
      tl.to(bloom, { autoAlpha: 1, duration: PEAK, ease: 'power2.in' }, 0)
        .to(menu, { scale: 1.03, duration: PEAK, ease: 'power2.in' }, 0)
        .addLabel('bloomPeak', PEAK).call(swap, null, 'bloomPeak')
        // the light lifts, drawing back into the doorway, as the camera pulls out
        .to(bloom, { autoAlpha: 0, duration: .45, ease: 'power2.out' }, PEAK + .05)
        .to(glow, { scale: .3, duration: .6, ease: 'power2.out' }, PEAK)
        .to(cam, { p: 0, duration: CAM, ease: pullEase, onUpdate: moveCam }, PEAK)
        .to(cam, { q: 0, duration: .9, ease: 'power2.inOut', onUpdate: moveCam }, SETTLED - .9)
        // Leny steps back into the doorway, and the door swings shut in front
        // of her; the light is a thin line at its seams again
        .to(leny, { xPercent: 0, duration: .5, ease: 'power2.inOut' }, PEAK + .05)
        .to(leaf, { rotationY: 0, duration: .6, ease: 'power2.inOut' }, PEAK + .35)
        .to(seam, { opacity: 1, duration: .35, ease: 'sine.out' }, PEAK + .85)
        .to(leny, { opacity: 0, duration: .35, ease: 'sine.in' }, PEAK + .55)
        .to(light, { opacity: restLight, duration: .5, ease: 'sine.inOut' }, PEAK + .45)
        .addLabel('closed', PEAK + .95)
        .to(caption, { opacity: 1, duration: .4, ease: 'sine.out' }, SETTLED - .4)
        .addLabel('settled', SETTLED);
      // the bangka in front of the door (a tall phone) waits out of the way
      // and slides back in as the camera leaves the doorway
      if (dusk.classList.contains('band')) {
        gsap.set(boat, { xPercent: 45, opacity: 0 });
        tl.to(boat, { xPercent: 0, opacity: 1, duration: .8, ease: 'power2.out' }, PEAK + .3);
      }
    });
    return leaving;
  }
  window.leaveKitchen = leaveKitchen;

  // A cumulus, painted once onto a canvas: soft puffs (a low row along the
  // base, a taller crown), then one gradient laid across the whole shape, lit
  // from below-right where the sun is. Painting once means the GPU only
  // scales a texture; nothing is redrawn while it moves.
  const CLOUD = {
    dawn: ['#FFD9B0', '#F4A882', '#9B8FB0', '#5D5A7E'],
    near: ['#FFE9D2', '#F8C4A2', '#C7B8CB', '#8E86A6'],
    far:  ['#F9CDA8', '#E9A58C', '#A99BB8', '#7C769A'],
  };
  function makeCloud(host, { l, t, w, kind = 'dawn', seed = 1, alpha = 1 }) {
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const AR = 1.7, dpr = Math.min(devicePixelRatio || 1, 2);
    const cssW = Math.max(40, host.clientWidth * w / 100), cssH = cssW / AR;
    const cv = document.createElement('canvas');
    cv.className = 'cloud';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    Object.assign(cv.style, { left: l + '%', top: t + '%', width: w + '%', opacity: alpha });
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    const puffs = [];
    for (let i = 0; i < 6; i++) puffs.push([.04 + i * .12 + rnd() * .03, rnd() * .05, .11 + rnd() * .04]);
    for (let i = 0; i < 3; i++) puffs.push([.18 + i * .2 + rnd() * .05, .08 + rnd() * .08, .14 + rnd() * .04]);
    puffs.push([.36 + rnd() * .08, .17 + rnd() * .04, .15 + rnd() * .03]);
    puffs.forEach(([cx, by, r]) => {
      const R = r * W, x = cx * W + R, y = H - by * W - R;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.78, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-in';
    const [hi, mid, body, shade] = CLOUD[kind];
    const lg = ctx.createRadialGradient(W * .7, H * 1.15, 0, W * .7, H * 1.15, W * .78);
    lg.addColorStop(0, hi); lg.addColorStop(.28, mid); lg.addColorStop(.6, body); lg.addColorStop(1, shade);
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    host.append(cv);
    return cv;
  }
  // The dawn's sea and sand are the painting's own, regraded to dawn
  // (tools/dawn-grade.js), laid on the painting's box (art) so that at
  // nightfall they become the painting's waves, pool and sand.
  // hz, shore: fractions of the painting's height. Returns the wave bands.
  function buildSea(lowEnd, sunPct, art, hz, shore) {
    const vw = innerWidth, seaH = art.height * (shore - hz);
    // Waves: the painting's brushwork in bands down the sea. Each band swells
    // toward the shore by scaling about the vanishing point on the horizon,
    // so strokes near the horizon are small and slow and those near the beach
    // larger and further apart. Two copies of a band (the second mirrored, so
    // its strokes differ) take turns, each fading in as it rolls in and out
    // as it reaches its next stroke. Low-end: fewer bands, one copy each.
    const waves = $('stWaves'), E = .06;
    const cuts = lowEnd ? [0, .3, .65, 1] : [0, .2, .45, .72, 1];
    const bands = [];
    for (let b = 0; b < cuts.length - 1; b++) {
      const f0 = Math.max(0, cuts[b] - E), f1 = cuts[b + 1] + (b === cuts.length - 2 ? .1 : E);
      const top = f0 * seaH, h = (f1 - f0) * seaH, depth = (b + 1) / (cuts.length - 1);
      const fade = `linear-gradient(${b ? 'transparent' : '#000'}, #000 ${b ? E / (f1 - f0) * 200 : 0}%, #000 ${100 - E / (f1 - f0) * 200}%, transparent)`;
      const copies = [];
      for (let c = 0; c < (lowEnd ? 1 : 2); c++) {
        const el = document.createElement('div');
        el.className = 'st-wave' + (c ? ' alt' : '');
        Object.assign(el.style, {
          left: (art.left + vw * .2) + 'px', top: top + 'px', width: art.width + 'px', height: h + 'px',
          backgroundSize: `${art.width}px ${seaH}px`, backgroundPosition: `0 ${-top}px`,
          transformOrigin: `${vw / 2 - art.left}px ${-top}px`, webkitMaskImage: fade, maskImage: fade,
        });
        waves.append(el); copies.push(el);
      }
      bands.push({ copies, period: 8.5 - depth * 4, k: .035, y: (1 + depth * 3) * seaH / 130 });
    }
    // The pool on the sand, on the painting's pool (x .2–.8, y .74–.85), and
    // the sand's texture under it. Built here so only the intro fetches them.
    const sand = $('stSand'), sandArt = new Image(), pool = new Image();
    sandArt.className = 'st-sand-art'; sandArt.alt = ''; sandArt.decoding = 'async';
    sandArt.src = 'assets/img/dusk/dawn-sand.webp?v=1';
    Object.assign(sandArt.style, { left: art.left + 'px', width: art.width + 'px', height: art.height * (1 - shore) + 'px' });
    pool.className = 'st-pool'; pool.id = 'stPool'; pool.alt = ''; pool.decoding = 'async';
    pool.src = 'assets/img/dusk/dawn-pool.webp?v=1';
    const poolBox = { left: art.left + art.width * .2 + 'px', top: art.height * (.74 - shore) + 'px', width: art.width * .6 + 'px', height: art.height * .11 + 'px' };
    Object.assign(pool.style, poolBox);
    sand.prepend(sandArt, pool);
    // On a slow connection the texture must not pop in after the sand has
    // slid up: each layer stays hidden until its image has decoded (and stays
    // hidden, over the plain sand and sea, if it never does). Nothing waits.
    const reveal = (img, els) => {
      gsap.set(els, { opacity: 0 });
      img.decode().then(() => gsap.to(els, { opacity: 1, duration: .5, ease: 'sine.out' }), () => {});
    };
    const waveImg = new Image(); waveImg.src = 'assets/img/dusk/dawn-waves.webp?v=1';
    reveal(waveImg, waves); reveal(sandArt, sandArt); reveal(pool, pool);
    if (!lowEnd) {
      // the swash's shimmer: light streaks in the pool as each wave runs in
      const shine = document.createElement('i');
      shine.className = 'st-shine'; shine.id = 'stShine';
      Object.assign(shine.style, poolBox);
      pool.after(shine);
    }
    if (lowEnd) return bands;
    // Glitter along the sun's path, wider as it comes closer.
    const g = $('stGlitter');
    for (let i = 0; i < 26; i++) {
      const depth = Math.pow(Math.random(), 1.6);
      const s = document.createElement('i');
      s.style.top = (1 + depth * 45) + '%';
      s.style.left = (sunPct + (Math.random() - .5) * (4 + depth * 22)) + '%';
      s.style.width = (3 + depth * 14) + 'px';
      g.append(s);
    }
    return bands;
  }

  // ── Birds: a jointed wing, not a bending line. Each wing has a shoulder and
  // a wrist; the downstroke is quick and the upstroke slow, the wing folds at
  // the wrist on the way up, the body bobs against the beat, and every few
  // beats the bird glides. Each bird keeps its own rhythm.
  const ease = t => t * t * (3 - 2 * t);
  function wingLift(p) {           // p: 0..1 through one beat -> +1 up .. -1 down
    return p < .38 ? 1 - 2 * ease(p / .38) : -1 + 2 * ease((p - .38) / .62);
  }
  function birdPath(cx, cy, s, t, bird) {
    // beats then a glide: e.g. 3 beats of .5 s, then .7 s held slightly raised
    const cycle = bird.beats * bird.beat + bird.glide, local = (t + bird.offset) % cycle;
    const gliding = local > bird.beats * bird.beat;
    const p = gliding ? 0 : (local % bird.beat) / bird.beat;
    const e = gliding ? .25 + .05 * Math.sin(t * 3) : wingLift(p);
    const upstroke = !gliding && p >= .38;
    const a1 = e * .62;                                   // shoulder angle
    const a2 = a1 - (upstroke ? .55 * (1 - Math.abs(e)) + .25 : .08); // wrist folds on the way up
    const bob = -e * 1.4 * s;
    const L1 = 17 * s, L2 = 24 * s, by = cy + bob;
    const side = k => {
      const sx = cx + 3.5 * s * k, sy = by - 1 * s;
      const wx = sx + k * L1 * Math.cos(a1), wy = sy - L1 * Math.sin(a1);
      const tx = wx + k * L2 * Math.cos(a2), ty = wy - L2 * Math.sin(a2);
      return { sx, sy, wx, wy, tx, ty };
    };
    const R = side(1), Lf = side(-1);
    const tail = `L${cx + 1.5 * s} ${by + 4 * s} L${cx} ${by + 6 * s} L${cx - 1.5 * s} ${by + 4 * s}`;
    return `M${cx} ${by - 2.2 * s} ` +
      `Q${(R.sx + R.wx) / 2} ${(R.sy + R.wy) / 2 - 2.5 * s} ${R.wx} ${R.wy} ` +
      `Q${(R.wx + R.tx) / 2} ${(R.wy + R.ty) / 2 - 1.5 * s} ${R.tx} ${R.ty} ` +
      `Q${R.wx + 1 * s} ${R.wy + 3.4 * s} ${cx + 3 * s} ${by + 2 * s} ` + tail +
      ` L${cx - 3 * s} ${by + 2 * s} ` +
      `Q${Lf.wx - 1 * s} ${Lf.wy + 3.4 * s} ${Lf.tx} ${Lf.ty} ` +
      `Q${(Lf.wx + Lf.tx) / 2} ${(Lf.wy + Lf.ty) / 2 - 1.5 * s} ${Lf.wx} ${Lf.wy} ` +
      `Q${(Lf.sx + Lf.wx) / 2} ${(Lf.sy + Lf.wy) / 2 - 2.5 * s} ${cx} ${by - 2.2 * s}Z`;
  }
  const FLOCK = [
    { el: 'stWing', cx: 50, cy: 24, s: 1, beats: 3, beat: .46, glide: .8, offset: 0 },
    { el: 'farA', cx: 30, cy: 22, s: .3, beats: 2, beat: .38, glide: 1.1, offset: .7 },
    { el: 'farB', cx: 66, cy: 12, s: .26, beats: 4, beat: .34, glide: .6, offset: 1.9 },
  ];
  function flyBirds(time) {
    FLOCK.forEach(b => { const el = $(b.el); if (el) el.setAttribute('d', birdPath(b.cx, b.cy, b.s, time, b)); });
  }

  async function playIntro() {
    if (!window.gsap) return toDoor();
    await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 900))]);
    if (done) return;

    const vw = innerWidth, vh = innerHeight, dpr = devicePixelRatio || 1;
    // A tall phone's dawn is framed with the lighthouse in view; the walk to
    // the door comes after nightfall (below). Before anything is measured.
    const startPan = introPan(), walkTo = doorPan();
    writePan(startPan);
    const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    if (lowEnd) root.classList.add('low-end');
    const stage = $('stage'), isle = $('stIsle'), word = $('stWord');
    const wipe = $('duskWipe'), still = $('duskStill'), sign = $('doorSign'), light = $('doorLight');

    // The match cut: at rest, the stage's island is exactly the dusk
    // painting's island (same art, same box), its sea starts at the
    // painting's horizon and its sand at the painting's waterline. The
    // camera's pull-back ends at rest, so the last frame of the dawn has the
    // painting's composition and nightfall only changes the time of day.
    // (.dusk-wipe and .dusk-still cancel out, so these rects are true.)
    const HORIZON = .558, SHORE = .74; // fractions of the painting's height
    const dr = $('duskIsle').getBoundingClientRect(), art = $('duskBeach').getBoundingClientRect();
    const iw0 = Math.min(vw * .9, vh * .72); // the island's old size, for the opening zoom
    const sunX = dr.left + dr.width * .71;   // behind the island, as before
    isle.style.setProperty('--iw', dr.width + 'px');
    isle.style.setProperty('--isle-x', dr.left + 'px');
    isle.style.setProperty('--isle-y', dr.top + 'px');
    stage.style.setProperty('--hz', (art.top + art.height * HORIZON) + 'px');
    stage.style.setProperty('--shore', (art.top + art.height * SHORE) + 'px');
    stage.style.setProperty('--sun-x', sunX + 'px');
    // The rest of the dawn comes to rest where the painting has the same
    // thing, so nightfall changes only the light: the bangka on the painting's
    // bangka (same art, same box), the frond on the crown of the near palm,
    // the far range on the headland, the clouds on the painting's clouds.
    // Boxes are fractions of the painting (x, y, width).
    const at = (fx, fy) => ({ x: art.left + art.width * fx, y: art.top + art.height * fy });
    const br = document.querySelector('.dusk-boat').getBoundingClientRect();
    Object.assign($('stBangka').style, { left: br.left + 'px', top: br.top + 'px', bottom: 'auto', width: br.width + 'px', clipPath: 'inset(0 0 22% 0)' });
    const crown = at(.02, .01);
    Object.assign($('stFrond').style, { left: crown.x + 'px', top: crown.y + 'px', right: 'auto', width: art.width * .34 + 'px' });
    const head = at(0, .49);
    Object.assign($('stRange').style, { left: head.x + 'px', top: head.y + 'px', width: art.width * .5 + 'px', height: art.height * (HORIZON - .49) + 'px' });

    // Build the scene, then read every measurement in one pass before writing.
    const bands = buildSea(lowEnd, (sunX + vw * .2) / (vw * 1.4) * 100, art, HORIZON, SHORE);
    const skyc = $('stSkyClouds');
    // A cloud of width fw centred on the painting's cloud at (fx, fy), as % of the stage.
    const cloudAt = (fx, fy, fw, o) => {
      const c = at(fx, fy), w = art.width * fw;
      return { l: (c.x - w / 2) / vw * 100, t: (c.y - w / 1.7 / 2) / vh * 100, w: w / vw * 100, ...o };
    };
    [cloudAt(.59, .3, .2, { seed: 2 }), cloudAt(.76, .17, .22, { seed: 5 }), cloudAt(.08, .44, .18, { seed: 9, kind: 'far', alpha: .8 }), cloudAt(.93, .27, .14, { seed: 4 })]
      .forEach(o => makeCloud(skyc, o));
    const near = makeCloud($('stNear'), { l: 0, t: 0, w: 120, seed: 11, kind: 'near' });
    // The cloud the camera passes ends on the small cloud just right of the palms.
    const nearEnd = at(.36, .43), nearScale = art.width * .12 / (vw * 1.2);
    const chars = [];
    [...word.childNodes].forEach(node => {
      const frag = document.createDocumentFragment();
      [...node.textContent].forEach(c => {
        const s = document.createElement('span'); s.className = 'ch'; s.textContent = c === ' ' ? ' ' : c;
        frag.append(s); if (c !== ' ') chars.push(s);
      });
      if (node.nodeType === 3) word.replaceChild(frag, node); else { node.textContent = ''; node.append(frag); }
    });

    // ── reads ──
    const ir = isle.getBoundingClientRect();
    const wW = word.offsetWidth, wH = word.offsetHeight;
    const FALL = wipe.offsetHeight; // the nightfall's travel: the screen plus its fade
    const w0 = innerWidth, h0 = innerHeight;

    // ── writes ──
    // The name sits in the sky well above the island, leaving the lamp clear.
    const wordTop = ir.top - wH - vh * .05, wordLeft = (vw - wW) / 2;
    gsap.set(word, { top: wordTop, left: wordLeft });
    const L = { x: ir.left + ir.width * .78, y: ir.top + ir.height * .047 };
    // Letter angles from the lamp, computed from the split before any transform.
    const letterRects = chars.map(c => c.getBoundingClientRect());
    gsap.set('#stBeam', { rotation: 185 });
    gsap.set('#stLampRef', { left: L.x + vw * .2 - vw * .0175 });

    // A new size or orientation mid-intro would break the match cut: go to the door.
    addEventListener('resize', () => { if (!done && (innerWidth !== w0 || Math.abs(innerHeight - h0) > 150)) toDoor(); });
    gsap.ticker.add(flyBirds);
    tl = gsap.timeline({ onComplete: toDoor, defaults: { ease: 'power2.out' } });
    window.__ngIntro = tl; // for frame-by-frame checks

    // The camera: every plane starts zoomed toward the lamp by its own depth,
    // so near things move more than far things, and pulls back to rest by
    // PULL_END. It eases in (power2.in) and hands over at T1, at the same
    // speed, to a long power3.out, so it is still drifting as nightfall begins
    // and never stops dead. The zoom is capped by what the island art can
    // resolve on this screen.
    const Zwant = (vw < 700 ? 2.8 : 2.3) * iw0 / ir.width;
    const Z = Math.max(1.6, Math.min(Zwant, 1680 * 1.6 / (ir.width * dpr)));
    const T1 = 2.4, PULL_END = 6.3, T2 = PULL_END - T1;
    const f = (3 / T2) / (2 / T1 + 3 / T2); // power2.in ends at 2x speed, power3.out starts at 3x
    const camera = (el, from, to) => {
      const mid = {};
      for (const k in to) mid[k] = from[k] + (to[k] - from[k]) * f;
      gsap.set(el, from);
      tl.to(el, { ...mid, duration: T1, ease: 'power2.in' }, 0)
        .to(el, { ...to, duration: T2, ease: 'power3.out' }, T1);
    };
    const REST = { scale: 1, x: 0, y: 0, rotation: 0 };
    const zoomed = d => ({ scale: 1 + (Z - 1) * d, x: (vw / 2 - L.x) * d, y: (vh * .42 - L.y) * d, rotation: -2.5 * Math.min(d, 1) });
    const planes = gsap.utils.toArray('#stage [data-depth]');
    planes.forEach(p => {
      const d = parseFloat(p.dataset.depth);
      const r = p.getBoundingClientRect();
      gsap.set(p, { transformOrigin: `${L.x - r.left}px ${L.y - r.top}px` });
      camera(p, zoomed(d), REST);
    });
    // The name rides with the island (depth 1), scaled about the lamp, so the
    // beam's angles to its letters hold while the camera is still moving;
    // the beam and the flare stay on the lamp.
    gsap.set(word, { transformOrigin: `${L.x - wordLeft}px ${L.y - wordTop}px` });
    camera(word, zoomed(1), REST);
    const z1 = zoomed(1);
    camera(['#stBeam', '#stFlare'], { x: L.x + z1.x, y: L.y + z1.y }, { x: L.x, y: L.y });
    requestAnimationFrame(() => planes.forEach(p => { p.style.willChange = 'transform'; }));
    tl.set(planes, { willChange: 'auto' }, PULL_END + .05);
    // The drift: one slow pull further back (2.5% of scale) and a little pan,
    // about the door, applied in lockstep to the dawn stage and to the
    // painting, from inside the pull-back until after nightfall. So the camera
    // never stops dead, the two pictures move as one while night comes down,
    // and it eases out on the door, at rest (the at-door layout).
    // Set after the planes are measured: it scales the whole stage.
    const DRIFT_AT = 3.9, DRIFT_END = 8.2;
    const drift = [stage, still];
    gsap.set(drift, { transformOrigin: `${art.left + art.width * DOOR.x}px ${art.top + art.height * DOOR.y}px`, willChange: 'transform' });
    tl.fromTo(drift, { scale: 1.025, xPercent: -1 }, { scale: 1, xPercent: 0, duration: DRIFT_END - DRIFT_AT, ease: 'sine.inOut' }, DRIFT_AT);

    const A0 = 185, A1 = 335, BEAM = 1.4;
    const angleOf = r => {
      const a = Math.atan2(r.top + r.height / 2 - L.y, r.left + r.width / 2 - L.x) * 180 / Math.PI;
      return a < 0 ? a + 360 : a;
    };

    // ── 0–4 s: dawn, while the camera pulls back ──
    tl.to('#stStars', { opacity: 0, duration: 2, ease: 'sine.inOut' }, .4)
      .to('#stDay', { opacity: 1, duration: 3.2, ease: 'sine.inOut' }, .3)
      .fromTo('#stSun', { opacity: 0, yPercent: 8 }, { opacity: 1, yPercent: 0, duration: 3.4, ease: 'sine.out' }, .5)
      .to('#stRays', { opacity: .75, duration: 2.6, ease: 'sine.inOut' }, 1.4)
      .to('#stHaze', { opacity: 1, duration: 2.4, ease: 'sine.inOut' }, 1.2)
      .to('#stPath', { opacity: 1, duration: 2.4, ease: 'sine.inOut' }, 1.2)
      .to('#stTint', { opacity: .3, duration: 3, ease: 'sine.inOut' }, .8)
      .to('#stRim', { opacity: .95, duration: 2.2, ease: 'sine.inOut' }, 1.6)
      .to('#stLampRef', { opacity: .25, duration: 2, ease: 'sine.inOut' }, 2.2)
      .fromTo('#stGlow', { scale: .7, opacity: 1 }, { scale: 1.15, duration: .9, ease: 'sine.inOut', repeat: 3, yoyo: true }, 0)
      .to('#stGlow', { opacity: .35, scale: .8, duration: .8 }, 3.2)
      .fromTo('#stSand', { yPercent: 35 }, { yPercent: 0, duration: 2.6, ease: 'power2.out' }, 1.2);

    // Ambient motion runs on its own clock so it doesn't stretch the intro.
    amb = gsap.timeline();
    amb.fromTo('#stFrond', { skewX: -1 }, { skewX: 1.5, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0);
    amb.to('#stBird', { x: '+=18', y: '-=6', duration: 7, ease: 'none' }, 2.4)
      .to(near, { x: '+=16', duration: 8, ease: 'none' }, 3.6);
    // The two distant birds flap and drift.
    amb.fromTo('#farA', { x: 0, y: 0 }, { x: 14, y: -3, duration: 9, ease: 'none' }, 0)
      .fromTo('#farB', { x: 0, y: 0 }, { x: 10, y: 2, duration: 9, ease: 'none' }, 0);
    // The swells roll in: phase p 0..1 through a band's period. Each copy
    // grows from 1 - k to 1 + k about the horizon while sinking by its y,
    // and fades in and out as sin²(πp), so the two copies, half a period
    // apart, always add up to one. Only the first copy is the painting's
    // strokes (the second is mirrored), and it matches them exactly at
    // p = .5, which each band's phase puts at PULL_END. Before nightfall
    // reaches the sea, settle (on the main timeline, so seeking holds)
    // eases every band to rest on that copy at full weight, so the dusk
    // comes down on the painting's own waves.
    const settle = { v: 0 };
    bands.forEach((b, i) => {
      const set = b.copies.map(el => ({ s: gsap.quickSetter(el, 'scaleY'), sx: gsap.quickSetter(el, 'scaleX'), y: gsap.quickSetter(el, 'y', 'px'), o: gsap.quickSetter(el, 'opacity') }));
      const ph = ((.5 - PULL_END / b.period) % 1 + 1) % 1, roll = { p: ph };
      amb.fromTo(roll, { p: ph }, { p: ph + 1, duration: b.period, ease: 'none', repeat: -1, onUpdate: () => set.forEach((q, c) => {
        if (lowEnd) { // one copy: a gentle swell in place, no fade
          const w = Math.sin(roll.p * Math.PI * 2) * (1 - settle.v);
          q.s(1 + b.k * .6 * w); q.sx(1 + b.k * .6 * w); q.y(b.y * .6 * w); return;
        }
        const p = (roll.p + c * .5) % 1, s = settle.v, u = (p * 2 - 1) * (1 - s), sc = 1 + b.k * u, o = Math.sin(Math.PI * p) ** 2;
        q.s(sc); q.sx(c ? -sc : sc); q.y(b.y * u); q.o(c ? o * (1 - s) : o + (1 - o) * s);
      }) }, 0);
    });
    // The shore: a broken foam edge runs up the sand and draws back, about
    // every 3 s; where it reached, the sand stays wet and darker, then dries.
    const R = Math.max(7, art.height * .018);
    gsap.set('#stWet', { y: R, opacity: 0 });
    const swash = gsap.timeline({ repeat: -1 });
    swash.fromTo(['#stWash', '#stLip'], { y: 0 }, { y: R, duration: 1.25, ease: 'power2.out' }, 0)
      .fromTo('#stLip', { opacity: .95 }, { opacity: .55, duration: 1.25, ease: 'sine.in' }, 0)
      .to('#stWet', { opacity: .85, duration: .3, ease: 'sine.out' }, 1)
      .to(['#stWash', '#stLip'], { y: 0, duration: 1.75, ease: 'sine.inOut' }, 1.25)
      .to('#stLip', { opacity: .95, duration: 1.75, ease: 'sine.inOut' }, 1.25)
      .to('#stWet', { opacity: 0, duration: 1.5, ease: 'sine.in' }, 1.4);
    if (!lowEnd) swash.fromTo('#stShine', { opacity: 0, y: -1 }, { opacity: .55, y: 1, duration: .6, ease: 'sine.out' }, .8)
      .to('#stShine', { opacity: 0, y: 2, duration: 1.2, ease: 'sine.in' }, 1.4);
    amb.add(swash, 1.6);
    if (!lowEnd) {
      amb.fromTo('#stSkyClouds .cloud', { x: -10 }, { x: 24, duration: 10, ease: 'none', stagger: .5 }, 0)
        .fromTo('#stRays', { rotation: -4 }, { rotation: 6, duration: 10, ease: 'none' }, 0);
      gsap.utils.toArray('#stGlitter i').forEach(s => {
        amb.to(s, { opacity: .9, duration: .25 + Math.random() * .3, yoyo: true, repeat: 5 + Math.floor(Math.random() * 6), repeatDelay: Math.random() * .6, ease: 'sine.inOut' }, 1.2 + Math.random() * 1.5);
      });
    }

    // The camera backs away past a bird: it fills the top-left of the frame at
    // first, then shrinks into the sky as we pull back and stays there,
    // flapping.
    tl.set('#stBird', { opacity: 1, x: vw * .02, y: vh * .08, scale: 6, rotation: 8 }, .6)
      .to('#stBird', { x: vw * .36, y: vh * .3, scale: .32, rotation: -2, duration: 1.7, ease: 'power3.out' }, .6);
    // Then past a cloud: its edges sweep in from the sides of the frame, and it
    // shrinks into an ordinary cloud in the sky, where it stays and drifts.
    gsap.set(near, { left: '50%', top: '40%', xPercent: -50, yPercent: -50, transformOrigin: '50% 50%', opacity: 0 });
    tl.fromTo(near, { scale: 3.6, opacity: 0, x: 0, y: 0 }, { opacity: .95, duration: .35, ease: 'sine.in', immediateRender: false }, 1.9)
      .to(near, { scale: nearScale, x: nearEnd.x - vw * .5, y: nearEnd.y - vh * .4, duration: 1.6, ease: 'power3.out' }, 1.9);

    // ── 3.6–5.7 s: the lamp flares, the beam writes the name ──
    const BEAM_AT = 3.8;
    tl.fromTo('#stFlare', { opacity: 0, scale: .2 }, { opacity: 1, scale: 1.5, duration: .35, ease: 'power3.out' }, 3.55)
      .to('#stFlare', { scale: .8, opacity: .9, duration: .5, ease: 'sine.inOut' }, 3.9)
      .to('#stBeam', { opacity: 1, duration: .2 }, BEAM_AT)
      .to('#stBeam', { rotation: A1, duration: BEAM, ease: 'sine.inOut' }, BEAM_AT)
      .to('#stBeam', { opacity: 0, duration: .35 }, BEAM_AT + BEAM - .25);
    chars.forEach((c, i) => {
      const p = Math.min(1, Math.max(0, (angleOf(letterRects[i]) - A0) / (A1 - A0)));
      const t = Math.acos(1 - 2 * p) / Math.PI; // invert sine.inOut: when the beam reaches this letter
      tl.fromTo(c, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .45, force3D: false }, BEAM_AT + t * BEAM);
    });

    // ── nightfall, PULL_END - .5 to + 1.8: a sunset, sped up ──
    // The sun sinks behind the sea and its light goes, while the dusk comes
    // down from the sky through a fade taller than the screen: the sky turns
    // first, then the sea, then the sand. .dusk-wipe moves down while
    // .dusk-still moves up by as much, so the painting holds still.
    const SET_AT = PULL_END - .5, FALL_AT = PULL_END - .3, FALL_T = 2.1, FALL_END = FALL_AT + FALL_T;
    // the waves come to rest on the painting's strokes before the dusk reaches the sea
    tl.fromTo(settle, { v: 0 }, { v: 1, duration: .8, ease: 'sine.inOut' }, SET_AT - .3);
    tl.addLabel('pullEnd', PULL_END)
      .call(() => window.preloadKitchen?.(), null, FALL_AT)
      .to('#stSun', { yPercent: 22, opacity: 0, duration: 1.6, ease: 'sine.in' }, SET_AT)
      .to(['#stRays', '#stPath', '#stLampRef'], { opacity: 0, duration: 1.2, ease: 'sine.inOut' }, SET_AT + .2)
      .fromTo(wipe, { y: -FALL }, { y: 0, duration: FALL_T, ease: 'sine.inOut' }, FALL_AT)
      .fromTo(still, { y: FALL }, { y: 0, duration: FALL_T, ease: 'sine.inOut' }, FALL_AT)
      // The light-written name fades with the daylight: it lives on the sign now.
      .to(word, { opacity: 0, duration: .9, ease: 'sine.in' }, FALL_AT);
    // A second after nightfall has finished the painting, the door is
    // painted in: a watercolour wash bleeds up from the sand to the top of
    // its frame, with a soft, uneven, grainy wet edge (a mask slid by
    // --wash: .door-paint in the stylesheet). It comes in shut. As the wash
    // reaches the sign, the sign settles with one small swing, and the thin
    // warm line of light at the door's seams and under it glows on, with the
    // soft light behind it. The door can be tapped once the wash is past its
    // middle.
    // On a tall phone, once night has fallen, the camera walks along the
    // beach to the door, so it stands in the middle of the screen, and the
    // door is painted in a second after the walk ends.
    const WALK_T = Math.abs(walkTo - startPan) > .5 ? 1.3 : 0;
    if (WALK_T) {
      const w = { p: startPan };
      tl.to(w, { p: walkTo, duration: WALK_T, ease: 'sine.inOut', onUpdate: () => writePan(w.p) }, FALL_END - .1);
    }
    const DOOR_AT = FALL_END + 1 + (WALK_T ? WALK_T - .4 : 0), WASH_T = 1.1, WASH_END = DOOR_AT + WASH_T, SIGN_AT = DOOR_AT + .8, GLOW_AT = WASH_END - .15;
    const paint = $('doorPaint'), seam = $('doorSeam'), doorBtn = $('door');
    gsap.set([seam, light], { opacity: 0 });
    tl.addLabel('doorAt', DOOR_AT)
      .fromTo(paint, { '--wash': '16%' }, { '--wash': '100%', duration: WASH_T, ease: 'power1.inOut', immediateRender: false }, DOOR_AT)
      .set(doorBtn, { visibility: 'visible', pointerEvents: 'auto' }, DOOR_AT + WASH_T * .5)
      .fromTo(sign, { rotation: 5 }, { rotation: 0, duration: 1.3, ease: 'elastic.out(1, .4)', immediateRender: false }, SIGN_AT)
      .addLabel('doorPainted', WASH_END)
      .to(seam, { opacity: 1, duration: .5, ease: 'sine.out' }, GLOW_AT)
      .to(light, { opacity: .5, duration: .7, ease: 'sine.inOut' }, GLOW_AT)
      // hand the door back to the stylesheet (the sign keeps its swing)
      .set([seam, light, doorBtn], { clearProps: 'opacity,visibility,pointerEvents' }, GLOW_AT + .75);
    const DOOR_END = GLOW_AT + .75;
    tl.addLabel('duskEnd', DOOR_END)
      .call(toDoor, [true], 'duskEnd')
      .set(still, { clearProps: 'transform,willChange' }, Math.max(DOOR_END, DRIFT_END));
  }

  // A scroll, swipe or key during the intro is the same as Skip: it lands at
  // the door and stops there. The rest of that gesture (a trackpad keeps
  // sending wheel events for a second or more) is held (html.hold), so it
  // doesn't carry on into anything at the door. After the intro a scroll
  // never changes place: only the door, Order and #menu links go in.
  const SCROLL_KEYS = ['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar'];
  // The intro ends on a key that scrolls, either way. Others (Tab, Shift…)
  // leave it playing, so the keyboard can reach Skip and Order.
  const NAV_KEYS = [...SCROLL_KEYS, 'ArrowUp', 'PageUp', 'Home'];
  let holdT = 0;
  const hold = () => {
    root.classList.add('hold'); clearTimeout(holdT);
    holdT = setTimeout(() => root.classList.remove('hold'), 450);
  };
  const onScrollIntent = e => {
    if (e.type === 'keydown' && (!NAV_KEYS.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey)) return;
    if (!done) { toDoor(); hold(); return; }
    if (root.classList.contains('hold')) hold();
  };
  ['wheel', 'touchmove', 'keydown'].forEach(ev => addEventListener(ev, onScrollIntent, { passive: true }));
  // Skip ends the intro on the beach, at the door.
  $('introSkip').addEventListener('click', toDoor);
  // Order, at the beach, plays the same entrance as the door. "Skip to the
  // menu" and any other link to #menu go straight in, with no animation.
  // Either one while going in just finishes the entrance, and inside they
  // only bring the focus back to Leny's greeting. While stepping outside,
  // they wait for the visitor to be out first.
  const goIn = ({ animate = false, push = true } = {}) => {
    if (leaving) { leaving.then(() => goIn({ animate, push })); return; }
    if (!done) toDoor();
    if (finishEntering) finishEntering();
    else if (!root.classList.contains('at-door')) setPlace('kitchen');
    else if (animate) enterKitchen();
    else setPlace('kitchen', { push });
  };
  document.querySelectorAll('a[href="#menu"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); // the link itself would add a second step to history
    goIn({ animate: a.classList.contains('bar-order') });
  }));
  // A change of URL to #menu (typed in, or Forward onto the kitchen) goes in
  // too. The URL already has its step in history, so nothing more is pushed.
  addEventListener('hashchange', () => { if (location.hash === '#menu') goIn({ push: false }); });
  // The door: a click, Enter or Space goes in.
  $('door').addEventListener('click', () => { hintOff(); enterKitchen(); });

  // Outside, in the bar inside. If this page load added the kitchen's step
  // to history (the visitor came in through the door), it is Back, so the
  // history stays one step deep and the popstate below walks them out.
  // Otherwise (opened on /#menu) the kitchen's URL becomes the beach's and
  // the walk out plays. Pressed while going in, it waits for the entrance.
  let backing = false;
  $('barOut').addEventListener('click', () => {
    (entering || Promise.resolve()).then(() => {
      if (!root.classList.contains('inside') || leaving || backing) return;
      if (history.state?.place === 'kitchen' && pushedIn) { backing = true; history.back(); }
      else { history.replaceState(null, '', location.pathname + location.search); leaveKitchen(); }
    });
  });
  // Back (the button, Android's gesture, iOS's edge swipe) from the kitchen
  // steps outside; Forward onto the kitchen's step goes straight back in.
  // A sheet open inside takes Back for itself first: Android's Back closes
  // the dialog without navigating, but iOS's edge swipe and a desktop's Back
  // do navigate, so then the sheet closes and the kitchen's step is put
  // back, and the visitor stays inside; the next Back steps outside.
  addEventListener('popstate', () => {
    backing = false;
    const toKitchen = history.state?.place === 'kitchen';
    const sheets = [...document.querySelectorAll('dialog[open]')];
    if (!toKitchen && sheets.length && root.classList.contains('inside') && !leaving) {
      sheets.forEach(d => d.close());
      history.pushState({ place: 'kitchen' }, '', location.pathname + location.search + '#menu'); pushedIn = true;
      return;
    }
    if (!toKitchen && (root.classList.contains('inside') || entering)) leaveKitchen();
    else if (toKitchen) (leaving || Promise.resolve()).then(() => {
      if (root.classList.contains('at-door') && !entering && history.state?.place === 'kitchen') setPlace('kitchen');
    });
  });
  // The name in the bar is not a way between the places, and adds no step
  // to history. Inside, it takes the kitchen room back to its top; at the
  // beach it does nothing.
  document.querySelector('.bar-brand').addEventListener('click', e => {
    e.preventDefault();
    if (root.classList.contains('inside')) $('menu').scrollTo({ top: 0, behavior: calmNow() ? 'auto' : 'smooth' });
  });

  // "Start a new order", from an old order's page: the order's address is
  // cleared (a preview keeps its ?mock) and the visitor goes into the
  // kitchen with no animation. Wherever the page was, that leaves one beach
  // step under exactly one kitchen step, so Back from there steps outside
  // once.
  function startOver() {
    const mockQ = new URLSearchParams(location.search).get('mock'), url = location.pathname + (mockQ ? '?mock=' + encodeURIComponent(mockQ) : '');
    (leaving || Promise.resolve()).then(() => {
      if (!done) toDoor();
      history.replaceState(null, '', url);
      setPlace('kitchen', { push: true });
    });
  }

  if (root.classList.contains('intro')) playIntro();
  else if (root.classList.contains('at-door')) toDoor();
  else { endIntro(); setPlace('kitchen'); } // opened on a link to #menu: straight into the kitchen
  // From the back/forward cache the page comes back as it was; a gesture
  // held as it left is let go.
  addEventListener('pageshow', e => { if (e.persisted) root.classList.remove('hold'); });
})();
