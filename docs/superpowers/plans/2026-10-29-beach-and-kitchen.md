# Two Places: Beach and Kitchen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the one long page into two places, the dusk beach (outside) and the kitchen (inside), joined only by the door. Add:
- a way to step back outside,
- sideways panning along the beach,
- the footer's information moved onto the beach as text written in the light and four tappable things on the sand,
- better dawn waves and sand in the intro.

**Architecture:**
- **Two places in one page.** The two places stay in the same page. Exactly one is shown at a time, by html class:
  - `html.at-door` is the beach.
  - `html.inside` is the kitchen.
  - The document itself never scrolls between them.
- **Going in.** `enterKitchen()` keeps its animation. Its under-bloom `swap()` switches the place instead of scrolling.
- **Coming out.** A new `leaveKitchen()` plays the entrance in reverse.
- **Panning.** The beach pans by adding a horizontal offset to the painting box that `placeDusk()` already positions.
- **Beach info.** Items are buttons inside that box, so they move with the painting. The caption and the © line are fixed to the screen.

**Tech Stack:**
- Static HTML, CSS and JS (`namit-gid-site/`), deployed by Cloudflare Pages. GSAP is already loaded.
- Art comes from `tools/gemini-image.mjs` plus `tools/magenta-key.js`.
- Verification uses the local server "namitgid" (port 5192; `?mock=1` opens the shop, `?intro` replays the intro) in the built-in browser, with `javascript_tool` checks.

**Spec:** `docs/superpowers/specs/2026-10-29-beach-and-kitchen-design.md` (read it. It is the authority; this plan argues from it.)

## Global Constraints

