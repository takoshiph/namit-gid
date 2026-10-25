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
  // Placeholder reviews never reach the live site.
  const showReviews = S.reviews && (!S.reviews.placeholder || location.hostname !== 'namitgid.takoshi.ca');
  function dishQuote(d) {
    const q = showReviews && S.reviews.quotes && S.reviews.quotes[d.id];
    if (!q) return '';
    return make('figure', { class: 'dish-quote' }, [make('blockquote', { text: '“' + q.text + '”' }),
      make('figcaption', { text: q.name + (q.ordered ? ', ordered ' + q.ordered : '') })]);
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
    const COL = { Regular: '#f1dfb4', Matcha: '#97b366', Pistachio: '#c4c585' };
    const flav = make('div', { class: 'flavours' }, d.batch.flavours.map(f => {
      const b = make('button', { type: 'button', class: 'flavour' }, [make('i'), f]);
      b.firstChild.style.background = COL[f];
      b.addEventListener('click', () => { if (box.length < 4) { box.push(f); paint(); } });
      return b;
    }));
    function paint() {
      slots.replaceChildren(...[0, 1, 2, 3].map(i => {
        const f = box[i];
        const s = make('button', { type: 'button', class: 'slot', 'aria-label': f ? f + ', tap to empty' : 'Empty slot' });
        if (f) { s.dataset.f = f; s.addEventListener('click', () => { box.splice(i, 1); paint(); }); }
        return s;
      }));
      const left = 4 - box.length;
      note.textContent = left ? `Pick ${left} more` : 'Box full';
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
  // The board settles a little whenever the tray changes.
  let signSeen = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { signSeen = es[0].isIntersecting; }).observe($('signWrap'));
  function kickSign() {
    if (calm || !window.gsap || !signSeen) return;
    gsap.killTweensOf(plank, 'y');
    gsap.fromTo(plank, { y: -3 }, { y: 0, duration: .45, ease: 'back.out(3)' });
  }

  function add(line, fig) {
    const hit = tray.find(l => lineKey(l) === lineKey(line));
    if (hit) hit.qty += line.qty; else tray.push(line);
    save(); renderTray(true);
    kickSign();
    if (fig) fly(fig);
    const d = byId[line.id];
    say(`Added ${d.name}${line.size && d.sizes.length > 1 ? ', ' + line.size : ''}. ${count()} in your tray, ${money(total())}.`);
  }
  function change(line, by) {
    line.qty += by;
    const dm = byId[line.id] && byId[line.id].min;
    if (line.qty <= 0 || (dm && line.qty < dm)) tray = tray.filter(l => l !== line);
    save(); renderTray(false);
    kickSign();
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

  function openSheet(at) { viewing = null; step = at || 0; refreshSheet(); if (!sheet.open) sheet.showModal(); }
  function refreshSheet() {
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
  }
  function renderOrderPage() {
    const o = viewing, body = [];
    const lines = () => make('ul', { class: 'lines' }, String(o.dish || '').split(' · ').map(l => make('li', { class: 'line-item plain' }, [make('div', { class: 'nm', text: l })])));
    const sumsOf = () => make('div', { class: 'sums' }, [
      make('div', {}, [make('span', { text: 'Total' }), make('span', { class: 'big', text: money(o.total) })]),
      make('div', { class: 'small' }, [make('span', { text: 'Deposit (half)' }), make('span', { text: money(o.deposit) })]),
      make('div', { class: 'small' }, [make('span', { text: 'At pickup' }), make('span', { text: money(o.balance) })])]);
    const when = () => make('p', { class: 'small', text: 'Pickup ' + longDay(o.pickupDate) + ' at ' + o.pickupTime + ' · ' + S.pickup.address });
    const refresh = make('button', { type: 'button', class: 'btn btn-line', text: 'Check for my answer', onclick: () => loadOrderPage(o.id, o.t) });
    let title = 'Your request', at = 2;
    if (o.status === 'missing' || o.status === 'offline') {
      title = o.status === 'offline' ? 'Sandali lang' : 'Hmm, where is it?';
      body.push(make('p', { text: o.status === 'offline' ? 'I couldn’t reach my order book just now. Try again in a moment.' : 'I can’t find this request. Open the latest email or message I sent you about it.' }),
        ...(o.status === 'offline' ? [refresh] : []));
      $('sheetH').textContent = title; return $('sheetBody').replaceChildren(...body);
    }
    if (o.status === 'requested') {
      body.push(make('p', { text: `Salamat, ${o.name}! I got your request. I’ll reply within the hour.` }), lines(), sumsOf(), when(), refresh);
    } else if (o.status === 'accepted') {
      title = 'Send your deposit'; at = 3;
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
        make('span', { text: shot ? '✓ ' + shot.name + ' (tap to change)' : 'Add a screenshot of your e-Transfer (optional)' })]);
      const by = o.depositDeadline ? new Date(o.depositDeadline).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }) : null;
      body.push(make('p', { text: `Kaya ko! I can make it, ${o.name}.` }),
        make('div', { class: 'etr' }, [
          make('p', { class: 'etr-h', text: 'Send your ' + money(o.deposit) + ' deposit' }),
          make('p', { class: 'small', text: 'Half the total, by Interac e-Transfer' + (by ? ', by ' + by + '. After that the time is freed up.' : '.') }),
          row('To', o.depositEmail || S.deposit.email), row('Amount', money(o.deposit) + ' CAD', String(o.deposit)), row('Message', 'Namit Gid ' + o.name)]),
        up, sumsOf(), when(),
        make('button', { type: 'button', class: 'btn btn-sea', text: 'I’ve sent my deposit', onclick: depositSent }));
    } else if (o.status === 'verifying') {
      title = 'Checking your deposit'; at = 3;
      body.push(make('p', { text: `Salamat, ${o.name}! I’m checking my bank for your ${money(o.deposit)}. I’ll message you as soon as I see it.` }), lines(), sumsOf(), when(), refresh);
    } else if (o.status === 'confirmed' || o.status === 'ready') {
      title = 'Confirmed!'; at = 4;
      body.push(make('div', { class: 'receipt' }, [make('p', { class: 'stamp', text: 'Confirmed' }),
        make('p', { text: `You’re all set, ${o.name}! See you ${longDay(o.pickupDate)} at ${o.pickupTime}.` }),
        make('p', { class: 'small', text: money(o.balance) + ' left to pay at pickup · ' + S.pickup.address })]),
        lines(), calendarLink(o.pickupDate, o.pickupTime));
    } else if (o.status === 'declined') {
      title = 'About your request';
      body.push(make('p', { text: `Pasensya na, ${o.name}, I can’t make that time. I’ll message you to find another day. Nothing was charged.` }), lines());
    } else if (o.status === 'expired') {
      title = 'This request expired';
      body.push(make('p', { text: 'The deposit didn’t come in time, so I gave the pickup time to someone else. Nothing was charged. Order again anytime!' }),
        make('button', { type: 'button', class: 'btn btn-sea', text: 'Start a new order', onclick: () => { history.replaceState(null, '', location.pathname); sheet.close(); location.hash = 'menu'; } }));
    } else {
      body.push(make('p', { text: 'This order is ' + String(o.status).replace('_', ' ') + '.' }), lines());
    }
    $('sheetH').textContent = title;
    $('sheetBody').replaceChildren(progress(at), ...body);
  }
  async function depositSent() {
    const o = viewing, btn = [...$('sheetBody').querySelectorAll('button')].find(b => /sent my deposit/.test(b.textContent));
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      if (mock && o.id === 'demo') { await new Promise(r => setTimeout(r, 400)); viewing = { ...o, status: 'verifying' }; shot = null; return renderOrderPage(); }
      let screenshot = null;
      if (shot) {
        if (btn) btn.textContent = 'Uploading screenshot…';
        try {
          const fd = new FormData(); fd.append('file', shot);
          const upr = await (await fetch('/api/upload-deposit', { method: 'POST', body: fd })).json();
          if (upr.url) screenshot = upr.url;
        } catch (e) { /* send without it */ }
      }
      const r = await fetch('/api/deposit-sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: o.id, t: o.t, screenshot }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok || d.status) { viewing = { ...o, status: d.status || 'verifying' }; shot = null; return renderOrderPage(); }
      throw new Error('send');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'I’ve sent my deposit'; }
      flag('That didn’t go through. Try again in a moment, or message me on WhatsApp.');
    }
  }
  {
    const q = new URLSearchParams(location.search);
    if (q.get('order') && q.get('t')) setTimeout(() => loadOrderPage(q.get('order'), q.get('t')), 300);
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
  sheet.addEventListener('close', () => { if (openSpot === 'register') closeSpot(); });

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
  if (!mock) {
    fetch('/api/availability').then(r => r.json()).then(a => {
      if (a.available === false) $('navLamp').classList.remove('is-on');
    }).catch(() => $('navLamp').classList.remove('is-on'));
  }

  // Previews and local copies stay out of search results.
  if (!isLive) {
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex';
    document.head.append(robots);
  }

  // ── Little life, after the intro ───────────────────────────────────────
  // Steam curls off a warm dish every few seconds while it's on screen;
  // boards swing when touched; notes flutter as they come into view; the
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
    document.querySelectorAll('.board').forEach(b => b.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
    }));
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

  const plank = $('plank');

  // ── Intro: a camera pulls back from the lighthouse at dawn, a bird and a
  // cloud pass the lens, the beam writes the name, a shutter takes the photo
  // and the photo lands on the sign. One GSAP timeline; transforms, opacity
  // and one clip only. Afterwards the page waits for a scroll.
  const emblem = $('emblem');
  let tl = null, amb = null, done = false, revealed = false;

  function reveal() {
    if (revealed) return; revealed = true;
    root.classList.remove('held');
    const cue = $('scrollCue'); if (cue) cue.remove();
    if (calm || !window.gsap) return;
    // The first scroll only opens the page; it starts moving once the sign has risen.
    root.classList.add('revealing'); scrollTo(0, 0);
    setTimeout(() => root.classList.remove('revealing'), 900);
    // The sign glides up from the middle of the screen and the words follow it.
    gsap.to('#signWrap', { x: 0, y: 0, duration: .9, ease: 'power3.inOut', clearProps: 'transform' });
    gsap.fromTo('.hero h1 .line > span', { yPercent: 105 }, { yPercent: 0, duration: .9, delay: .35, ease: 'expo.out', stagger: .09, clearProps: 'transform' });
    gsap.fromTo('#heroCopy > *', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .7, delay: .3, ease: 'power2.out', stagger: .07, clearProps: 'all' });
  }

  function finish() {
    if (done) return; done = true;
    if (tl) tl.kill();
    if (amb) amb.kill();
    if (window.gsap) gsap.ticker.remove(flyBirds);
    root.classList.remove('intro', 'landing');
    const st = $('stage'); if (st) st.remove();
    const sk = $('introSkip'); if (sk) sk.remove();
    if (window.gsap) gsap.set([plank, emblem, '#lenyArms', '#shore', '#badge', '#badge .disc', '#badge .ring'], { clearProps: 'all' });
  }

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
  // The painted sign shows the same sky.
  makeCloud($('shoreClouds'), { l: 3, t: 10, w: 34, seed: 7 });
  makeCloud($('shoreClouds'), { l: 64, t: 4, w: 24, seed: 3, kind: 'far' });

  function buildSea(lowEnd) {
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
      s.style.left = (58.6 + (Math.random() - .5) * (4 + depth * 22)) + '%';
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
  let birdsFrozen = false, birdClock = 0;
  function flyBirds(time) {
    if (birdsFrozen) return;
    birdClock = time;
    FLOCK.forEach(b => { const el = $(b.el); if (el) el.setAttribute('d', birdPath(b.cx, b.cy, b.s, time, b)); });
  }

  async function playIntro() {
    if (!window.gsap) { finish(); return reveal(); }
    await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 900))]);
    if (done) return;

    const vw = innerWidth, vh = innerHeight, dpr = devicePixelRatio || 1;
    const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    if (lowEnd) root.classList.add('low-end');
    const isle = $('stIsle'), island = $('stIsland'), word = $('stWord');

    // Build the scene, then read every measurement in one pass before writing.
    buildSea(lowEnd);
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
    const sr = $('signWrap').getBoundingClientRect();
    const ir = isle.getBoundingClientRect();
    const wW = word.offsetWidth, wH = word.offsetHeight;
    const hold = Math.max(0, vh * .47 - (sr.top - sr.width * .3 + sr.bottom) / 2);
    const holdX = vw / 2 - (sr.left + sr.width / 2);
    const frame0 = $('frameSlot').getBoundingClientRect();
    const tIsland0 = $('island').getBoundingClientRect(), tWord0 = $('wordmark').getBoundingClientRect();

    // ── writes ──
    // Until the visitor scrolls, the sign waits in the middle of the screen.
    gsap.set('#signWrap', { x: holdX, y: hold });
    const shift = r => ({ left: r.left + holdX, top: r.top + hold, width: r.width, height: r.height, right: r.right + holdX, bottom: r.bottom + hold });
    const frame = shift(frame0), tIsland = shift(tIsland0), tWord = shift(tWord0);
    // The name sits in the sky well above the island, leaving the lamp clear.
    const wordTop = ir.top - wH - vh * .05;
    gsap.set(word, { top: wordTop, left: (vw - wW) / 2 });
    const L = { x: ir.left + ir.width * .78, y: ir.top + ir.height * .047 };
    const cIsle = ir, cWord = { left: (vw - wW) / 2, top: wordTop, width: wW, height: wH };
    // Letter angles from the lamp, computed from the split before any transform.
    const letterRects = chars.map(c => c.getBoundingClientRect());
    gsap.set('#stBeam', { x: L.x, y: L.y, rotation: 185 });
    gsap.set('#stFlare', { x: L.x, y: L.y });
    gsap.set('#stLampRef', { left: L.x + vw * .2 - vw * .0175 });

    // The photo: the frame's shape, around the island and the name.
    // The photo holds the whole group; its shape need not match the frame.
    const gTop = cWord.top - 14, gBot = ir.bottom + ir.height * .18;
    const pw = Math.min(vw - 16, (gBot - gTop) * 1.9), ph = Math.max(gBot - gTop, pw / 1.9);
    const photo = { left: (vw - pw) / 2, top: (gTop + gBot) / 2 - ph / 2, width: pw, height: ph };
    const inset = r => `inset(${r.top}px ${vw - r.left - r.width}px ${vh - r.top - r.height}px ${r.left}px round 3px)`;
    gsap.set('#stFinder', { x: photo.left, y: photo.top, width: photo.width, height: photo.height });

    // The camera: every plane starts zoomed toward the lamp by its own depth,
    // so near things move more than far things. The zoom is capped by what
    // the island art can resolve on this screen.
    const Zwant = vw < 700 ? 2.8 : 2.3;
    const Z = Math.max(1.6, Math.min(Zwant, 1680 * 1.6 / (ir.width * dpr)));
    const planes = gsap.utils.toArray('#stage [data-depth]');
    planes.forEach(p => {
      const d = parseFloat(p.dataset.depth);
      const r = p.getBoundingClientRect();
      gsap.set(p, { transformOrigin: `${L.x - r.left}px ${L.y - r.top}px`, scale: 1 + (Z - 1) * d, x: (vw / 2 - L.x) * d, y: (vh * .42 - L.y) * d, rotation: -2.5 * Math.min(d, 1) });
    });
    requestAnimationFrame(() => planes.forEach(p => { p.style.willChange = 'transform'; }));

    const A0 = 185, A1 = 335, BEAM = 1.4;
    const angleOf = r => {
      const a = Math.atan2(r.top + r.height / 2 - L.y, r.left + r.width / 2 - L.x) * 180 / Math.PI;
      return a < 0 ? a + 360 : a;
    };

    gsap.ticker.add(flyBirds);
    tl = gsap.timeline({ onComplete: () => { finish(); root.classList.add('held'); }, defaults: { ease: 'power2.out' } });
    window.__ngIntro = tl; // for frame-by-frame checks

    // ── 0–3.9 s: dawn, and the pull-back ──
    const PULL = 3.9;
    tl.to(planes, { scale: 1, x: 0, y: 0, rotation: 0, duration: PULL, ease: 'power3.inOut' }, 0)
      .set(planes, { willChange: 'auto' }, PULL + .05)
      .to('#stStars', { opacity: 0, duration: 2, ease: 'sine.inOut' }, .4)
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
    // The two distant birds flap and drift; they freeze when the shutter fires.
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
    // flapping, until the shutter freezes it.
    tl.set('#stBird', { opacity: 1, x: vw * .02, y: vh * .08, scale: 6, rotation: 8 }, .6)
      .to('#stBird', { x: vw * .36, y: vh * .3, scale: .32, rotation: -2, duration: 1.7, ease: 'power3.out' }, .6);
    // Then past a cloud: its edges sweep in from the sides of the frame, and it
    // shrinks into an ordinary cloud in the sky, where it stays and drifts.
    gsap.set(near, { left: '50%', top: '40%', xPercent: -50, yPercent: -50, transformOrigin: '50% 50%', opacity: 0 });
    tl.fromTo(near, { scale: 3.6, opacity: 0, x: 0, y: 0 }, { opacity: .95, duration: .35, ease: 'sine.in', immediateRender: false }, 1.9)
      .to(near, { scale: .42, x: -vw * .22, y: -vh * .16, duration: 1.6, ease: 'power3.out' }, 1.9);

    // ── 3.7–5.3 s: the lamp flares, the beam writes the name ──
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

    // ── the viewfinder, then the shutter ──
    const SHOT = BEAM_AT + BEAM + .55;
    tl.fromTo('#stFinder', { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: .35, ease: 'power2.out', immediateRender: false }, SHOT - .5)
      .set(['#bladeTop', '#bladeBot', '#stFlash'], { display: 'block' }, SHOT - .1)
      .to(['#bladeTop', '#bladeBot'], { scaleY: 1, duration: .09, ease: 'power2.in' }, SHOT)
      .add(() => { root.classList.add('landing'); amb.pause(); birdsFrozen = true; }, SHOT)
      .set('#stage', { clipPath: inset(photo) }, SHOT + .09)
      .set(['#stSand', '#stFinder', '#stFlare', '#stBangka'], { opacity: 0 }, SHOT + .09)
      .to(['#bladeTop', '#bladeBot'], { scaleY: 0, duration: .14, ease: 'power2.out' }, SHOT + .1)
      .fromTo('#stFlash', { opacity: .85 }, { opacity: 0, duration: .45, ease: 'power2.out', immediateRender: false }, SHOT + .1);

    // ── the photo flies onto the sign ──
    const FLY = SHOT + .45, fly = { duration: 1.15, ease: 'power3.inOut' };
    // the photo lands on the picture and the name on the wood above it
    const lt = Math.min(frame.top, tWord.top) - 6, ll = Math.min(frame.left, tWord.left) - 6;
    const landing = { left: ll, top: lt, width: Math.max(frame.left + frame.width, tWord.left + tWord.width) + 6 - ll, height: frame.top + frame.height - lt };
    tl.fromTo('#stage', { clipPath: inset(photo) }, { clipPath: inset(landing), ...fly, immediateRender: false }, FLY)
      // as it lands, the light-written name darkens into the wood like a burn
      .to(['#stWord', '#stWord span'], { color: '#3B2212', textShadow: '0 0 5px rgba(110,55,18,.45)', duration: fly.duration, ease: 'power2.in' }, FLY)
      .set([isle, word], { willChange: 'transform' }, FLY - .05)
      .fromTo(isle, { x: 0, y: 0, scale: 1 }, { x: tIsland.left - cIsle.left, y: tIsland.top - cIsle.top, scale: tIsland.width / cIsle.width, transformOrigin: '0 0', ...fly, immediateRender: false }, FLY)
      .fromTo(word, { x: 0, y: 0, scale: 1 }, { x: tWord.left - cWord.left, y: tWord.top - cWord.top, scale: tWord.width / cWord.width, transformOrigin: '0 0', ...fly, immediateRender: false }, FLY)
      .to(['#stSun', '#stFrond'], { opacity: .5, duration: fly.duration }, FLY)
      .fromTo(plank, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: .5, immediateRender: false }, FLY + .7);

    // ── the board takes the photo and settles; Leny rises ──
    const LAND = FLY + 1.2;
    tl.set('#shore', { opacity: 1 }, LAND)
      .to('#stage', { opacity: 0, duration: .25 }, LAND)
      .fromTo(plank, { y: -6 }, { y: 0, duration: .5, ease: 'back.out(2.5)', immediateRender: false }, LAND)
      .set('#badge', { opacity: 1 }, LAND)
      .fromTo('#badge .disc', { scale: .6, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: .7, ease: 'back.out(1.6)', immediateRender: false }, LAND + .05)
      .fromTo('#badge .ring', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: .8, ease: 'power2.inOut', stagger: .12, immediateRender: false }, LAND + .15)
      // Leny rises from behind the board
      .fromTo(emblem, { opacity: 0, yPercent: 70 }, { opacity: 1, yPercent: 0, duration: 1.1, ease: 'expo.out', immediateRender: false }, LAND + .35)
      // once she has risen, her arms come forward over the rail
      .set('#lenyArms', { opacity: 1 }, LAND + 1.3);
  }

  // A scroll, swipe or key shows the page; during the intro it also finishes it.
  const onScrollIntent = () => {
    if (!done) { if (tl) tl.progress(1); finish(); }
    reveal();
  };
  ['wheel', 'touchmove', 'keydown'].forEach(ev => addEventListener(ev, onScrollIntent, { passive: true }));
  $('scrollCue').addEventListener('click', onScrollIntent);
  // Skip ends the intro but still waits for the scroll.
  $('introSkip').addEventListener('click', () => { if (tl) tl.progress(1); finish(); root.classList.add('held'); });
  document.querySelectorAll('a[href="#menu"]').forEach(a => a.addEventListener('click', onScrollIntent));

  if (root.classList.contains('intro')) playIntro();
  else { finish(); reveal(); }
})();
