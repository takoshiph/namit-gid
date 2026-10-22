/* Everything a seller would change lives here. The page reads window.SITE.
   Prices must match the MENU / BATCH tables in supabase/functions/submit-order,
   which stay the price authority. Lines marked TODO-CHECK wait for Leny. */
window.SITE = {
  brand: {
    name: 'Namit gid',
    home: 'Long Beach, Romblon',
    island: 'Byaringan Island',
    // TODO-CHECK: Hiligaynon lines
    eyebrow: 'Luto sa balay · Long Beach, Romblon to North York',
    eyebrowShort: 'Luto sa balay · Romblon to Toronto',
    headline: 'Filipino home cooking, made the day you pick it up.',
    caption: 'That’s Byaringan Island, the view from our beach in Long Beach, Romblon.',
    closedLine: 'Sarado anay kita. The kitchen’s light is off.',
    footerLine: 'Abang kalipay gid.',
  },
  pickup: {
    address: '180 Fairview Mall Dr, North York',
    mapUrl: 'https://maps.google.com/?q=180+Fairview+Mall+Dr,+North+York,+ON',
    cutoff: 'Order by 8 PM the day before', // TODO-CHECK
    hours: 'Pickup Friday to Sunday, 11 AM to 7 PM', // TODO-CHECK
  },
  deposit: { amount: 10, email: 'orders@takoshi.ca' },
  contacts: { facebook: '', messenger: '', instagram: '' }, // TODO: links from the owner
  menu: {
    mains: [
      { id: 'shawarma', name: 'Shawarma Rice', short: 'Shawarma', img: 'images/shawarma.webp', w: 620, h: 607, warm: true,
        desc: 'Spiced beef shawarma on turmeric rice, cucumber and cherry tomato round the edge, plenty of garlic sauce on top.',
        sizes: [{ label: 'Small', price: 50 }, { label: 'Medium', price: 65 }] },
      { id: 'lumpia', name: 'Lumpiang Shanghai', short: 'Lumpia', img: 'images/lumpia.webp', w: 607, h: 620, warm: true,
        desc: 'Pork spring rolls, rolled by hand and packed tight. Sweet chili sauce on the side.',
        sizes: [{ label: '30 pcs', price: 35 }, { label: '50 pcs', price: 45 }] },
      { id: 'sushi', name: 'Baked Sushi', short: 'Sushi', img: 'images/sushi.webp', w: 620, h: 611, warm: true,
        desc: 'Sushi rice, kani, cream cheese and torched mayo, baked hot in a tray. Scoop it onto nori with your hands.',
        sizes: [{ label: 'Small', price: 45 }, { label: 'Large', price: 60 }] },
      { id: 'palabok', name: 'Palabok', img: 'images/palabok.webp', w: 538, h: 620, warm: true,
        desc: 'Rice noodles under my shrimp sauce, with prawns, egg and crushed chicharon.',
        sizes: [{ label: 'Small', price: 50 }, { label: 'Medium', price: 65 }] },
    ],
    desserts: [
      { id: 'tiramisu', name: 'Tiramisu', img: 'images/tiramisu.webp', w: 620, h: 439,
        desc: 'Ladyfingers soaked in espresso, thick cocoa on top, set overnight so it slices clean.',
        sizes: [{ label: 'One tray', price: 25 }] },
      { id: 'cheesecake', name: 'Cheesecake', img: 'images/cheesecake.webp', w: 620, h: 565,
        desc: 'Creamy, slow-set cheesecakes. A box is four, mixed however you like.',
        batch: { size: 4, price: 60, max: 5, flavours: ['Regular', 'Matcha', 'Pistachio'] } },
      { id: 'banana', name: 'Banana Bread Loaf', img: 'images/banana.webp', w: 620, h: 423,
        desc: 'Banana bread with chocolate chips, baked in little foil loaves.',
        sizes: [{ label: 'One loaf', price: 10 }] },
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
      shawarma: { text: 'So much garlic sauce, exactly how I like it. Medium fed four of us.', name: 'Joel', ordered: 'Shawarma Rice' },
      lumpia: { text: 'Still crunchy after the drive home. Ordering 50 for the party.', name: 'Rhea', ordered: 'Lumpiang Shanghai' },
      sushi: { text: 'Scooped onto nori, the kids fought over the last bit. Namit gid talaga.', name: 'Carlo', ordered: 'Baked Sushi' },
      tiramisu: { text: 'Soft, not too sweet, and it really does slice clean.', name: 'Ana', ordered: 'Tiramisu' },
      cheesecake: { text: 'The matcha one is the reason I keep coming back.', name: 'Bea', ordered: 'Cheesecake box' },
      banana: { text: 'One for the drive, one for breakfast. Never lasts.', name: 'Paolo', ordered: 'Banana bread' },
    },
  },
  motion: { intro: true, introMs: 6000, returnMs: 1400 },
};
