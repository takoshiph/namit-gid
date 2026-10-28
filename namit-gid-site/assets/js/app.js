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
        make('button', { type: 'button', class: 'btn btn-sea', text: 'Start a new order', onclick: () => { history.replaceState(null, '', location.pathname); sheet.close(); location.hash = 'menu'; } }));
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
    $('footReview').addEventListener('click', e => { e.preventDefault(); openReview(); });
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
  addEventListener('resize', where);
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
    window.scrollBy({ top: r.top - innerHeight * .12, behavior: calm ? 'auto' : 'smooth' });
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
  // Footer socials, only those that exist.
  { const c = S.contacts || {}, todo = document.querySelector('.foot .todo');
    const links = [['WhatsApp', c.whatsapp && 'https://wa.me/' + c.whatsapp], ['Facebook', c.facebook], ['Messenger', c.messenger], ['Instagram', c.instagram]].filter(x => x[1]);
    if (todo) { if (links.length) todo.replaceChildren(...links.flatMap(([t, u], i) => [i ? ' · ' : '', make('a', { href: u, target: '_blank', rel: 'noopener', text: t })])); else todo.remove(); } }

  // ── Open / closed: the lighthouse in the bar ────────────────────────────
  const showOpen = on => {
    const text = on ? 'Taking orders' : 'Closed for orders', st = $('barStatus');
    $('navLamp').classList.toggle('is-on', on);
    st.textContent = text; st.classList.toggle('closed', !on); st.classList.add('shown');
    document.querySelector('.bar-brand').setAttribute('aria-label', `Namit gid, ${text.toLowerCase()}, back to top`);
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
  // notes flutter as they come into view; the
  // footer's lighthouse and fireflies only run while the footer is visible.
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
    if (!lowEndDevice) {
      new IntersectionObserver(es => $('foot').classList.toggle('live', es[0].isIntersecting), { threshold: .25 }).observe($('foot'));
    }
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
  // height, CROP_TALL's window across the screen, the door base at 70% down.
  const PAINT = 1584 / 672;
  const DOOR = { x: .41, y: .82, w: .05 };
  const CROP_WIDE = { cx: .47, keep: [.365, .715], cy: .66 };
  const CROP_TALL = { win: .35, left: .365, base: .70, below: .825 };
  const dusk = $('dusk');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function placeDusk() {
    const W = dusk.clientWidth, H = dusk.clientHeight, aspect = W / H;
    let w, x, y;
    const band = aspect < CROP_TALL.below;
    if (band) {
      w = W / CROP_TALL.win; x = -CROP_TALL.left * w;
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
    dusk.classList.toggle('band', band);
    const st = dusk.style;
    st.setProperty('--art-x', px(x)); st.setProperty('--art-y', px(y));
    st.setProperty('--art-w', px(w)); st.setProperty('--art-h', px(h));
    st.setProperty('--door-x', px(x + DOOR.x * w)); st.setProperty('--door-y', px(y + DOOR.y * h));
    st.setProperty('--door-w', px(DOOR.w * w));
  }
  placeDusk();
  // ResizeObserver also catches the page's scrollbar coming or going
  if ('ResizeObserver' in window) new ResizeObserver(() => placeDusk()).observe(dusk);
  else addEventListener('resize', placeDusk);
  // The idle life runs only while the beach is on screen.
  if (!calm && 'IntersectionObserver' in window) {
    new IntersectionObserver(es => dusk.classList.toggle('live', es[0].isIntersecting)).observe(dusk);
  }

  // ── Intro: a camera pulls back from the lighthouse at dawn, a bird and a
  // cloud pass the lens, and the beam writes the name. The pull-back lands
  // on the dusk painting's framing, and a sunset wipe turns the dawn into the
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
  // The wipe's own end calls it with settling = true and lets the timeline
  // run on for the last of the sign's swing and the drift; anything else
  // stops it there.
  function toDoor(settling) {
    settling = settling === true;
    if (!endIntro(settling)) return;
    if (tl && !settling) {
      tl.kill();
      if (window.gsap) gsap.set('#doorSign', { clearProps: 'transform,filter' });
    }
    root.classList.add('at-door');
    try { localStorage.setItem('ng-seen-intro', '1'); } catch (e) { /* private mode: the intro plays again */ }
    window.preloadKitchen();
  }
  // Leaving the door without going through it (Order, #menu links). From
  // then on the page keeps its scrollbar, even back up at the door.
  const leaveDoor = () => { root.classList.remove('at-door'); root.classList.add('inside'); };

  // ── Going in ──────────────────────────────────────────────────────────
  // The kitchen painting, decoded, so the page can swap to it under the
  // bloom. Starts with the wipe, or on landing at the door. Also fetches the
  // finer crop of the door's surroundings for the push in.
  let kitchenP = null, kitchenReady = false;
  window.preloadKitchen = function preloadKitchen() {
    if (!kitchenP) {
      const img = document.querySelector('.k-wall');
      kitchenP = (img && img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => { kitchenReady = true; });
      // the rest of the kitchen's pictures, decoded ahead too, so its first
      // paint after the jump is quick
      document.querySelectorAll('#kWorld img').forEach(i => { if (i !== img && i.decode) i.decode().catch(() => {}); });
      const crop = $('duskCrop');
      if (crop && !crop.getAttribute('src')) crop.src = 'assets/img/dusk/beach-door-crop.webp';
    }
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

  // Through the door into the kitchen. One timeline (__ngEnter): the door
  // gives a little, the camera pushes in while the door swings open on Leny
  // in the light, a beat on her, then on through the doorway into a warm
  // bloom; under the full bloom the page moves to the kitchen, and the bloom
  // lifts on it with her greeting. A second call while it runs gets the same
  // promise. Calm: the bloom just crossfades, no camera.
  let entering = null;
  function enterKitchen() {
    if (entering) return entering;
    if (!window.gsap) { leaveDoor(); $('menu').scrollIntoView(); return Promise.resolve(); }
    window.preloadKitchen();
    const bar = $('bar'), menu = $('menu'), bloom = $('bloom'), glow = $('bloomLight');
    const still = $('duskStill'), leaf = $('doorLeaf'), leny = $('doorLeny'), light = $('doorLight');
    const hint = $('doorHint'), caption = document.querySelector('.dusk-caption'), crop = $('duskCrop');
    const lines = greet.querySelectorAll('.line > span'), after = document.querySelectorAll('#menu .translation, #menu .sig');
    let swapped = false, tl;

    // Under the full bloom: put the door back as it was (out of sight above,
    // for a visit back up), move to the kitchen and give it the focus. The
    // scrollbar comes back here too, where it can't be seen.
    const swap = () => {
      if (swapped) return; swapped = true;
      // (the caption stays faded: it would show through the bar above the
      // kitchen; it comes back with the door, at the top)
      gsap.set([still, leaf, leny, light, hint], { clearProps: 'all' });
      if (crop) crop.hidden = true;
      root.classList.remove('at-door', 'entering'); root.classList.add('inside');
      let top = 0; // the menu's place in the page, whatever its settle transform is doing
      for (let n = menu; n; n = n.offsetParent) top += n.offsetTop;
      scrollTo({ top: top - bar.offsetHeight, behavior: 'instant' });
      greet.focus({ preventScroll: true });
      // the greeting waits, out of sight, to rise as the light lifts
      if (!calm) { gsap.set(lines, { yPercent: 105 }); gsap.set(after, { opacity: 0, y: 8 }); }
    };
    // A slow kitchen holds the bloom at its peak until the painting is in,
    // or for 4 s at most.
    const atPeak = () => {
      if (kitchenReady || swapped) return swap(); // (resuming passes the peak again)
      const playing = !tl.paused();
      if (playing) tl.pause('bloomPeak', true); // exactly on the peak, not a frame past it
      Promise.race([kitchenP, new Promise(r => setTimeout(r, 4000))]).then(() => { swap(); if (playing) tl.resume(); });
    };

    entering = new Promise(resolve => {
      const finish = () => {
        swap();
        gsap.set([bloom, glow, menu, ...lines, ...after], { clearProps: 'all' });
        entering = null; resolve();
      };
      tl = gsap.timeline({ onComplete: finish });
      window.__ngEnter = tl; // for frame-by-frame checks
      gsap.set(bloom, { autoAlpha: 0 });

      if (calm) {
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

      // The idle light and hint hand their opacity to GSAP as they are now.
      gsap.set([light, hint], { opacity: (i, el) => getComputedStyle(el).opacity });
      root.classList.add('entering');
      // The finer painting of the door's surroundings, once it has decoded.
      if (crop && crop.getAttribute('src')) crop.decode().then(() => { if (!swapped) crop.hidden = false; }).catch(() => {});

      // The camera: scaled about the middle of the doorway, panning it to the
      // middle of the screen, until the opening is 1.35 screens tall.
      const vw = innerWidth, vh = innerHeight;
      const dr = $('duskDoor').getBoundingClientRect(), sr = still.getBoundingClientRect();
      const O = { x: dr.left + dr.width / 2, y: dr.top + dr.height / 2 };
      const T = { x: vw / 2 - O.x, y: vh / 2 - O.y }, lnS = Math.log(Math.max(3, 1.35 * vh / dr.height));
      // p drives the zoom; q, the pan, brings the doorway to the middle by
      // the beat on Leny, so the camera goes straight on through it.
      const cam = { p: 0, q: 0 };
      const setCam = () => {
        gsap.set(still, { scale: Math.exp(cam.p * lnS), x: T.x * cam.q, y: T.y * cam.q });
        gsap.set(glow, { x: O.x + T.x * cam.q, y: O.y + T.y * cam.q });
      };
      gsap.set(still, { transformOrigin: `${O.x - sr.left}px ${O.y - sr.top}px`, willChange: 'transform' });
      gsap.set(glow, { xPercent: -50, yPercent: -50, x: O.x, y: O.y, scale: .3 });
      gsap.set(leaf, { rotationY: 14, transformOrigin: '0% 50%' });

      const PUSH = .1, PEAK = 1.65;
      tl.addLabel('push', PUSH)
        // anticipation: a hand on the door, it gives a little
        .to(leaf, { scale: .98, duration: .15, ease: 'power2.out' }, 0)
        .to(leaf, { scale: 1, duration: .5, ease: 'power2.out' }, .15)
        .to([hint, caption], { opacity: 0, duration: .35, ease: 'sine.out' }, 0)
        .to(cam, { p: 1, duration: PEAK - PUSH, ease: pushEase, onUpdate: setCam }, PUSH)
        .to(cam, { q: 1, duration: 1.2, ease: 'power2.inOut', onUpdate: setCam }, PUSH)
        // the door swings open into the house, and Leny is there in the light
        .to(leaf, { rotationY: 75, duration: .9, ease: 'power2.out' }, PUSH + .1)
        .to(light, { opacity: 1, duration: .6, ease: 'sine.out' }, PUSH + .1)
        .fromTo(leny, { opacity: 0 }, { opacity: 1, duration: .5, ease: 'sine.out' }, PUSH + .2)
        // then she steps aside to let you in, and the light fills the screen
        .to(leny, { xPercent: -42, duration: .55, ease: 'power2.inOut' }, 1.0)
        .to(glow, { scale: 6, duration: .5, ease: 'power2.in' }, PEAK - .5)
        .to(bloom, { autoAlpha: 1, duration: .45, ease: 'power2.in' }, PEAK - .45)
        .addLabel('bloomPeak', PEAK).call(atPeak, null, 'bloomPeak');
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
  function buildSea(lowEnd, sunPct) {
    // Wave lines: closer together and fainter toward the horizon, each one
    // broken into strokes of different lengths so it reads as drawn.
    const waves = $('stWaves'), ns = 'http://www.w3.org/2000/svg';
    const rows = [[.03, .6, 1], [.07, .8, 1.2], [.13, 1, 1.5], [.22, 1.3, 1.9], [.35, 1.6, 2.4], [.52, 2, 3], [.74, 2.4, 3.6]];
    rows.forEach(([top, amp, w], i) => {
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 800 10'); svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.top = (top * 100) + '%'; svg.style.height = (6 + i * 3) + 'px';
      let d = 'M0 5';
      for (let x = 0; x < 800; x += 50) d += ` Q${x + 12.5} ${5 - amp * 2} ${x + 25} 5 T${x + 50} 5`;
      const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('stroke-width', w); p.setAttribute('vector-effect', 'non-scaling-stroke');
      p.setAttribute('stroke-dasharray', `${60 + i * 9} ${14 + i * 3} ${22 + i * 4} ${9 + i * 2}`);
      svg.append(p); waves.append(svg);
    });
    if (lowEnd) return;
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
    // The wipe reveals the beach where it sits at the top of the page.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    scrollTo(0, 0);

    const vw = innerWidth, vh = innerHeight, dpr = devicePixelRatio || 1;
    const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    if (lowEnd) root.classList.add('low-end');
    const stage = $('stage'), isle = $('stIsle'), word = $('stWord');
    const wipe = $('duskWipe'), still = $('duskStill'), sign = $('doorSign');

    // The match cut: at rest, the stage's island is exactly the dusk
    // painting's island (same art, same box), its sea starts at the
    // painting's horizon and its sand at the painting's waterline. The
    // camera's pull-back ends at rest, so the last frame of the dawn has the
    // painting's composition and the wipe only changes the time of day.
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

    // Build the scene, then read every measurement in one pass before writing.
    buildSea(lowEnd, (sunX + vw * .2) / (vw * 1.4) * 100);
    const skyc = $('stSkyClouds');
    [{ l: -10, t: 20, w: 52, seed: 2 }, { l: 56, t: 27, w: 40, seed: 5 }, { l: 24, t: 44, w: 24, seed: 9, kind: 'far', alpha: .8 }, { l: 70, t: 10, w: 30, seed: 4 }]
      .forEach(o => makeCloud(skyc, o));
    const near = makeCloud($('stNear'), { l: 0, t: 0, w: 120, seed: 11, kind: 'near' });
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
    const W = $('dusk').clientWidth, E = wipe.offsetWidth - W; // E: the brush edge's width
    const sr = sign.getBoundingClientRect();
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
    // speed, to a long power3.out, so it is still drifting as the wipe begins
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
    // painting, from inside the pull-back until after the wipe. So the camera
    // never stops dead, the two pictures move as one while the edge crosses,
    // and it eases out on the door, at rest (the at-door layout).
    // Set after the planes are measured: it scales the whole stage.
    const DRIFT_AT = 3.9, DRIFT_END = 8.2;
    const drift = [stage, still];
    gsap.set(drift, { transformOrigin: `${art.left + art.width * DOOR.x}px ${art.top + art.height * DOOR.y}px`, willChange: 'transform' });
    tl.fromTo(drift, { scale: 1.025, xPercent: -1 }, { scale: 1, xPercent: 0, duration: DRIFT_END - DRIFT_AT, ease: 'sine.inOut', clearProps: 'transform,willChange' }, DRIFT_AT);

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
      .fromTo('#stSand', { yPercent: 35 }, { yPercent: 0, duration: 2.6, ease: 'power2.out' }, 1.2)
      .fromTo(['#stWash', '#stLip'], { y: 30 }, { y: -2, duration: 1.2, ease: 'power2.out' }, 1.6)
      .to(['#stWash', '#stLip'], { y: 9, duration: 1.4, ease: 'sine.inOut' }, 2.8)
      .to('#stWet', { opacity: 1, duration: .9 }, 2.9);

    // Ambient motion runs on its own clock so it doesn't stretch the intro.
    amb = gsap.timeline();
    amb.fromTo('#stFrond', { skewX: -1 }, { skewX: 1.5, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0);
    amb.to('#stBird', { x: '+=18', y: '-=6', duration: 7, ease: 'none' }, 2.4)
      .to(near, { x: '+=16', duration: 8, ease: 'none' }, 3.6);
    // The two distant birds flap and drift.
    amb.fromTo('#farA', { x: 0, y: 0 }, { x: 14, y: -3, duration: 9, ease: 'none' }, 0)
      .fromTo('#farB', { x: 0, y: 0 }, { x: 10, y: 2, duration: 9, ease: 'none' }, 0);
    gsap.utils.toArray('#stWaves svg').forEach((s, i) => {
      amb.fromTo(s, { xPercent: 0 }, { xPercent: -6.25 * (i % 2 ? 1 : -1), duration: 9 - i * .6, ease: 'none' }, 0);
    });
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
      .to(near, { scale: .42, x: -vw * .22, y: -vh * .16, duration: 1.6, ease: 'power3.out' }, 1.9);

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

    // ── the sunset wipe, PULL_END - .3 to + 1.2 ──
    // .dusk-wipe brings the beach in from the left behind its brush edge while
    // .dusk-still moves back by as much, so the painting holds still and only
    // the edge (with the gold riding it) travels. The edge's middle is at
    // screen x = p (W + E) - E / 2, p the eased progress.
    const WIPE = 1.5, WIPE_AT = PULL_END - .3, WIPE_END = WIPE_AT + WIPE;
    const inOut = y => y < .5 ? Math.sqrt(y / 2) : 1 - Math.sqrt((1 - y) / 2); // invert power2.inOut
    const edgeAt = x => WIPE_AT + WIPE * inOut(Math.min(1, Math.max(0, (x + E / 2) / (W + E))));
    tl.addLabel('pullEnd', PULL_END)
      .call(() => window.preloadKitchen?.(), null, WIPE_AT)
      .fromTo(wipe, { x: -(W + E) }, { x: 0, duration: WIPE, ease: 'power2.inOut' }, WIPE_AT)
      .fromTo(still, { x: W + E }, { x: 0, duration: WIPE, ease: 'power2.inOut' }, WIPE_AT);
    // The light-written name fades as the edge reaches it: it lives on the sign now.
    const wordIn = edgeAt(wordLeft) - .2, wordOut = edgeAt(wordLeft + wW);
    tl.to(word, { opacity: 0, duration: Math.max(.3, wordOut - wordIn), ease: 'sine.in' }, wordIn);
    // As the edge passes the door, the sign takes the name with a brief glow,
    // and gives one swing, as if the sweep had brushed it, and settles.
    const signAt = edgeAt(sr.left + sr.width / 2);
    tl.fromTo(sign, { rotation: 7 }, { rotation: 0, duration: 1.2, ease: 'elastic.out(1, .4)' }, signAt)
      .fromTo(sign, { filter: 'brightness(1) drop-shadow(0 0 0px rgba(245, 195, 94, 0))' },
        { filter: 'brightness(1.3) drop-shadow(0 0 7px rgba(245, 195, 94, .95))', duration: .25, ease: 'sine.out', immediateRender: false }, signAt)
      .to(sign, { filter: 'brightness(1) drop-shadow(0 0 0px rgba(245, 195, 94, 0))', duration: .9, ease: 'sine.inOut', clearProps: 'filter' }, signAt + .25);
    tl.addLabel('wipeEnd', WIPE_END)
      .call(toDoor, [true], 'wipeEnd');
  }

  // A scroll, swipe or key during the intro is the same as Skip: it lands at
  // the door and stops there. The rest of that gesture (a trackpad keeps
  // sending wheel events for a second or more) is held, so it doesn't carry
  // on into the kitchen. At the door, scrolling on goes in through the door,
  // and the page itself doesn't scroll (nor while going in). Pinch zoom and
  // scrolling back up are left alone.
  const SCROLL_KEYS = ['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar'];
  let holdT = 0, touchY = null;
  const hold = () => {
    root.classList.add('hold'); clearTimeout(holdT);
    holdT = setTimeout(() => root.classList.remove('hold'), 450);
  };
  addEventListener('touchstart', e => { touchY = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
  const onScrollIntent = e => {
    if (!done) { toDoor(); hold(); return; }
    if (root.classList.contains('hold')) { hold(); return; }
    if (e.type === 'keydown' && (!SCROLL_KEYS.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey)) return;
    // Space is a scroll key only on the page itself or on the door
    if (e.type === 'keydown' && (e.key === ' ' || e.key === 'Spacebar') && !(e.target === document.body || e.target === root || e.target.id === 'door')) return;
    if (e.type === 'wheel' && e.ctrlKey) return;
    if (e.type === 'touchmove' && e.touches.length !== 1) return;
    if (entering) { if (e.cancelable) e.preventDefault(); return; }
    if (!root.classList.contains('at-door')) return;
    // Once inside (by the door, Order or a #menu link), back at the door a
    // scroll is just a scroll; the door itself still opens on a tap.
    if (root.classList.contains('inside')) return;
    if (e.cancelable) e.preventDefault();
    const down = e.type === 'wheel' ? e.deltaY > 0 : e.type === 'touchmove' ? touchY !== null && e.touches[0].clientY < touchY - 6 : true;
    if (down) enterKitchen();
  };
  ['wheel', 'touchmove', 'keydown'].forEach(ev => addEventListener(ev, onScrollIntent, { passive: false }));
  // Back up at the top after going in (or after Order), the door is there
  // again as it was, ajar, ready to tap. It doesn't replay anything.
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (done && !entering && y <= 0 && lastY > 0) {
      root.classList.add('at-door');
      if (window.gsap) gsap.to('.dusk-caption', { opacity: 1, duration: .6, ease: 'sine.out', clearProps: 'opacity' });
    } else if (y > 0 && !entering && root.classList.contains('inside')) root.classList.remove('at-door'); // scrolling on from the door
    lastY = y;
  }, { passive: true });
  // Skip ends the intro on the beach, at the door.
  $('introSkip').addEventListener('click', toDoor);
  // Order and "Skip to the menu" always go straight to the kitchen.
  const toKitchen = () => { if (!done) toDoor(); leaveDoor(); };
  document.querySelectorAll('a[href="#menu"]').forEach(a => a.addEventListener('click', toKitchen));
  // The door: a click, Enter or Space goes in.
  $('door').addEventListener('click', () => enterKitchen());

  if (root.classList.contains('intro')) playIntro();
  else if (root.classList.contains('at-door')) toDoor();
  else { endIntro(); leaveDoor(); $('menu').scrollIntoView(); } // opened on a link to #menu: straight into the kitchen
})();
