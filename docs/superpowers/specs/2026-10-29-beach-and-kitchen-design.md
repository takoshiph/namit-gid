# Two places: the beach and the kitchen

Status: draft for Elvin's approval. Builds on the door at dusk (docs/superpowers/specs/2026-10-28-door-at-dusk-design.md), which is live on the preview only.

## Why

The door at dusk made the site feel like a place you walk into. The page under it still works like a normal long web page, though. After you go through the door, a swipe up or down slides you back out to the beach or down into the footer. That breaks the feeling of being inside a room.

Elvin's direction:

- Once you're through the door, you're in the kitchen, and nothing scrolls you anywhere else.
- The kitchen is only for ordering.
- Everything else (who Leny is, how to reach her, reviews, Takoshi, legal) lives outside on the beach painting.
- You can step back out through the door to the painting.
- The painting is landscape, so on a phone you swipe left and right along it. Teach this with a gesture hint, never arrows.
- Elvin's goal hasn't changed: animation that is **smooth and relatable**.

## The shape: two places, not one page

The site has two places, and you are always in exactly one of them.

| | The beach (outside) | The kitchen (inside) |
|---|---|---|
| What's there | The dusk painting, the door, the always-visible essentials, and four things on the sand you can tap | Leny's greeting, the kitchen wall with the pots, the "How to order" card, the tray and checkout |
| How you move within it | Sideways along the painting, when it is wider than the screen | As it works today: dragging sideways along the kitchen wall on a phone |
| How you get to the other place | The door (tap, click, Enter or Space), or Order | Step outside: a control in the top bar, or the browser's back |
| Vertical page scroll | None | None between places. If the kitchen is taller than a short screen, it may scroll a little within itself, but it never shows the beach or anything else |

The footer goes away. Its content moves to the beach (below). The night-beach footer painting and its layers (beach-night-2400.webp, the closed door, foot-glow and so on) are no longer used.

## Going in (changed only at its end)

The entrance animation stays exactly as it is: the push in, the door opening on Leny, the bloom, and the greeting rising. Only where it lands changes. Under the bloom, the page swaps to the kitchen *place* instead of scrolling down to it, so there is nothing above the kitchen to scroll back to.

- **Order in the bar, at the beach:** plays the same entrance as tapping the door. *(My call: it's short, and it's the moment the site is built around.)*
- **"Skip to the menu", a link to #menu, and opening the site at /#menu:** go straight into the kitchen with no animation. These are for speed and accessibility.
- Going in adds a step to the browser history and puts **#menu** in the URL. A link to /#menu then opens the kitchen, and Back has a step to undo.

## Stepping outside (new)

- **In the bar, inside:** the right-hand slot that says Order at the beach becomes a "step outside" control, drawn as a small doorway with the word **Outside**. *(My call on the word and placement; the icon is a doorway, never an arrow.)*
- **The browser's Back** (button, Android back gesture, iOS edge swipe) from the kitchen does the same thing, not leave the site. People try Back first, so this matters most.
- **The animation is the entrance played in reverse,** about 1.2–1.6 s:
  1. A warm bloom covers the kitchen.
  2. You're in the doorway, pulling back as Leny steps back into view.
  3. The door swings closed.
  4. The camera settles on the beach at dusk, centred on the door, as you left it.
