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

  // ── Intro: dawn at Long Beach, run as one GSAP timeline ──────────────────
  // Only transforms, opacity and one clip move, so it stays on the GPU.
  const emblem = $('emblem');
  let tl = null, done = false;

  function finish() {
    if (done) return; done = true;
    if (tl) tl.kill();
    root.classList.remove('intro', 'landing');
    const st = $('stage'); if (st) st.remove();
    const sk = $('introSkip'); if (sk) sk.remove();
    if (window.gsap) gsap.set([plank, emblem, '#shore', '#heroCopy > *', '.hero h1 .line > span'], { clearProps: 'all' });
    if (!calm) plank.classList.add('sway');
  }

  async function playIntro() {
    if (!window.gsap) return finish();
    // Fonts first: the letters are measured for the beam.
    await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 900))]);
    if (done) return;

    const isle = $('stIsle'), island = $('stIsland'), word = $('stWord');
    const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

    // The name sits in the sky just above the island.
    const ir = isle.getBoundingClientRect();
    gsap.set(word, { top: ir.top - word.offsetHeight * 1.05, left: (innerWidth - word.offsetWidth) / 2 });

    // Split the name into letters, keeping the gold "gid".
    const chars = [];
    [...word.childNodes].forEach(node => {
      const frag = document.createDocumentFragment();
      [...node.textContent].forEach(c => {
        const s = document.createElement('span'); s.className = 'ch'; s.textContent = c === ' ' ? ' ' : c;
        frag.append(s); if (c !== ' ') chars.push(s);
      });
      if (node.nodeType === 3) word.replaceChild(frag, node); else { node.textContent = ''; node.append(frag); }
    });

    // The lamp: the lighthouse sits about 81.5% across and 3.5% down the island art.
    const r0 = island.getBoundingClientRect();
    // The island is still clipped at this point but its box is final.
    const L = { x: r0.left + r0.width * .815, y: r0.top + r0.height * .04 };
    gsap.set('#stBeam', { x: L.x, y: L.y, rotation: 185 });
    gsap.set('#stFlare', { x: L.x, y: L.y });

    const A0 = 185, A1 = 335, BEAM = 1.4, BEAM_AT = 2.3;
    const angleOf = el => {
      const r = el.getBoundingClientRect();
      let a = Math.atan2(r.top + r.height / 2 - L.y, r.left + r.width / 2 - L.x) * 180 / Math.PI;
      if (a < 0) a += 360;
      return a;
    };

    tl = gsap.timeline({ onComplete: finish, defaults: { ease: 'power2.out' } });
    window.__ngIntro = tl; // for frame-by-frame checks

    // Dawn comes up
    tl.to('#stStars', { opacity: 0, duration: 1.6, ease: 'sine.inOut' }, 0.3)
      .to('#stDay', { opacity: 1, duration: 2.6, ease: 'sine.inOut' }, 0.3)
      .fromTo('#stSun', { opacity: 0, y: '10vh', scale: .8 }, { opacity: 1, y: 0, scale: 1, duration: 2.8, ease: 'sine.out' }, 0.4)
      .to('#stPath', { opacity: 1, duration: 2, ease: 'sine.inOut' }, 1)
      .fromTo('.st-clouds i', { x: -20 }, { x: 30, duration: 7, ease: 'none', stagger: .3 }, 0);
    if (!lowEnd) {
      tl.to('.st-glints.g1', { xPercent: -6, duration: 6, ease: 'none' }, 0)
        .to('.st-glints.g2', { xPercent: 5, duration: 6, ease: 'none' }, 0);
    }
    // The tide washes up the sand and draws back
    tl.fromTo(['#stWash', '#stLip'], { y: 30 }, { y: -2, duration: .9, ease: 'power2.out' }, 0.1)
      .to(['#stWash', '#stLip'], { y: 9, duration: 1.1, ease: 'sine.inOut' }, 1.0)
      .to('#stWet', { opacity: 1, duration: .8 }, 1.1);
    // Byaringan rises over the horizon
    tl.fromTo(island, { clipPath: 'inset(100% 0% 0% 0%)', yPercent: 14 }, { clipPath: 'inset(0% 0% 0% 0%)', yPercent: 0, duration: 1.4, ease: 'expo.out' }, 0.6)
      .to('#stReflect', { opacity: .35, duration: .8 }, 1.5);
    // The lamp lights, the beam sweeps, and each letter lights as the beam crosses it
    tl.fromTo('#stFlare', { opacity: 0, scale: .2 }, { opacity: 1, scale: 1.5, duration: .35, ease: 'power3.out' }, 2.0)
      .to('#stFlare', { scale: .8, opacity: .9, duration: .5, ease: 'sine.inOut' }, 2.35)
      .to('#stBeam', { opacity: 1, duration: .2 }, BEAM_AT)
      .to('#stBeam', { rotation: A1, duration: BEAM, ease: 'sine.inOut' }, BEAM_AT)
      .to('#stBeam', { opacity: 0, duration: .35 }, BEAM_AT + BEAM - .25);
    chars.forEach(c => {
      // sine.inOut maps time to angle; invert it to find when the beam reaches this letter
      const p = Math.min(1, Math.max(0, (angleOf(c) - A0) / (A1 - A0)));
      const t = Math.acos(1 - 2 * p) / Math.PI;
      tl.fromTo(c, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .45, ease: 'power2.out' }, BEAM_AT + t * BEAM);
    });

    // The view folds onto the sign
    const FOLD = BEAM_AT + BEAM + .15;
    tl.add(() => root.classList.add('landing'), FOLD);
    tl.to('#stSand', { yPercent: 100, duration: .6, ease: 'power2.in' }, FOLD)
      .to(['#stFlare', '#stReflect', '#stPath'], { opacity: 0, duration: .4 }, FOLD);
    // Where everything lands is known up front (the sign is laid out, just
    // invisible), so the fold is part of the timeline and survives seeking.
    const frame = $('frameSlot').getBoundingClientRect();
    const tIsland = $('island').getBoundingClientRect(), tWord = $('wordmark').getBoundingClientRect();
    const cIsle = isle.getBoundingClientRect(), cWord = word.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    const fold = { duration: 1.2, ease: 'power3.inOut' };
    tl.fromTo('#stage', { clipPath: 'inset(0px 0px 0px 0px round 0px)' },
        { clipPath: `inset(${frame.top}px ${vw - frame.right}px ${vh - frame.bottom}px ${frame.left}px round 5px)`, ...fold }, FOLD + .05)
      .fromTo(isle, { x: 0, y: 0, scale: 1 }, { x: tIsland.left - cIsle.left, y: tIsland.top - cIsle.top, scale: tIsland.width / cIsle.width, transformOrigin: '0 0', ...fold }, FOLD + .05)
      .fromTo(word, { x: 0, y: 0, scale: 1 }, { x: tWord.left - cWord.left, y: tWord.top - cWord.top, scale: tWord.width / cWord.width, transformOrigin: '0 0', ...fold }, FOLD + .05)
      .fromTo(plank, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: .5, ease: 'power2.out' }, FOLD + .8);
    // Hand over to the painted sign, which catches it and swings
    const LAND = FOLD + 1.3;
    tl.set('#shore', { opacity: 1 }, LAND)
      .to('#stage', { opacity: 0, duration: .25 }, LAND)
      .to(plank, { keyframes: [{ rotation: 2.2, duration: .25, ease: 'power2.out' }, { rotation: -1.3, duration: .4, ease: 'sine.inOut' }, { rotation: .5, duration: .4, ease: 'sine.inOut' }, { rotation: 0, duration: .35, ease: 'sine.out' }] }, LAND)
      // Leny rises from behind the sign
      .fromTo(emblem, { opacity: 0, yPercent: 34 }, { opacity: 1, yPercent: 0, duration: 1.1, ease: 'expo.out' }, LAND + .15)
      // The words arrive
      .set('#heroCopy > h1', { opacity: 1 }, LAND + .5)
      .fromTo('.hero h1 .line > span', { yPercent: 105 }, { yPercent: 0, duration: .9, ease: 'expo.out', stagger: .09 }, LAND + .55)
      .fromTo('#heroCopy > :not(h1)', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .6, stagger: .07 }, LAND + .45);
  }

  const skip = () => { if (done) return; if (tl) tl.progress(1); finish(); };
  ['wheel', 'touchmove', 'keydown'].forEach(ev => addEventListener(ev, skip, { passive: true }));
  $('introSkip').addEventListener('click', skip);
  document.querySelectorAll('a[href="#menu"]').forEach(a => a.addEventListener('click', skip));

  if (root.classList.contains('intro')) playIntro(); else finish();
})();