- **Branch:** `redesign-preview` only. Push only `redesign-preview`, which deploys to https://redesign-preview.namit-gid.pages.dev. Never touch or push `main`.
- **Versions:** bump `site.css?v=` and `app.js?v=` in `index.html` on every change to them. There is no service worker.
- **Animation:** transforms and opacity only, GSAP as the site already uses it. No snapping, no dead stops.
- **Calm** (`html.calm`: reduced motion or data saver): no camera moves and no gesture hint. Crossfades only. Panning and every tap target still work.
- **Touch targets** are at least 44 px. Phones work down to 360 px wide.
- **Content in the HTML:** the caption, the © line and every item card's text and links are in `index.html`, not only added by script.
- **No arrows, chevrons or "scroll" prompts on the beach.** The step-outside icon is a doorway, never an arrow.
- **Gemini key:** read only by `tools/gemini-image.mjs` from `~/.config/gemini/key`. Never print, log or commit it.
- **Art approval:** Elvin approves new paintings before they are used.
- **Copy, exact:**
  - Bar control inside: "Outside".
  - Item labels: "A note from Leny", "Say hi", "Leave a review", "Takoshi".
  - Bottle letter: "*Namit gid* means “Ang sarap!” (really delicious) and I cook so every home I feed says it too. ~Leny".
  - Shell card: `orders@takoshi.ca` (mailto) and "Facebook · Messenger · Instagram" (plain text, keeping the footer's `todo` class).
  - Octopus card: "Craving takoyaki? I make that too, at Takoshi →", linking to https://takoshi.ca.
  - © line: "© 2026 Namit Gid · Privacy · Terms", linking to https://takoshi.ca/privacy.html and https://takoshi.ca/terms.html.
  - Existing door copy is unchanged.

## Review Focus

1. **Android back gesture or iOS edge swipe in the kitchen.** It steps outside and does not leave the site. With a dish or tray sheet open, Back closes the sheet first (the dialog's own behaviour) and stays inside. Test: Task 2.
2. **Rotating the phone while panned, or while inside.** The beach re-places, the pan is clamped to the new range, and stepping outside lands on the door view. Test: Task 3.
3. **A swipe that starts on an item.** It pans and does not open the item's card. Only a tap opens it. Test: Task 4.
4. **Arriving on `/#menu`, `?review=1`, or after "Start a new order".** Each lands in the right place with a working Outside, and Back never jumps between places twice. Tests: Tasks 1 and 2.
5. **Pressing Outside mid-entrance, Order mid-exit, or the door twice.** It always ends settled in one place, with no bloom left on screen and no stuck class. Test: Task 2.

---

### Task 1: The kitchen is its own place

**Files:**
- Modify: `namit-gid-site/assets/js/app.js`
  - `enterKitchen()`'s `swap()`: switch place, don't `scrollTo`.
  - `toKitchen`, `leaveDoor`, `syncDoor`.
  - The scroll and wheel handlers around lines 1640–1720: remove scroll-into-kitchen (Ruling 6), `syncDoor` scroll restoration and the `focusin` leave.
  - The start-up branch at the end.
- Modify: `namit-gid-site/assets/css/site.css`
  - `html.at-door`: only `#dusk` shows. Hide `#menu` and `#foot`.
  - `html.inside`: only `#menu` shows, filling the screen under the bar.
  - The document never scrolls in either place.
  - Tighten `.sec-head` spacing if the kitchen doesn't fit one screen.
- Modify: `namit-gid-site/index.html`, the head script. Opening on `#menu` sets `inside`.

**Interfaces:**
- Produces:
  - **Place classes.** After the intro, exactly one of `html.at-door` (beach) or `html.inside` (kitchen) is set.
  - `setPlace(place: 'beach' | 'kitchen', { push = false } = {}): void`. It sets the classes, focuses `#menuH` (kitchen) or `#door` (beach), and when `push` is true calls `history.pushState({ place: 'kitchen' }, '', '#menu')`.
  - `enterKitchen()` keeps its signature and `window.__ngEnter` labels. Its `swap()` calls `setPlace('kitchen', { push: true })`.
  - Order, "Skip to the menu", and any `a[href="#menu"]`:
    - **At the beach:** Order calls `enterKitchen()` (the spec's "Order plays the entrance"); "Skip to the menu" calls `setPlace('kitchen', { push: true })` with no animation.
    - **Mid-entrance:** `finishEntering()`.
  - A `hashchange` to `#menu` (from "Start a new order") calls `setPlace('kitchen')` and adds no extra push.

- [ ] **Step 1: Write the failing checks** (at `http://localhost:5192/?mock=1`, 375×812 and 1280×720):
  - After `await enterKitchen()`:
    - `html` has `inside` and not `at-door`.
    - `getComputedStyle(document.getElementById('dusk')).display === 'none'`.
    - `#foot` is not displayed.
    - `document.scrollingElement.scrollHeight <= innerHeight + 1` at 1280×720.
    - `location.hash === '#menu'`.
    - `history.length` grew by exactly 1.
  - `window.scrollBy(0, 500)` then `dispatchEvent(new WheelEvent('wheel', { deltaY: 500 }))` leaves `#menu`'s `getBoundingClientRect().top` unchanged and `html` still `inside`.
  - Loading `/?mock=1#menu` gives `html.inside` with no animation.
  - Loading `/?mock=1` gives `html.at-door`, and a vertical wheel at the door leaves `html` without `inside`.
- [ ] **Step 2:** Run the checks and confirm they fail (today the page scrolls to `#menu`).
- [ ] **Step 3:** Implement `setPlace()`, the CSS, the new `swap()`, and the routing above. Keep calm's crossfade entrance.
  - Delete the scroll-intent entry and `syncDoor`'s scroll logic.
  - Keep the `hold` handling only where the intro still needs it.
  - Make the kitchen fit one screen at 360×640 and 1280×720, falling back to scrolling within `#menu` only (`overflow-y: auto` on the room, not the document).
- [ ] **Step 4:** Run the checks at both sizes, plus 360×640, and confirm they pass. Also check that a full order still goes through (`?mock=1`: add a dish, open the tray, step through to the confirmation). The page should have no console errors.
- [ ] **Step 5:** Bump the versions and commit. Message: "Two places: the kitchen is its own room".

### Task 2: Stepping outside

**Files:**
- Modify: `namit-gid-site/index.html`. In `.bar`, inside: a `<button class="bar-out" id="barOut">` with an inline doorway SVG and the text "Outside". It shows only in `html.inside`; Order shows only in `html.at-door`.
- Modify: `namit-gid-site/assets/js/app.js`. Add `leaveKitchen()`, the `popstate` handling and `#barOut`.
- Modify: `namit-gid-site/assets/css/site.css`. Add `.bar-out`, and pause the beach's idle loops while `html.inside`. The `.dusk.live` observer already gates them; make sure a hidden `#dusk` counts as not live.

**Interfaces:**
- Consumes: `setPlace()` and the place classes from Task 1.
- Produces:
  - `leaveKitchen(): Promise<void>`, exposed as `window.leaveKitchen`. It plays `window.__ngLeave` with the labels `bloomPeak` (beach swapped in under the bloom), `closed` (door leaf back to its resting `rotateY(14deg)`) and `settled`.
    - Under the bloom it calls `setPlace('beach')` and resets the pan to the door view (Task 3's `panTo(doorPan(), { instant: true })` once it exists; until then, a no-op).
    - The camera then runs `enterKitchen()`'s push backwards: zoomed in on the doorway with Leny at `xPercent: -42`, she steps back, the leaf swings to rest, and the camera eases out to rest.
    - Total 1.2–1.6 s. Calm gets a crossfade.
  - **Outside button:**
    - If `history.state?.place === 'kitchen'` and the visitor came in through the door this page load, it calls `history.back()`.
    - Otherwise it calls `history.replaceState(null, '', location.pathname + location.search)` and then `leaveKitchen()`.
  - **`popstate`:**
    - Arriving on a state that isn't the kitchen while `html.inside` calls `leaveKitchen()`.
    - Arriving on `{ place: 'kitchen' }` while at the beach calls `setPlace('kitchen')` instantly (Forward).
  - A second call to `leaveKitchen()` while it runs returns the same promise.
  - `enterKitchen()` mid-exit, and `leaveKitchen()` mid-entrance, finish the running move first, then run.

- [ ] **Step 1: Write the failing checks:**
  - Enter through the door, then `history.back()`. After `await` of the `__ngLeave` completion: `html.at-door`, `#menu` hidden, `location.hash === ''`, and the leaf's computed transform equals its idle CSS transform.
  - Enter, click `#barOut`: the same end state, and `history.length` is unchanged afterwards.
  - Load `/#menu`, click `#barOut`: at the beach, and `location.hash === ''`.
  - With a dish sheet open inside, call `document.getElementById('dishSheet').close()` (stands in for Back on a modal), then `history.back()`: it ends at the beach once, not twice.
  - Click the door, then immediately click `#barOut` (mid-entrance): it ends at the beach, `#bloom` has opacity 0, and no `entering` class.
  - Seek `__ngLeave` to `bloomPeak` and screenshot, then to `closed` and screenshot (for the record).
- [ ] **Step 2:** Run the checks and confirm they fail.
- [ ] **Step 3:** Implement the above. Reuse `pushEase`, the `cam` / `setCam` mapping and the bloom from `enterKitchen()`; factor the shared camera setup into one helper rather than copying it.
- [ ] **Step 4:** Run the checks at 375×812 and 1280×720 and confirm they pass, also in calm (emulate `prefers-reduced-motion`). Then do a by-hand round trip, beach → kitchen → beach → kitchen, and check that the tray count survives.
- [ ] **Step 5:** Bump the versions and commit. Message: "Two places: step outside through the door".

### Task 3: Walking along the beach

**Files:**
- Modify: `namit-gid-site/assets/js/app.js`:
  - `placeDusk()` adds the pan offset.
  - A pan controller: pointer, touch, wheel and keys.
  - The gesture hint.
- Modify: `namit-gid-site/assets/css/site.css`:
  - `.dusk` gets `touch-action: pan-y pinch-zoom` while the beach pans (horizontal handled by JS).
  - The caption and the © line stay fixed to the screen.
  - The `.pan-hint` fingertip and its trail.
- Modify: `namit-gid-site/index.html`. Add `<i class="pan-hint" id="panHint" aria-hidden="true"></i>` in `#dusk`.

**Interfaces:**
- Consumes: `placeDusk()`, `CROP_WIDE`/`CROP_TALL`, `DOOR`, and the place classes.
- Produces:
  - **Functions:**
    - `panRange(): { min: number, max: number }`: the painting's px offset limits for this screen.
    - `doorPan(): number`: the offset of today's door-centred framing.
    - `panTo(x: number, { instant?: boolean, velocity?: number } = {}): void`.
  - **CSS vars:** `--pan` (px) on `#dusk`, and `--art-x` already includes it.
  - **Pan rules:**
    - Panning is enabled only when `max - min >= 24`. It is 1:1 under the finger, with momentum on release and a rubber-band past the ends (resistance, then it eases back).
    - Wheel: horizontal deltas pan. Vertical deltas pan only for a mouse wheel (`deltaMode !== 0`, or `|deltaY|` ≥ 50 with no `deltaX` in the same event). Trackpad vertical does nothing.
    - Keys: ← and → pan, ¼ screen per press, eased.
  - **On resize or rotate:** keep the same painting point at screen centre, clamped to the new range. `doorPan()` is used on entering the beach.
  - **Gesture hint:**
    - It plays when the beach is shown, panning is enabled, not calm, and `localStorage['ng-seen-pan'] !== '1'`.
    - It starts 3.5 s after landing at the door.
    - Fingertip: opacity 0 → .85; slide 22 vw left over 1.1 s, `power2.inOut`, with a trail; then fade out.
    - Then it sets the flag (inside try/catch).
    - Any pan, or a tap on the door, cancels it and sets the flag.
  - Nothing at the beach enters the kitchen except the door and Order.

- [ ] **Step 1: Write the failing checks** (375×812, 844×390 and 1280×720):
  - `panRange().max - panRange().min > 24` at 375×812.
  - Dispatching pointer events for a 120 px leftward drag on `#dusk`:
    - `#duskBeach`'s left moves by 120 ± 2 px,
    - then settles within the range after release,
    - and `html` is still `at-door`.
  - `#door` stays aligned with `--door-x` (2 px) after the pan.
  - The caption's `getBoundingClientRect()` is unchanged by the pan.
  - A vertical `WheelEvent({ deltaY: 120, deltaMode: 1 })` pans; `WheelEvent({ deltaY: 4 })` with `deltaMode: 0` does not pan and does not enter.
  - After panning to `max`, resizing to 812×375 keeps the pan within the new range.
  - With `ng-seen-pan` cleared, `#panHint` animates once after ~3.5 s, and the flag is then `'1'`. On reload it does not animate.
- [ ] **Step 2:** Run the checks and confirm they fail.
- [ ] **Step 3:** Implement the pan controller, the `placeDusk()` offset and the hint. Then switch Task 2's `leaveKitchen()` call to `panTo(doorPan(), { instant: true })`.
- [ ] **Step 4:** Run the checks at all three sizes and confirm they pass. Record a phone-size drag with screenshots at 3 positions. Check that the enter and leave animations still frame the door correctly from a panned start (enter from max pan).
- [ ] **Step 5:** Bump the versions and commit. Message: "Two places: walk along the beach".

### Task 4: The beach holds the information

**Files:**
- Modify: `namit-gid-site/index.html`:
  - Inside `#duskArt`, four `<button class="beach-item" data-item="bottle|shell|sand|octopus">`, each with a placeholder `<i class="beach-item-art">`, a label `<span class="beach-tag">`, and its card.
  - A `<p class="dusk-legal">` with the © line, fixed to the screen.
  - Delete `<footer class="foot">` entirely.
- Modify: `namit-gid-site/assets/css/site.css`:
  - Item placement in painting fractions.
  - Placeholder glows, the lift on hover/focus/press, and the cards.
  - Delete the `.foot*` rules.
- Modify: `namit-gid-site/assets/js/app.js`:
  - Opening and closing cards (one at a time; ×, Escape, outside tap or a pan closes).
  - The sand item calls `openReview()`.
  - Focus pans the item into view.
  - Fireflies drift to items.
  - Delete the footer code: the `.foot-glow` and dim-once observer near line 1010, and `#footReview`'s handler. `?review=1` keeps working.
- Delete: `assets/img/dusk/beach-night-2400.webp` and `assets/img/dusk/door-closed-night.svg`, only if nothing else references them (grep the site and tools first).

**Interfaces:**
- Consumes: `panTo()` and `panRange()` from Task 3, and `openReview()`.
- Produces:
  - **Item areas**, in painting fractions (the spec's table), centre points:
    - bottle (.16, .84)
    - shell (.29, .76)
    - sand (.57, .89)
    - octopus (.91, .80)
  - **Placement rule:** no item or label may intersect `#duskDoor`, `#duskIsle`, `.dusk-boat`, or the caption at any pan or size.
  - **Cards:** `.beach-card`, one per item, holding the spec's exact copy. The sand item has no card; it opens the review sheet directly.
  - **Tap vs pan:** an item opens only on a pointerup within 8 px and 300 ms of its pointerdown.

- [ ] **Step 1: Write the failing checks** (375×812 and 1280×720):
  - `document.querySelectorAll('.beach-item').length === 4`, and each has an accessible name equal to its label.
  - The bottle card's text includes "Ang sarap!" and the shell card has `a[href="mailto:orders@takoshi.ca"]`, both in the HTML at load (check with `fetch(location.href).then(r => r.text())`).
  - For every pan in `[min, doorPan(), max]`: no `.beach-item` or `.beach-tag` rect intersects `#duskDoor`, `#duskIsle`, `.dusk-boat` or `.dusk-caption`.
  - A pointerdown on the bottle, a 60 px move, then pointerup: no card open, and the beach panned.
  - Clicking the bottle opens its card; Escape closes it.
  - Clicking the sand item opens `#sheet` in review mode.
  - `#foot` doesn't exist, and `.dusk-legal` links to both URLs.
- [ ] **Step 2:** Run the checks and confirm they fail.
- [ ] **Step 3:** Implement with plain glowing placeholder shapes at the anchors. If an area can't satisfy the placement rule at some size, move the centre within the spec's area. If it still can't, move the label to the other side.
- [ ] **Step 4:** Run the checks at both sizes, plus 844×390 and 360×640, and confirm they pass. Tab through the beach: each item comes into view as it gets focus.
- [ ] **Step 5:** Bump the versions and commit. Message: "Two places: the beach holds the information".

### Task 5: Paint the four things on the sand (approval gate)

**Files:**
- Create: `namit-gid-site/assets/img/dusk/item-bottle.webp`, `item-shell.webp`, `item-sand.webp` (writing in the sand with a stick standing beside it), `item-octopus.webp` (a small octopus peeking from a tide pool). Each is a transparent cut-out at least 2× its largest displayed size.
- Modify: `namit-gid-site/assets/css/site.css` and `index.html`. Swap each placeholder `<i class="beach-item-art">` for an `<img>`.

**Interfaces:**
- Consumes: the item anchors from Task 4.

- [ ] **Step 1:** For each item, generate with `node tools/gemini-image.mjs` using `--ref namit-gid-site/assets/img/dusk/beach-2400.webp`, on flat magenta `#FF00FF`, lit by dusk, matching the painting's watercolour (light, palette, edge softness, brushwork). Then key it with `node tools/magenta-key.js`.
- [ ] **Step 2:** Composite all four into the beach at their anchors (1280×720 and a 375×812 strip), send the composites to Elvin, and wait for his approval. Iterate as he asks.
- [ ] **Step 3:** Swap the placeholders for the approved art. Keep the glow and lift, now tied to the art's shape (a drop-shadow glow).
- [ ] **Step 4:** Rerun Task 4's placement checks and confirm they pass.
- [ ] **Step 5:** Bump the versions and commit. Message: "Two places: the painted bottle, shell, sand note and octopus".

### Task 6: Dawn waves and sand that become the painting's

**Files:**
- Modify: `namit-gid-site/assets/js/app.js`, `buildSea()` and the dawn sea/shore tweens in `playIntro()`.
- Modify: `namit-gid-site/assets/css/site.css`, the `.st-sea`, `.st-sand`, `#stWash` / `#stLip` / `#stWet` rules.
- Create (if needed): `namit-gid-site/assets/img/dusk/dawn-sand.webp` and wave-stroke strips sampled from `beach-2400.webp`, regraded to dawn with a small node tool in `tools/` (for example `tools/dawn-grade.js`).

**Interfaces:**
- Consumes: the match-cut anchors in `playIntro()`: `HORIZON = .558`, `SHORE = .74`, `at(fx, fy)`, and `art`.
- Produces:
  - **Waves:** strokes sampled from the painting roll toward the shore, as `y` and `scale` motion, never sideways only. They are small, slow and dense near the horizon, and larger and sparser near the shore.
  - **Shoreline:** a broken foam edge washes up and draws back on a ~3 s cycle, leaving a darker wet band that fades over ~1.5 s.
  - **Sand:** the painting's sand texture and its wet, sky-reflecting pool (about x .2–.8, y .74–.85), graded to dawn. The pool is placed on the painting's own pool, so nightfall changes only its colour.
  - `lowEnd` keeps a lighter path: fewer wave strokes and no swash shimmer.

- [ ] **Step 1: Write the failing check.** At `__ngIntro` `pullEnd`, sample the pixel colour along y = `art.top + art.height * .8` at five x positions on both the stage and the painting (the stage via a screenshot, the painting with `#stage` hidden). For each sample, the dawn sand's luminance pattern (pool vs dry) must match the painting's: pool where the painting has pool. Today it fails, because the dawn sand is flat.
- [ ] **Step 2:** Run it and confirm it fails.
- [ ] **Step 3:** Build the sampled strips, the dawn grade, the wave motion and the swash.
- [ ] **Step 4:** Run the check and confirm it passes. Then screenshot frames at `pullEnd - 1`, `pullEnd` and mid-nightfall at 375×812 and 1280×720, and send them to Elvin for a look (not a gate). Check that the low-end path holds 60 fps in the Performance panel at 4× CPU throttle with `html.low-end`.
- [ ] **Step 5:** Bump the versions and commit. Message: "Intro: waves roll in and the sand becomes the painting's".

### Task 7: Clean-up, full run and the preview deploy

**Files:**
- Modify: whatever the full run turns up. Remove dead code and CSS left from the footer, the scroll-to-kitchen logic and the wipe (grep for `foot`, `syncDoor`, `wipe-gold`, `wipeEnd`).

- [ ] **Step 1:** Grep for leftovers (`foot-`, `#foot`, `syncDoor`, `scrollRestoration`, `wipe-gold`, `wipeEnd`) and remove anything unused.
- [ ] **Step 2:** Do a full by-hand run at 375×812, 844×390 and 1280×720:
  - first visit (`?intro`) → nightfall → pan hint → tap each item → enter → order → Outside → Back/Forward → reload on `#menu` → calm mode.
  - There should be no console errors throughout.
- [ ] **Step 3:** Bump the versions, commit ("Two places: clean-up"), and push `redesign-preview`. Confirm the preview serves the new `?v=` values and that `#foot` is gone (`get_page_text` on https://redesign-preview.namit-gid.pages.dev).