- It must feel like walking backwards out of the same doorway, never a page change. Reduced motion or data saver: a plain crossfade, like the calm entrance today.
- **If the site was opened straight on /#menu,** Outside still takes you to the beach. Back then leaves the site, as it would anywhere. *(My call.)*
- The tray is kept: stepping outside and back in loses nothing.
- **Where you land:** the door-centred view (the entrance flew you to the door, so that is where you were standing), whatever the pan was before you went in. *(My call.)*
- **History:** going in pushes one entry (#menu). Outside, when the entry before it is the beach (you came in through the door), is `history.back()`; otherwise (opened on /#menu, "Skip to the menu") it replaces #menu with the beach's URL. The sheets (dish, tray, review) keep whatever Back does with them today. *(My call.)*
- **The beach is always there underneath.** It is built once per page load, settled at dusk (the intro plays only on a first visit, or on every visit on the preview), stays in the page while you are inside, and pauses its idle life (fireflies, light, lighthouse, sign) while hidden, as the existing `.live` observer does off screen. So Outside always plays the full reverse animation onto a settled beach, also after "Skip to the menu" or a load on /#menu. *(My call.)*

## The beach

### Moving along it

- The painting keeps its current framing rules (CROP_WIDE, CROP_TALL). You always land on the door view.
- **Whenever the painting is wider than the screen at its displayed height, you can pan sideways across its full width.** That covers phones (where you see about a third of it) and most desktop and laptop screens (where the edges are cropped).
  - Touch: swipe left or right.
  - Trackpad: sideways scroll.
  - Mouse: drag, or the ordinary scroll wheel. *(My call: at the beach the wheel pans sideways, because it has nothing else to do.)*
  - Keyboard: ← and →. Tabbing to a hidden item pans to it.
- The pan feels physical: it follows the finger 1:1, carries momentum, and eases to a stop with a soft resistance at both ends. No snapping to fixed stops.
- Where the painting overflows the screen by less than 24 px there is no pan at all, and the wheel does nothing at the beach: there is nowhere else to go, and the door is the way on. *(My call.)*
- A vertical swipe or scroll at the beach never takes you into the kitchen. Only the door and Order do. This replaces "scroll at the door goes in" (Ruling 6 of the door-at-dusk build).
- The door's idle life carries on while you pan: the sign sways, the light breathes, fireflies drift, the lighthouse flashes. So do the dawn intro's matched framing and the "Tap the door" hint.

### The gesture hint (no arrows)

- **When:** the first time a visitor lands at the beach on a screen where panning is possible. It plays a few seconds after landing, once the door has had its moment.
- **What:** a soft white fingertip glides sideways once with a fading trail, then fades.
- **Then:** never again on that device (localStorage). Never with reduced motion. Panning itself still works there.

### Always written in the light

These sit on the painting in the warm cream type of today's caption, so the essentials never need hunting for:

- **The caption, where it is today:** "Namit Gid · Filipino food in North York", the pickup place and days, and the next pickup.
- **A faint line along the bottom edge:** © 2026 Namit Gid · Privacy · Terms, with the same links as the footer today.
- **Next to each tappable item:** a short glowing label that names it, like the kitchen's tags.

The caption and the © line stay fixed to the screen while you pan; the items and their labels move with the painting. Items and labels never sit under the caption, at any pan position or screen shape.

Everything in today's footer has a home: the name (the caption), the line about *namit gid* (the bottle), Say hi (the shell), Leave a review (the sand), Takoshi (the octopus), © and Privacy · Terms (the bottom line).

### Four things on the sand to tap

From left to right. Positions are areas, given as painting fractions (x, y). Exact placement is the builder's, as long as no item covers the door, the island, the bangka or the caption.

| Item | Where | Label | Opens |
|---|---|---|---|
| A message in a bottle, half-buried | By the palms, about x .10–.22, y .78–.90 | A note from Leny | A small letter: "*Namit gid* means “Ang sarap!” (really delicious) and I cook so every home I feed says it too. ~Leny" |
| A conch shell at the water's edge | About x .24–.34, y .72–.80 | Say hi | Email orders@takoshi.ca, and the Facebook · Messenger · Instagram line (still a to-do today, so it stays as text until the links exist) |
| Words written in the sand, with a stick standing beside them | Near the bangka, about x .52–.62, y .84–.94 | Leave a review | The existing review form (openReview, the same as ?review=1 today) |
| A small octopus peeking out of a tide pool | Right of the bangka, about x .86–.96, y .74–.86 | Takoshi | "Craving takoyaki? I make that too, at Takoshi →", linking to https://takoshi.ca |

On a phone, the bottle and the shell sit left of the door and the sand writing and the octopus to the right, so both swipe directions lead somewhere.

**Tapping an item:**
- A small card opens beside it, in the kitchen's card style.
- Only one card is open at a time. It closes with ×, Escape, tapping elsewhere, or panning away.
- Each item is a real button with an accessible name, and the card's text and links are in the page's HTML (not added only by script), so search engines and screen readers still find them.

**The items' life:**
- At rest, each glows softly.
- Hover, focus or press brightens the glow and gives the item a tiny lift.
- Now and then a firefly drifts over to an item and away again, a quiet hint that something is there.

**Art:**
- The four items are painted the way Leny and the night beach were: generated with tools/gemini-image.mjs from reference images of the dusk painting, on flat magenta, and keyed out with tools/magenta-key.js.
- They must match the painting's light, palette, edge softness and brushwork, and be lit by dusk. Nothing should look stuck on.
- **Elvin approves the art before it goes in. The interaction is built first with plain glowing placeholder shapes at the same anchors, and the approved art is swapped in afterwards, the way the door was. *(My call.)***

## The kitchen

- Only what's there for ordering: the greeting, the kitchen wall (with its pots, dome, oven, phone and register), the "How to order" card, the tray bar, and the dish and tray sheets.
- Nothing from the beach or the old footer.
- It should fit one screen at common sizes (phones from 360 × 640 portrait, laptops from 1280 × 720). The builder may tighten the greeting's spacing to get there. If a very short screen still can't fit it, the kitchen scrolls within itself only.
- Checkout, sheets, the tray and every ordering behaviour are unchanged.

## The intro's sea and sand (my proposal as the animator)

Nightfall works because the dawn ends in the painting's exact composition. The dawn's sea and sand are now the weakest part of that match:
- The waves are thin dashes sliding sideways.
- The shoreline is one unbroken white line bobbing up and down.
- The sand is a flat beige gradient with none of the painting's shapes.

- **Waves:**
  - Swells roll *toward* the shore with perspective: small, slow and close together near the horizon, larger and further apart near the beach.
  - They are drawn from brushwork sampled from the painting's own wave strokes, so at nightfall they become the painting's waves.
- **Shoreline:**
  - The foam is broken and irregular. It washes up the sand and draws back.
  - The sand it wet stays darker for a moment, then fades.
- **Sand:**
  - The painting's texture instead of a flat gradient.
  - The painting's wet, sky-reflecting pool near the water (about x .2–.8, y .74–.85) is already there at dawn, reflecting the dawn sky. Nightfall then only changes its colour.
- **Unchanged:**
  - The matched composition (island, horizon, shore, bangka, frond, range and clouds rest exactly on the painting's).
  - Nightfall's timing.
  - The transforms-and-opacity-only rule.
  - The lighter low-end-device path.

## Constraints

- **Preview only.** All work is on redesign-preview, which deploys to redesign-preview.namit-gid.pages.dev. main (namitgid.takoshi.ca) is untouched until Elvin says push.
- Bump ?v= on every CSS or JS change. namit-gid has no service worker.
- Animations use transforms and opacity, as the rest of the site does, with GSAP where the site already uses it.
- Reduced motion and data saver (html.calm): no camera moves, crossfades only, no gesture hint. Panning and every tap target still work.
- Phones down to 360 px wide, installable-feeling: touch targets at least 44 px, readable type.
- **Never print, commit or log secrets.** The Gemini key stays in ~/.config/gemini/key and is read only by tools/gemini-image.mjs.

## Goals

- The two places feel like real places: you walk in through a door and walk back out, with no web-page scrolling in between.
- Anyone finds the essentials (what, where, when) without tapping anything.
- The tappable items are a small delight, and they speak the same language as the kitchen.

## Non-goals

- Changing how ordering, the tray or checkout work.
- Making it night when you step outside after ordering (an idea for later).
- Footprints in the sand leading to the door (an idea for later).
- Any change to main.

## Anti-goals (a failure even if it technically works)

- Any swipe, scroll or key that slides you from one place into the other without the door.
- Arrows, chevrons or "scroll" prompts on the beach.
- Essentials hidden behind a tap.
- Items that look pasted on, or a pan that stutters or snaps.
- Back leaving the site from the kitchen when the visitor came in through the door.

## Left to the builder

- How the two places are built: sections shown and hidden, page states, or one fixed stage. Any approach works as long as the behaviour above holds and the HTML still carries the content.
- The panning mechanism, including how momentum and edge resistance are done.
- Exact item placement within the given areas, card layout, glow and lift values, and firefly routes.
- The exact timings of stepping outside, within 1.2–1.6 s.
- How the sea and sand are drawn, as long as they meet the proposal above.
