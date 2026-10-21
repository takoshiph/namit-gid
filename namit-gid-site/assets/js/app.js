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
  const ALL = [...S.menu.mains, ...S.menu.desserts];
  const byId = Object.fromEntries(ALL.map(d => [d.id, d]));
  let tray = [];
  try { tray = JSON.parse(localStorage.getItem('ng-tray') || '[]').filter(l => byId[l.id]); } catch (e) {}
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
  function dishFig(d) {
    const fig = make('figure', { class: 'dish-fig' });
    fig.style.setProperty('--m', `url(${d.img})`);
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
        b.addEventListener('click', () => { size = s.label; chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b))); paint(); });
        return b;
      })) : make('p', { class: 'dish-fact', text: money(d.sizes[0].price) });
    const row = make('div', { class: 'add-row' });
    function paint() {
      const line = tray.find(l => l.id === d.id && l.size === size);
      row.replaceChildren();
      if (!line) {
        row.append(make('button', { type: 'button', class: 'btn btn-sea', text: 'Add to tray', onclick: () => { add({ id: d.id, size, qty: 1 }, fig); paint(); } }));
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
    el.append(fig, make('div', { class: 'dish-text' }, [make('h3', { text: d.name }), make('p', { class: 'dish-desc', text: d.desc }), chips, row]));
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
    el.append(fig, make('div', { class: 'dish-text' }, [make('h3', { text: d.name }), make('p', { class: 'dish-desc', text: d.desc }),
      make('div', { class: 'cbox' }, [slots, flav, note, addBtn])]));
    return el;
  }

  $('mains').append(...S.menu.mains.map(sizedDish));
  $('desserts').append(...S.menu.desserts.map(d => d.batch ? boxDish(d) : sizedDish(d)));
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
    if (line.qty <= 0) tray = tray.filter(l => l !== line);
    save(); renderTray(false);
    say(`${count()} in your tray, ${money(total())}.`);
  }

  function renderTray(bump) {
    const n = count();
    const bar = $('traybar');
    bar.hidden = n === 0;
    $('bilaoCount').textContent = n;
    $('traySum').textContent = n + (n === 1 ? ' item' : ' items');
    $('trayTotal').textContent = money(total());
    if (bump) {
      const c = $('bilaoCount'); c.classList.remove('roll'); void c.offsetWidth; c.classList.add('roll');
    }
    // desktop panel
    const p = $('trayPanel');
    p.replaceChildren(
      make('h2', {}, [make('span', { class: 'bilao', 'aria-hidden': 'true', id: 'panelBilao' }), 'Your tray']),
      n ? lineList() : make('p', { class: 'small', text: 'Add a dish and it lands here. One pickup, one $10 deposit for the whole tray.' }),
      ...(n ? [sums(), make('button', { type: 'button', class: 'btn btn-sea', text: 'Choose pickup', onclick: () => openSheet(1) })] : []));
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
    const t = total(), dep = S.deposit.amount;
    return make('div', { class: 'sums' }, [
      make('div', {}, [make('span', { text: 'Total' }), make('span', { class: 'big', text: money(t) })]),
      make('div', { class: 'small' }, [make('span', { text: 'Deposit now' }), make('span', { text: money(dep) })]),
      make('div', { class: 'small' }, [make('span', { text: 'At pickup' }), make('span', { text: money(Math.max(0, t - dep)) })])]);
  }

  // The dish flies on an arc into the bilao: X runs linear, Y eases, so the path curves.
  function fly(fig) {
    if (calm) return dip();
    const target = window.innerWidth >= 900 ? $('panelBilao') : $('bilao');
    if (!target) return;
    const a = fig.querySelector('img').getBoundingClientRect(), b = target.getBoundingClientRect();
    const size = 72;
    const x0 = a.left + a.width / 2 - size / 2, y0 = a.top + a.height / 2 - size / 2;
    const x1 = b.left + b.width / 2 - size / 2, y1 = b.top + b.height / 2 - size / 2;
    const outer = make('div', { class: 'flyer', 'aria-hidden': 'true' });
    const inner = make('div');
    inner.append(make('img', { src: fig.querySelector('img').src, alt: '' }));
    outer.append(inner); document.body.append(outer);
    const dur = 640;
    outer.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }], { duration: dur, easing: 'linear', fill: 'forwards' });
    const lift = Math.min(160, Math.abs(y1 - y0) * .35 + 60);
    inner.animate([
      { transform: `translateY(${y0}px) scale(1.4)`, opacity: .0 },
      { transform: `translateY(${Math.min(y0, y1) - lift}px) scale(1)`, opacity: 1, offset: .35, easing: 'cubic-bezier(.55,0,.85,.35)' },
      { transform: `translateY(${y1}px) scale(.35)`, opacity: 1 }],
      { duration: dur, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' })
      .finished.then(() => { outer.remove(); dip(); });
  }
  function dip() {
    [$('bilao'), $('panelBilao')].forEach(b => { if (!b) return; b.classList.remove('dip'); void b.offsetWidth; b.classList.add('dip'); });
  }

  // ── Order sheet (Tray · Pickup · Details · Deposit) ─────────────────────
  const sheet = $('sheet');
  let step = 0;
  const order = { date: null, time: null, name: '', contact: '', email: '', notes: '' };
  try { Object.assign(order, JSON.parse(localStorage.getItem('ng-me') || '{}')); } catch (e) {}
  const STEPS = ['Tray', 'Pickup', 'Details', 'Deposit'];

  function openSheet(at) { step = at || 0; refreshSheet(); if (!sheet.open) sheet.showModal(); }
  function refreshSheet() {
    if (!sheet.open && step === undefined) return;
    if (!count() && step < 4) { $('sheetH').textContent = 'Your tray'; $('sheetBody').replaceChildren(make('p', { text: 'Your tray is empty.' })); return; }
    $('sheetH').textContent = step < 4 ? STEPS[step] : 'Salamat gid!';
    const prog = make('div', { class: 'progress', 'aria-hidden': 'true' }, STEPS.map((s, i) => make('span', { class: i <= step ? 'on' : '', text: s })));
    const body = [];
    if (step === 0) {
      body.push(lineList(), sums(), make('button', { type: 'button', class: 'btn btn-sea', text: 'Choose pickup', onclick: () => { step = 1; refreshSheet(); } }));
    } else if (step === 1) {
      const days = [];
      const now = new Date();
      for (let i = 1; days.length < 8 && i < 20; i++) {
        const d = new Date(now); d.setDate(now.getDate() + i);
        if ([5, 6, 0].includes(d.getDay())) days.push(d);
      }
      const iso = d => d.toISOString().slice(0, 10);
      if (!order.date) order.date = iso(days[0]);
      const dc = make('div', { class: 'datechips', role: 'group', 'aria-label': 'Pickup day' }, days.map(d => make('button', {
        type: 'button', 'aria-pressed': String(iso(d) === order.date), onclick: () => { order.date = iso(d); order.time = null; refreshSheet(); },
      }, [d.toLocaleDateString('en-CA', { weekday: 'short' }), make('b', { text: String(d.getDate()) }), d.toLocaleDateString('en-CA', { month: 'short' })])));
      const times = ['11:00 AM', '12:30 PM', '2:00 PM', '3:30 PM', '5:00 PM', '6:30 PM'];
      const full = new Set(mock ? ['2:00 PM'] : []);
      const tc = make('div', { class: 'chipgrid', role: 'group', 'aria-label': 'Pickup time' }, times.map(t => {
        const b = make('button', { type: 'button', 'aria-pressed': String(t === order.time), class: full.has(t) ? 'full' : '' }, [t]);
        if (full.has(t)) { b.disabled = true; b.append(make('span', { class: 'sr-only', text: ' (full)' })); }
        b.addEventListener('click', () => { order.time = t; refreshSheet(); });
        return b;
      }));
      body.push(make('p', { class: 'small', text: S.pickup.cutoff + '. Pickup at ' + S.pickup.address + '.' }), dc, tc,
        make('button', { type: 'button', class: 'btn btn-sea', text: 'Next', onclick: () => { if (order.time) { step = 2; refreshSheet(); } } }));
      if (!order.time) body[body.length - 1].disabled = true;
    } else if (step === 2) {
      const f = (id, label, type, attrs = {}) => {
        const inp = type === 'textarea' ? make('textarea', { id, rows: 3, ...attrs }) : make('input', { id, type, ...attrs });
        inp.value = order[id] || '';
        inp.addEventListener('input', () => { order[id] = inp.value; });
        return make('div', { class: 'field' }, [make('label', { for: id, text: label }), inp]);
      };
      body.push(f('name', 'Your name', 'text', { autocomplete: 'name' }), f('contact', 'Phone or IG handle', 'text', { autocomplete: 'tel' }),
        f('email', 'Email (optional, for a confirmation)', 'email', { autocomplete: 'email' }),
        f('notes', 'Notes (allergies, anything I should know)', 'textarea'),
        make('button', { type: 'button', class: 'btn btn-sea', text: 'Next', onclick: () => {
          if (!order.name.trim() || !order.contact.trim()) { say('Please add your name and a phone number or IG handle.'); return; }
          try { localStorage.setItem('ng-me', JSON.stringify({ name: order.name, contact: order.contact, email: order.email })); } catch (e) {}
          step = 3; refreshSheet();
        } }));
    } else if (step === 3) {
      const copy = make('button', { type: 'button', class: 'btn btn-line', text: 'Copy address', onclick: () => {
        navigator.clipboard && navigator.clipboard.writeText(S.deposit.email).then(() => { copy.textContent = 'Copied'; });
      } });
      body.push(make('div', { class: 'etr' }, [make('p', { text: `Send ${money(S.deposit.amount)} by Interac e-Transfer to` }), make('code', { text: S.deposit.email }), copy,
        make('p', { class: 'small', text: 'Message: “Namit Gid” and your name. That’s the shared inbox for our two home kitchens, Namit Gid and Takoshi. It comes straight to me.' })]),
        sums(),
        make('button', { type: 'button', class: 'btn btn-sea', text: 'Place my order', onclick: place }));
    } else {
      body.push(make('div', { class: 'receipt' }, [
        make('p', { class: 'stamp', text: 'HELD ' + money(S.deposit.amount) }),
        make('p', { text: `Your order’s in, ${order.name.split(' ')[0]}. I’ll message you at ${order.contact} to confirm.` }),
        make('p', { text: 'Pickup ' + new Date(order.date + 'T12:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) + ' at ' + order.time + '.' }),
        make('p', { class: 'small', text: S.pickup.address })]),
        make('button', { type: 'button', class: 'btn btn-line', text: 'Done', onclick: () => sheet.close() }));
    }
    $('sheetBody').replaceChildren(...(step < 4 ? [prog] : []), ...body);
  }

  async function place() {
    if (!mock) {
      // The live order API lands with the server change; until then the preview only runs in mock mode.
      say('Ordering opens when the new kitchen system is live.');
      $('sheetBody').append(make('p', { class: 'small', text: 'Ordering on this preview runs only in test mode (add ?mock=1 to the link).' }));
      return;
    }
    await new Promise(r => setTimeout(r, 500));
    step = 4; tray = []; save(); renderTray(false); repaintDishes(); refreshSheet();
  }

  $('trayReview').addEventListener('click', () => openSheet(0));
  $('bilao').addEventListener('click', () => openSheet(0));
  $('sheetClose').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

  renderTray(false);

  // ── Reviews: static first, never empty ──────────────────────────────────
  $('notes').append(...S.reviews.map(r => make('figure', { class: 'note' }, [make('p', { text: r.text }), make('cite', { text: r.name })])));

  // ── Open / closed: the lighthouse in the bar ────────────────────────────
  if (!mock) {
    fetch('/api/availability').then(r => r.json()).then(a => {
      if (a.available === false) $('navLamp').classList.remove('is-on');
    }).catch(() => $('navLamp').classList.remove('is-on'));
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

  // ── The sign answers scroll speed ───────────────────────────────────────
  const plank = $('plank');
  let lastY = scrollY, vel = 0, raf = 0;
  function swayTick() {
    raf = 0;
    vel *= .86;
    plank.style.transform = `rotate(${Math.max(-4, Math.min(4, vel * .08)).toFixed(2)}deg)`;
    if (Math.abs(vel) > .2) raf = requestAnimationFrame(swayTick);
  }
  addEventListener('scroll', () => {
    const y = scrollY; vel += (y - lastY); lastY = y;
    if (y < innerHeight * 1.2 && !raf && !calm) raf = requestAnimationFrame(swayTick);
  }, { passive: true });

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
    root.classList.remove('intro', 'landing');
    const st = $('stage'); if (st) st.remove();
    const sk = $('introSkip'); if (sk) sk.remove();
    if (window.gsap) gsap.set([plank, emblem, '#shore'], { clearProps: 'all' });
    if (!calm) plank.classList.add('sway');
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
    const hold = Math.max(0, vh * .47 - (sr.top + sr.height / 2));
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
    gsap.set(['#stFinder', '#stPrint'], { x: photo.left, y: photo.top, width: photo.width, height: photo.height });

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
    // The two distant birds flap and drift; they freeze when the shutter fires.
    [['#farA path', 'M20 22 Q26 15 32 21 Q38 15 44 22', 'M20 18 Q26 24 32 20 Q38 24 44 18', .32],
     ['#farB path', 'M56 12 Q61 6 66 11 Q71 6 76 12', 'M56 9 Q61 14 66 10 Q71 14 76 9', .27]].forEach(([sel, up, down, d]) => {
      amb.fromTo(sel, { attr: { d: up } }, { attr: { d: down }, duration: d, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0);
    });
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

    // A bird comes out of the dawn straight at the lens: a speck near the
    // lighthouse that grows until it almost fills the frame, then is past us.
    tl.set('#stBird', { opacity: 1, x: vw * .58, y: vh * .4, scale: .08, rotation: -4 }, .7)
      .to('#stBird', { x: vw * .2, y: vh * .18, scale: 5.5, rotation: 10, duration: 1.45, ease: 'power3.in' }, .7)
      .to('#stWing', { attr: { d: 'M2 22 Q24 38 50 20 Q76 38 98 22 Q76 30 50 26 Q24 30 2 22Z' }, duration: .15, ease: 'sine.inOut', repeat: 9, yoyo: true }, .7)
      .set('#stBird', { opacity: 0 }, 2.15);
    // Then the camera passes through a cloud: it swells from the middle of the
    // frame, wraps the view for a moment, and opens out past the edges.
    gsap.set(near, { left: '50%', top: '42%', xPercent: -50, yPercent: -50, transformOrigin: '50% 50%' });
    tl.fromTo(near, { scale: .25, opacity: 0 }, { scale: 1.2, opacity: .97, duration: .75, ease: 'power2.in' }, 2.15)
      .to(near, { scale: 3.4, opacity: 0, duration: .8, ease: 'power1.out' }, 2.9);

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
      .add(() => { root.classList.add('landing'); amb.pause(); }, SHOT)
      .set('#stage', { clipPath: inset(photo) }, SHOT + .09)
      .set(['#stSand', '#stFinder', '#stFlare'], { opacity: 0 }, SHOT + .09)
      .set('#stPrint', { opacity: 1 }, SHOT + .09)
      .to(['#bladeTop', '#bladeBot'], { scaleY: 0, duration: .14, ease: 'power2.out' }, SHOT + .1)
      .fromTo('#stFlash', { opacity: .85 }, { opacity: 0, duration: .45, ease: 'power2.out', immediateRender: false }, SHOT + .1);

    // ── the photo flies onto the sign ──
    const FLY = SHOT + .45, fly = { duration: 1.15, ease: 'power3.inOut' };
    tl.fromTo('#stage', { clipPath: inset(photo) }, { clipPath: inset(frame), ...fly, immediateRender: false }, FLY)
      .to('#stPrint', { x: frame.left, y: frame.top, width: frame.width, height: frame.height, ...fly }, FLY)
      .to('#stPrint', { opacity: 0, duration: .3 }, FLY + .85)
      .set([isle, word], { willChange: 'transform' }, FLY - .05)
      .fromTo(isle, { x: 0, y: 0, scale: 1 }, { x: tIsland.left - cIsle.left, y: tIsland.top - cIsle.top, scale: tIsland.width / cIsle.width, transformOrigin: '0 0', ...fly, immediateRender: false }, FLY)
      .fromTo(word, { x: 0, y: 0, scale: 1 }, { x: tWord.left - cWord.left, y: tWord.top - cWord.top, scale: tWord.width / cWord.width, transformOrigin: '0 0', ...fly, immediateRender: false }, FLY)
      .to('#stSun', { opacity: .5, duration: fly.duration }, FLY)
      .fromTo(plank, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: .5 }, FLY + .7);

    // ── the sign catches it and swings; Leny rises ──
    const LAND = FLY + 1.2;
    tl.set('#shore', { opacity: 1 }, LAND)
      .to('#stage', { opacity: 0, duration: .25 }, LAND)
      .to(plank, { keyframes: [{ rotation: 2.2, duration: .25, ease: 'power2.out' }, { rotation: -1.3, duration: .4, ease: 'sine.inOut' }, { rotation: .5, duration: .4, ease: 'sine.inOut' }, { rotation: 0, duration: .35, ease: 'sine.out' }] }, LAND)
      .fromTo(emblem, { opacity: 0, yPercent: 34 }, { opacity: 1, yPercent: 0, duration: 1.1, ease: 'expo.out' }, LAND + .15);
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
