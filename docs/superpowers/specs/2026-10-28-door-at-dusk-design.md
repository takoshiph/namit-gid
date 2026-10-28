# The door at dusk: a new opening for namitgid.takoshi.ca

**Date:** 2026-10-28
**Scope:** `namit-gid-site/` (index.html, assets/css/site.css, assets/js/app.js, sw.js, new paintings in assets/img/). The kitchen menu, the dish sheets, the tray and the order flow keep working as they do today.

## Intent

The site should feel like one dreamy, unbroken shot: you arrive at Long Beach at dawn, the day passes, and at dusk a door has appeared on the sand with the Namit Gid sign hanging in front of it. You tap it, Leny opens it, and you step into her kitchen, which is the menu.

The idea came from the dusk-beach painting in the footer, which Elvin loves. The door turns "Tara, nagluto ako" (come, I cooked) into something the visitor actually does.

What Elvin cares about most is that the animation is **smooth and relatable**. Smooth means the camera never stops dead and nothing visibly cuts. Every change of picture is hidden inside a move, a wipe or a burst of light. Relatable means every beat uses something people already understand without being told: the sun setting, warm light through a door that's ajar, a host opening the door.

## Goals

- One continuous take from the lighthouse to the kitchen.
- The door is obviously the thing to tap, without an arrow or a "click here".
- Leny is still the first person a visitor meets.
- Ordering is never slowed down. The Order button in the header works at every moment.

## Non-goals

- Changing the kitchen menu, dish sheets, tray, order form or Supabase functions.
- Changing the header (lamp, name, open/closed status).
- Sound.

## Anti-goals (a failure even if it technically works)

- Two zooms with a pause between them ("zoom, stop, open, zoom"). It must feel like one move.
- A visible jump when the picture changes: the live scene to the painting, or the beach to the kitchen.
- A hungry returning customer forced to sit through the whole show.
- A door that looks pasted onto the painting: wrong light, no reflection, a different brush style.
- A phone layout where the door is cropped off or too small to tap.

## The sequence, shot by shot

The existing intro is a GSAP timeline in `app.js` (`playIntro`, `window.__ngIntro`). The stage (`#stage`) is a layered live scene at dawn: stars fade, the sun rises, the island's lighthouse beam sweeps and writes "Namit gid" in light, then the viewfinder, shutter and photo-flight land the scene on Leny's sign board.

### Shot 1: the pull-back (kept)

- It starts close on the lit lighthouse at dawn and pulls back, exactly as today: sky, sun, rays, clouds, birds, sea glitter, the beam writing the name.
- **Removed:** the viewfinder (`#stFinder`), the shutter blades, the flash, the photo flying onto the board, and everything after `SHOT` in the timeline.
- **Changed:** the pull-back keeps going until the island sits where it sits in the dusk painting: small, just right of centre, on the horizon. The last frame of shot 1 must match the composition of the painting, so the wipe changes only the time of day, never where things are. The camera eases into that framing and is still drifting very slowly when the wipe begins. There is no dead stop.

### Shot 2: the wipe, as time passes (new)

