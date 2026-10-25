/* Everything a seller would change lives here. The page reads window.SITE.
   Prices must match the MENU / BATCH tables in supabase/functions/submit-order,
   which stay the price authority. Lines marked TODO-CHECK wait for Leny. */
window.SITE = {
  brand: {
    name: 'Namit gid',
    home: 'Long Beach, Romblon',
    island: 'Byaringan Island',
    // TODO-CHECK: Hiligaynon lines
    headline: 'Kumain ka na? Tara, nagluto ako.',
    closedLine: 'Sarado anay kita. The kitchen’s light is off.',
  },
  pickup: {
    address: '180 Fairview Mall Dr, North York',
    mapUrl: 'https://maps.google.com/?q=180+Fairview+Mall+Dr,+North+York,+ON',
    days: [4, 5, 6, 0],              // pickup days: 0 = Sunday … 6 = Saturday (Thursday to Sunday)
    bookAheadDays: 28,               // how far ahead a pickup can be booked
    // Pickup times. Each order holds a 90-minute prep window (the order
    // function and /api/slot-load use the same 90), so times 90 minutes
    // apart means one order per time.
    times: ['11:00 AM', '12:30 PM', '2:00 PM', '3:30 PM', '5:00 PM', '6:30 PM'],
    hours: 'Pickup Thursday to Sunday, 11 AM to 7 PM',
  },
  deposit: { email: 'orders@takoshi.ca' },   // the deposit is half the total, after Leny's yes
  // Cloudflare Turnstile site key (an Invisible widget). Empty means no bot check.
  // The secret goes in Cloudflare Pages as TURNSTILE_SECRET_KEY, never here.
  turnstileSiteKey: '0x4AAAAAAFjQpVGHv8gHp7IU',   // widget "Namit Gid Request Form"
  // Leny's contacts, shared with Takoshi (same business). WhatsApp is the number
  // without + or spaces, as wa.me wants it.
  contacts: { whatsapp: '16476840916', facebook: 'https://www.facebook.com/takoshiPH/', messenger: '', instagram: '' },
  menu: {
    mains: [
      { id: 'shawarma', name: 'Shawarma Rice', short: 'Shawarma', img: 'images/shawarma.webp', w: 620, h: 607, warm: true,
        desc: 'Spiced beef shawarma on turmeric rice, cucumber and cherry tomato round the edge, plenty of garlic sauce on top.',
        sizes: [{ label: 'Small', price: 50, feeds: '3–4' }, { label: 'Medium', price: 65, feeds: '5–6' }] },
      { id: 'lumpia', name: 'Lumpiang Shanghai', short: 'Lumpia', img: 'images/lumpia.webp', w: 607, h: 620, warm: true,
        desc: 'Pork spring rolls, rolled by hand and packed tight. Sweet chili sauce on the side.',
        sizes: [{ label: '30 pcs', price: 35 }, { label: '50 pcs', price: 45 }] },
      { id: 'sushi', name: 'Baked Sushi', short: 'Sushi', img: 'images/sushi.webp', w: 620, h: 611, warm: true,
        desc: 'Sushi rice, kani, cream cheese and torched mayo, baked hot in a tray. Comes with nori sheets: scoop and eat with your hands.',
        sizes: [{ label: 'Small', price: 45, feeds: '3–4', extra: '+2 nori' }, { label: 'Medium', price: 60, feeds: '5–6', extra: '+4 nori' }] },
      { id: 'palabok', name: 'Palabok', img: 'images/palabok.webp', w: 538, h: 620, warm: true,
        desc: 'Rice noodles under my shrimp sauce, with prawns, egg and crushed chicharon.',
        sizes: [{ label: 'Small', price: 50, feeds: '3–4' }, { label: 'Medium', price: 65, feeds: '5–6' }] },
    ],
    desserts: [
      { id: 'tiramisu', name: 'Tiramisu', img: 'images/tiramisu.webp', w: 620, h: 439,
        desc: 'Ladyfingers soaked in espresso, thick cocoa on top, set overnight so it slices clean.',
        sizes: [{ label: 'Small tray', price: 25 }] },
      { id: 'cheesecake', name: 'Cheesecake', img: 'images/cheesecake.webp', w: 620, h: 565,
        desc: 'Mini cheesecakes, a box of four. Mix the flavours.',
        batch: { size: 4, price: 60, max: 5, flavours: ['Regular', 'Matcha', 'Pistachio'] } },
      { id: 'banana', name: 'Banana Bread Loaf', img: 'images/banana.webp', w: 620, h: 423,
        desc: 'Banana bread with chocolate chips, baked in little foil loaves.',
        sizes: [{ label: 'One loaf', price: 10 }] },
    ],
    // The holiday special lives under the glass dome. It shows between the
    // season dates (month-day, Toronto time); the free sticker only between
    // the sticker dates. On the preview it always shows.
    holiday: [
      { id: 'dreamcake', name: 'Chocolate Dreamcake', short: 'Holiday special', img: 'assets/img/dreamcake-silver.webp', w: 720, h: 720, photo: true,
        desc: 'Chocolate cake, chocolate cream, cocoa on top. In a silver tin, ready to gift.',
        sizes: [{ label: 'One tin', price: 20 }], min: 4,
        season: { from: '10-24', until: '01-06' },   // on sale from Oct 24 (Leny's call); was Nov 15
        gift: { text: 'Free “Happy Holidays” sticker on every tin', from: '12-01', until: '12-25' } },
    ],
  },
  // Shown at first paint, merged with live reviews. TODO: Leny's favourite real reviews.
  // What customers said, shown inside each dish's sheet, plus the overall
  // rating in the footer. PLACEHOLDERS: invented for the preview. While
  // placeholder is true they are hidden on namitgid.takoshi.ca. Replace with
  // real reviews (first name + what they ordered), then set placeholder: false.
  reviews: {
    placeholder: true,
    rating: { stars: 4.9, count: 37, url: '' },
    quotes: {
      palabok: { text: 'Lasang luto ni lola. We finished the tray before we got home.', name: 'Marites', ordered: 'Palabok' },
      shawarma: { text: 'So much garlic sauce, exactly how I like it. The small fed four of us.', name: 'Joel', ordered: 'Shawarma Rice' },
      lumpia: { text: 'Still crunchy after the drive home. Ordering 50 for the party.', name: 'Rhea', ordered: 'Lumpiang Shanghai' },
      sushi: { text: 'Scooped onto nori, the kids fought over the last bit. Namit gid talaga.', name: 'Carlo', ordered: 'Baked Sushi' },
      tiramisu: { text: 'Soft, not too sweet, and it really does slice clean.', name: 'Ana', ordered: 'Tiramisu' },
      cheesecake: { text: 'The matcha one is the reason I keep coming back.', name: 'Bea', ordered: 'Cheesecake box' },
      banana: { text: 'One for the drive, one for breakfast. Never lasts.', name: 'Paolo', ordered: 'Banana bread' },
    },
  },
  motion: { intro: true, introMs: 6000, returnMs: 1400 },
};