- A full-screen wipe runs left to right over about 1.5 s with an in-out ease. Behind it, the live dawn scene becomes the still dusk-beach painting.
- Its edge is a soft, wet watercolour brush stroke, not a hard line, with a thin warm-gold band along the leading edge, as if the sunset were sweeping across.
- The palms on the left appear first.
- The door and its hanging sign are revealed *by* the wipe as the edge passes them; they are part of the new picture. As the edge passes, the sign gives one small swing and settles. This follow-through makes it feel physical.
- The light-written "Namit gid" from shot 1 is wiped away. The name now lives on the hanging sign. *(Builder's call how literally to link the two; a brief glow on the sign as the edge passes is enough.)*

### Shot 3: the door, waiting (new)

- The door stands on the wet sand by the tide pool, with its reflection in the wet sand. The reflection is what sells that it's really there.
- It is slightly ajar, with warm light leaking from the gap and pooling on the sand. This is the "tap me" cue.
- **Idle life**, gentle and looping: the sign sways a little, the door light breathes, a few fireflies drift (reuse the footer's), and the island lighthouse flashes as it does in the footer today.
- If nothing happens for about 3 s, a small "Tap the door" fades in near it.
- The door is a real `<button>` with the label "Come inside". It works with a keyboard and a screen reader.
- Scrolling down also counts as going in. Today the page waits for a scroll after the intro (`held`, `onScrollIntent`). In the new version, that same intent plays the entrance.

### Shot 4: going in, as one move (new)

About 2 s in total, all overlapping:

1. **Anticipation (about 0.15 s):** the door gives a tiny push back, like a hand on it.
2. The camera starts pushing in toward the door, and *while it moves*, the door swings open on its hinge. Leny is standing in the doorway, in the light, welcoming you in. No text appears here: at the door she is seen, not read. *(Elvin left this to Claude.)*
3. A short beat on Leny, held while the camera is still creeping in, not paused. Then the camera continues through the doorway. Leny steps aside (or the camera passes her), and the warm light blooms to fill the screen.
4. Under the full bloom, the page swaps to the kitchen (`#menu`). The bloom fades and the kitchen eases into place with a slight settle.

The kitchen image (`kitchen.webp` and its layers) must be loaded before shot 4 can finish. Start fetching it during the wipe.

### The bookend: leaving at night (new)

- The footer stops repeating the dusk beach. It becomes the same view at night: the door is shut now, with light glowing under it and through its window, the lighthouse is still flashing, and there are fireflies.
- Scrolling down from the kitchen to the footer reads as stepping back outside after the meal. Optionally, the door's light dims once as the footer comes into view, as if someone inside said goodbye.
- The footer text (Say hi, Leave a review, Takoshi, legal) stays as it is.

## Who sees what

| Visitor | Experience |
|---|---|
| First visit | Shots 1 to 4 in full. |
| Returning visitor (has seen the intro before on this device) | Skips shot 1 and the wipe. The page opens on the door at dusk, idle, ready to tap. |
| Reduced motion, or data saver (today's `calm` class) | Lands on the door at dusk with no idle animation. Tapping crossfades straight to the kitchen. |
| Taps Skip during the intro | Jumps to the door, idle. |
| Scrolls, swipes or presses a key during shots 1 or 2 | Same as Skip: jumps to the door, idle. It does not go inside on its own. *(My call.)* |
| Taps Order in the header, or "Skip to the menu", at any time | Goes straight to the kitchen. No door animation. |
| Arrives with a link to `#menu` | Lands in the kitchen. |

Today the full intro plays on every visit. Remembering that someone has seen it is new. *(My call: a `localStorage` flag set once shot 2 finishes.)*

## What goes away

- The hero section as it is today: Leny leaning on the sign board, the painted badge, the framed shore view on the board, the frond, and "See the menu".
- The hero's words move. The "Kumain ka na? Tara, nagluto ako." line, its translation and "~Leny" become the first words inside the kitchen, replacing "Smells good in here." They animate in as the kitchen settles at the end of shot 4. That way everyone reads Leny's greeting, including people who skip the door (Order, reduced motion, `#menu` links). The kitchen's instruction line ("Follow your nose. Lift a lid…") stays under it. The pickup line ("Pickup near Fairview Mall · Thursday to Sunday") and the next-pickup note move to a quiet caption on the beach screen, so they're readable before tapping. The page still needs one `<h1>`, and it must exist on the beach screen for search engines and screen readers. *(Builder's call where it sits visually.)*
- Leny's board sign is still used by the printed bag cards. Don't delete `sign-board.webp` or `leny-painted.webp` without checking them.

## New paintings needed

All of these must match the dusk-beach watercolour: the same light, palette, edge softness and brushwork. They are made the same way as the site's other painted art, with image generation from reference images on a flat magenta background for cut-outs.

1. **The door, closed and ajar, as separate layers:** the frame, the door leaf (so it can swing on its hinge), the warm light from inside, and the reflection on the wet sand. It's a free-standing wooden door, Filipino in feel, that looks like it belongs on that beach.
2. **The hanging Namit Gid sign:** a small painted board hung in front of the door, as its own layer so it can sway. The lettering matches the wordmark.
3. **Leny in the doorway:** lit from behind by the warm kitchen light, welcoming. It must look like the same Leny as `leny-painted.webp`.
4. **The dusk beach itself, repainted at a higher resolution** (Elvin agreed). The current `dusk-beach.webp` is 1584×672 and would blur when shot 4 zooms into the door. The new version keeps the same composition, palette and mood: palms on the left, the island on the horizon, the tide pool. The door is painted into its place, and the area around the door has to stay sharp at full zoom. Elvin approves it against the original before it replaces anything.
5. **The night version of the beach** for the footer, with the door shut and light under it. *(Builder's call: a new painting, or a careful night grade of the dusk painting plus a new door layer. Pick whichever looks right.)*

Paintings should be delivered at sizes that stay sharp after the zoom in shot 4. The door fills most of the screen just before the bloom.

**Order of work** *(my call)*: Claude makes the paintings. Elvin approves the door's position in both the wide and tall crops, then the finished door and Leny art, before any animation is tuned against them. The timeline can be built against rough placeholders while the art is in progress.

## Phones

- The dusk painting is wide (1584×672) and phones are tall, so on a phone the frame crops to the door and the island. The palms may be cut off. The door's position in the painting has to work for both shapes. Both the wide and tall crops are decided before the door art is made.
- The door is easy to tap on a 375 px wide screen.
- Shot 1 already handles phone sizes. Its final framing has to land on the phone crop of the painting, not the desktop one.

### Chosen door position and crops (approved by Elvin: candidate B, "pool left shore")

All numbers are fractions of the painting (1584x672; x from the left, y from the top). "aspect" means width / height of the scene section's own box (the section is 100svh tall, see below).

**DOOR = { x: 0.41, y: 0.82, w: 0.05 }.** x and y are the bottom-centre of the door on the wet sand left of the tide pool; w is the door's width (about 79 px of the painting). The door leaf is 1:2, about 158 px tall (0.235 of the height), so its top is at y 0.585, just under the horizon (y 0.558). The sign hangs in front of it near its top, within the door's width. The reflection falls on the sand below y 0.82 (to about y 0.90). The door clears the island (x 0.505-0.695, y 0.414-0.567) and the boat (x 0.63-0.85, y 0.696-0.84).

**Margin rule (applies to every crop):** keep at least 0.02 of the painting's width of clear picture on every side of the door (counting the sign and glow) and of the island. The door group therefore spans x 0.365-0.435 and the island x 0.505-0.695, so the **minimum visible box is x 0.365-0.715**, full height (y 0.414-0.90 matters most).

**Layout selector.**
- aspect >= 0.825 (that is, a plain cover crop shows at least the 0.35 window): **cover layout** (CROP_WIDE). This covers landscape phones, tablets in landscape, 16:9 and 21:9.
- aspect < 0.825: **band layout** (CROP_TALL). This covers 9:19.5 and 9:16 phones, portrait tablets (3:4 = 0.75) and 4:5 (0.8).
- Why 0.825: a cover crop shows win = aspect / 2.357 of the painting's width, and the band window is 0.35, so 0.35 x 2.357 = 0.825.

**CROP_WIDE (cover layout, `object-fit: cover`).** Visible window width win = min(1, aspect / 2.357). Wanted focal centre cx = 0.47 (palms stay on the left, door and island sit right of centre). Window left edge L = clamp(0.47 - win/2, 0.715 - win, 0.365), so the minimum visible box is always inside the window. Then `object-position-x = L / (1 - win)` (equivalently (cx - win/2) / (1 - win) once cx has been clamped). Example, 16:9: win 0.754, L 0.093, object-position 37.8%. When the box is wider than the painting (aspect > 2.357, e.g. 21:9 = 2.33 is just under; 32:9 is over) the full width shows and cover crops vertically instead: visible height vis = 2.357 / aspect, centred on y 0.66, so `object-position-y = clamp((0.66 - vis/2) / (1 - vis), 0, 1)`. For aspect up to 4.0 (vis 0.59) the visible band is at least y 0.365-0.955, so the island, the door and its reflection are always fully in view. The door is never cut vertically or horizontally on ultra-wide. At 21:9 (vis about 1.0) nothing is cropped. Door width at 1280 px viewport (16:9): about 85 px.

**CROP_TALL (band layout).** A plain cover crop would show only 19.6% of the width at 9:19.5, narrower than the island, so phones show the whole painting height as a band:
- Visible window width = **0.35**, focal centre x = **0.54**, so it spans x **0.365-0.715** (the minimum visible box, which gives 0.02 margin at both the door and the island). Scale the painting so this window fills the section width: painting width = 100% / 0.35 (about 286% of the section width), shifted left by 0.365 of the painting width. Band height = 672 / (0.35 x 1584) x section width, about 1.21 x width (455 CSS px on a 375 px phone). Door width about 53.6 CSS px on a 375 px phone (min 44).
- **Reference frame:** the scene section is 100svh tall (use svh, not vh or dvh, so it does not jump with the browser bars), and the door base sits at 70% of the section's own height. Band top = 0.70 x H - 0.82 x bandH. On 375x812: band top about 195 px. If this is negative (portrait tablets, where the band is taller than the screen), the band is simply cropped at the top and no sky extension is needed.
- **Above the band:** a vertical gradient on the section background, from the band's top-edge colour at the band top to a version about 22% darker (each RGB channel x 0.78), reaching full darkness about 130 CSS px above the band and **holding that colour from there to the top of the screen**. The band's top-edge colour is the painting's top 8 rows averaged over each third of the window, which is a horizontal gradient left/centre/right, sampled from the current dusk-beach.webp across x 0.365-0.715 (sampled at 5%, 50%, 95% of the window width, smoothed over +/-60 px): top-edge #9084bd / #988ac6 / #9f8ec6, darkened #706793 / #776c9a / #7c6f9a. Use a two-stop vertical gradient layered over a left-to-right gradient of those three colours. **These hex values come from the current painting. When Task 2 replaces dusk-beach.webp with the higher-resolution repaint, re-sample them with `tools/door-mock.mjs` (it prints skyHex and skyDarkHex).**
- **Seam between band and sky: colour-match, no fade** (the mock does exactly this). The extension starts at the band's top-edge colour, so no feathering is needed; a visible seam would be a bug in the sampled colours.
- **Below the band:** solid #1B1F32 to the bottom of the screen. The existing `.foot-scene::after` fade is part of the band, not the fill: it is the bottom 30% of the *painting* fading to #1B1F32, so it reaches #1B1F32 exactly at the band's bottom edge and the solid fill below it meets it with no seam. This space holds the "Tap the door" hint.
- Mock references: `Claude outputs/door-mocks/candidate-B-wide.png` and `candidate-B-tall.png` (regenerate with `node tools/door-mock.mjs`).

**Door art, first pass:** the door will first be a simple drawn door as layered SVG (frame, door leaf, light, reflection, sign), placed at the DOOR anchors above. It is swapped for the AI-painted door later at the same anchors, so keep the layer boundaries and anchors the same.

and then only moved. The animation must hold 60 fps on a mid-range phone.
- Respect `prefers-reduced-motion` and data saver as today.
- Bump `?v=` on changed CSS and JS. This site has no service worker.
- Work on the `redesign-preview` branch only. It deploys to https://redesign-preview.namit-gid.pages.dev, which is not indexed and doesn't send real orders. Nothing goes to `main` (the live namitgid.takoshi.ca) until Elvin has seen the preview and says so.

## Left to the builder

- Exact timings and eases, inside the durations above.
- How the wipe's brush edge is made (mask image, SVG, canvas), as long as it looks painted and stays smooth.
- How the page is structured underneath: one fixed scene that hands off to the scrolling page, or the beach as the first section. The rule is that after going in, you're in the kitchen with the normal page below. Scrolling back to the top shows the beach with the door ajar and no reverse animation.
- How to test the timeline frame by frame (today: `window.__ngIntro`, pause and seek, wait two animation frames before a screenshot).
