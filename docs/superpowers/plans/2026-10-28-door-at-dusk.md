# The Door at Dusk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the site's opening (the photo landing on Leny's sign) with one continuous shot: the lighthouse pull-back, a sunset wipe that reveals a door on the dusk beach, and an entrance through the door into the kitchen menu, plus a night-beach footer.

**Architecture:** The existing GSAP intro timeline in `app.js` keeps its pull-back. Everything from the shutter onwards is replaced by a wipe that reveals a new `#dusk` scene (the beach painting with door, sign and Leny layers). It replaces the `#hero` section. A separate `enterKitchen()` timeline plays the entrance and hands off to `#menu` under a full-screen light bloom. All motion is transform and opacity on pre-painted layers.

**Tech Stack:** Static HTML, CSS and JS on Cloudflare Pages. GSAP is already loaded. Paintings come from `tools/gemini-image.mjs` with the existing cut-out scripts in `tools/`. Verification uses the local preview server "namitgid" (port 5192, `?mock=1` for an open shop) in the built-in browser.

**Spec:** `docs/superpowers/specs/2026-10-28-door-at-dusk-design.md`

## Global Constraints

- **Branch:** work only on `redesign-preview`.
- **Pushing:** push only `redesign-preview`, which deploys to https://redesign-preview.namit-gid.pages.dev. Never push to `main` in this plan; Elvin decides that after seeing the preview.
- **Animation:** transform and opacity only. Layers are painted once and then only moved. Target 60 fps on a mid-range phone.
- **Calm mode:** `prefers-reduced-motion` and data saver (the existing `calm` class) get no idle animation and a crossfade for the entrance.
- **Versions:** bump `?v=` on `site.css` and `app.js` whenever they change. There is no service worker.
- **Header:** the Order button and "Skip to the menu" go straight to `#menu` at every moment, with no door animation.
- **Gemini key:** read only by `tools/gemini-image.mjs` from `~/.config/gemini/key`. Never print it, log it or commit it.
- **Art approval:** every new painting is shown to Elvin and approved before it's used.
- **Paintings:** match the dusk-beach watercolour (light, palette, brushwork). Cut-outs are generated on flat magenta `#FF00FF`.
- **Copy, exact:** "Kumain ka na? Tara, nagluto ako." / "Have you eaten? Come, I cooked." / "~Leny" / door button label "Come inside" / hint "Tap the door".

## Review Focus

1. **Rotating or resizing at the door.** The door stays on its painted spot and stays tappable in both the wide and tall crops. Test: Task 4.
2. **Tapping the door twice, or scrolling during the entrance.** The entrance runs once and ends in the kitchen. Test: Task 6.
3. **A slow network when the bloom peaks.** The bloom holds (up to 4 s) until `kitchen.webp` has loaded, so the kitchen never shows blank. Test: Task 6.
4. **Coming back to the top after entering.** The beach shows with the door ajar and no replay, and tapping enters again. Test: Task 6.
5. **Storage blocked, or a full tray.** If `localStorage` throws, the visitor is treated as a first-time visitor without errors. The tray bar never covers the door. Test: Tasks 4 and 5.

---

### Task 1: Door position on both crops (approval gate)

**Files:**
- Create: `tools/door-mock.mjs` (composites a placeholder door rectangle on `dusk-beach.webp`, wide 16:9 and tall 9:19.5 crops, writes PNGs to the scratchpad)

**Interfaces:**
- Produces: the constant `DOOR = { x, y, w }`, as fractions of the painting's width and height (x and y = the bottom-centre of the door on the sand, w = the door's width). It's recorded in the spec under "Phones" and used by Tasks 2 to 6. It also produces the two crop rules `CROP_WIDE` and `CROP_TALL` (the focal centre as fractions plus the minimum visible box).

- [ ] **Step 1:** Mock two or three candidate door spots on the wet sand near the tide pool, each in both crops. The island and the door must both be visible in the tall crop.
- [ ] **Step 2:** Send the mocks to Elvin (SendUserFile) and wait for him to pick one.
- [ ] **Step 3:** Write the chosen `DOOR`, `CROP_WIDE` and `CROP_TALL` into the spec's "Phones" section.
- [ ] **Step 4:** Commit the tool and the spec. Message: "Door at dusk: door position and crops".

### Task 2: Repaint the dusk beach at high resolution (approval gate)

**Files:**
- Create: `namit-gid-site/assets/img/dusk/beach-2400.webp`, `beach-4096.webp` (no door, island, boat or lamp; those stay separate layers, as in the footer today)
- Create: `namit-gid-site/assets/img/dusk/beach-door-crop.webp` (a high-detail crop around `DOOR`, about 3× the door's width, for the zoom)

**Interfaces:**
- Consumes: `DOOR` from Task 1.
- Produces: the image paths above, the same aspect ratio as `dusk-beach.webp` (1584:672), and the door crop's bounds as painting fractions (`DOOR_CROP = { x, y, w, h }`).

- [ ] **Step 1:** Generate with `node tools/gemini-image.mjs --ref namit-gid-site/assets/img/dusk-beach.webp --size 4K --aspect 21:9 --n 2`. The prompt asks for the same painting, same composition, at a higher resolution, with the sand by `DOOR` left clear.
- [ ] **Step 2:** Show Elvin the original and the repaint side by side. Wait for his approval, and iterate if needed.
- [ ] **Step 3:** Export the two sizes and the door crop as webp (quality 82).
- [ ] **Step 4:** Commit. Message: "Door at dusk: dusk beach repainted at high resolution".

### Task 3: Door, sign, Leny and night art (approval gate)

**Files:**
- Create in `namit-gid-site/assets/img/dusk/`:
  - `door-frame.webp`
  - `door-leaf.webp` (hinge on its left edge)
  - `door-light.webp` (the warm spill from inside, plus the pool on the sand)
  - `door-reflect.webp`
  - `sign.webp` (its hanging point at the top centre)
  - `leny-door.webp` (Leny lit from behind, framed to the door opening)
  - `beach-night-2400.webp` (the night grade of the repaint)
  - `door-closed-night.webp` (shut, with light under it and in its window)

**Interfaces:**
- Consumes: `DOOR`, the Task 2 beach and `leny-painted.webp` as a reference for Leny's likeness.
- Produces: all files cut on transparency, each with its anchor, recorded as a comment block at the top of the dusk section of `site.css`: the pixel offsets of the hinge, the sign's hanging point and the door opening.

- [ ] **Step 1:** Generate the door pieces and the sign on magenta with Task 2's beach as reference, then cut them with the existing cut-out scripts.
- [ ] **Step 2:** Generate Leny in the doorway with `leny-painted.webp` and the door as references.
- [ ] **Step 3:** Make the night beach. Try a night grade of the repaint first, and only generate a new painting if the grade looks flat.
- [ ] **Step 4:** Composite a still of the full door scene and a still of the night scene. Show both to Elvin and wait for his approval.
- [ ] **Step 5:** Commit. Message: "Door at dusk: door, sign, Leny and night paintings".

### Task 4: The dusk scene replaces the hero

**Files:**
- Modify: `namit-gid-site/index.html`. Replace `<section class="hero" id="hero">` (lines ~144–195) with `<section class="dusk" id="dusk">`. It contains the beach, island, lamp, boat and door layers, the `<h1>`, the caption and `<button class="door" id="door" aria-label="Come inside">`.
- Modify: `namit-gid-site/assets/css/site.css`. Remove the hero, sign, badge and shore rules. Add the `.dusk` scene, the crops, the idle loops and `.door-hint`.
- Modify: `namit-gid-site/assets/js/app.js`. Remove the hero-only code: `reveal()`'s sign glide, and the plank, badge, shore and emblem `clearProps`.

**Interfaces:**
- Consumes: Tasks 1 to 3 assets, `DOOR`, `CROP_WIDE` and `CROP_TALL`.
- Produces:
  - `#dusk`, a full-viewport section (100svh), the first child of `main`.
  - Layer ids `#duskBeach`, `#duskIsle`, `#duskDoor` (wrapper), `#doorLeaf`, `#doorLight`, `#doorSign`, `#doorLeny`, `#doorHint`.
  - The CSS var `--door-x` / `--door-y` (px, set by JS from `DOOR` and the current crop on resize).
  - The function `placeDusk(): void`, called on load and resize.
  - The class `html.at-door`, meaning the visitor is on the beach and the idle loops run. The idle loops are paused under `.calm`.
  - The `<h1>` holds "Namit Gid · Filipino food in North York" as a visible caption line, with the pickup line and `#nextPickup` beneath it.

- [ ] **Step 1: Write the failing check.** In the browser at `http://localhost:5192/?mock=1` with the 375×812 and 1280×800 viewports, `javascript_tool` asserts that the `#door` bounding box is entirely inside the viewport, at least 44 px wide, and within 2 px of `--door-x`/`--door-y` after `dispatchEvent(new Event('resize'))`. It should fail now, because `#door` doesn't exist.
- [ ] **Step 2:** Build the markup, CSS and `placeDusk()`. The tall crop is used when the viewport's aspect ratio is under 1. Each layer is positioned in painting fractions inside one box sized with `object-fit: cover` maths from `CROP_*`.
- [ ] **Step 3:** Add the idle life:
  - The sign sways ±2° on a 3.2 s sine loop, with its transform origin at the hanging point.
  - The door light breathes between opacity .75 and 1 over 2.6 s.
  - Reuse the footer's `.fireflies`.
  - The lighthouse uses the footer's `lamp-flash`.
  - `#doorHint` fades in after 3 s at the door without a tap or scroll.
- [ ] **Step 4:** Hide the tray bar while `html.at-door` is set.
- [ ] **Step 5:** Run the Step 1 check at both sizes and confirm it passes. Also check that the tray bar is hidden with a tray of one item at the door, and that the page loads without console errors when `localStorage` is stubbed to throw.
- [ ] **Step 6:** Bump `site.css?v=` and `app.js?v=`, then commit. Message: "Door at dusk: the beach with the door replaces the hero".

### Task 5: Shot 1 and the sunset wipe

**Files:**
- Modify: `namit-gid-site/assets/js/app.js`, in `playIntro()`. Delete everything from `// ── the viewfinder, then the shutter ──` through the Leny rise. Extend the pull-back and add the wipe.
- Modify: `namit-gid-site/index.html`. Remove `#stFinder`, `#bladeTop`, `#bladeBot` and `#stFlash` from `#stage`. Add `<svg id="wipeEdge">` (or a mask image) for the brush edge.
- Modify: `namit-gid-site/assets/css/site.css`. Remove the finder, blade and flash rules. Add the wipe edge styles.
- Modify: the head script in `index.html`. Use the `intro` class only when `localStorage['ng-seen-intro'] !== '1'`, inside try/catch. Otherwise the class is `at-door` (or `calm`). If `location.hash === '#menu'`, there's no intro and no `at-door`: the page opens in the kitchen.

**Interfaces:**
- Consumes: `#dusk`, `placeDusk()`, `DOOR` and `html.at-door` from Task 4.
- Produces:
  - The timeline labels `pullEnd` and `wipeEnd` on `window.__ngIntro`.
  - The function `toDoor(): void`. It ends the intro (kills `tl`, removes `#stage`), sets `html.at-door` and writes `ng-seen-intro = '1'`. Skip, scroll intent during the intro, and the end of the wipe all call it.

- [ ] **Step 1: Write the failing checks.** With `__ngIntro.pause()` and `seek()`, waiting two animation frames after each seek:
  - At `pullEnd`, the stage island's bounding box is within 3% of the viewport size of `#duskIsle`'s box. The match cut lands.
  - At `wipeEnd`, `#stage` is gone, `html` has `at-door`, and `localStorage['ng-seen-intro'] === '1'`.
  - At the label midpoint (`(pullEnd + wipeEnd) / 2`), `#doorSign`'s rotation is not 0, so the swing is playing.
  - On reload with the flag set, `html` has `at-door` and not `intro`, and `#stage` is absent.
- [ ] **Step 2:** Extend the pull-back so that the stage planes end on the `#dusk` framing for the current crop. Compute the island's target box from `#duskIsle` and solve the scale and translate as the old photo-flight did with `k`/`sx`/`sy`. The ease is `power3.out`, so it is still drifting as the wipe starts. The wipe starts `.3 s` before `pullEnd`.
- [ ] **Step 3:** Add the wipe:
  - `#dusk` sits above `#stage`, revealed by a left-to-right mask, 1.5 s, `power2.inOut`.
  - The brush edge and a gold band (`#F5C35E` → transparent, 6% of the viewport width) ride the mask edge.
  - `#doorSign` swings when the edge passes `DOOR.x`: `rotation` from 7° to 0 with `elastic.out(1, .4)` over 1.2 s.
  - The stage's light-written word fades as the edge passes it, and `#doorSign` glows briefly.
- [ ] **Step 4:** Wire the inputs to `toDoor()`: Skip, scroll, swipe or a key during the intro, and the timeline's `onComplete`.
- [ ] **Step 5:** Run the Step 1 checks at 375×812 and 1280×800 and confirm they pass. Screenshot 5 frames across the wipe for the record.
- [ ] **Step 6:** Bump the versions and commit. Message: "Door at dusk: pull back onto the painting, then the sunset wipe".

### Task 6: Going in (the entrance) and the kitchen greeting

**Files:**
- Modify: `namit-gid-site/assets/js/app.js`. Add `enterKitchen()` and rewrite `onScrollIntent` for the at-door state.
- Modify: `namit-gid-site/index.html`. In `#menu .sec-head`, replace `<h2 id="menuH">Smells good in here.</h2>` with the greeting `<h2 id="menuH" lang="tl">` holding "Kumain ka na? Tara, nagluto ako.", followed by `<p class="translation">Have you eaten? Come, I cooked.</p><p class="sig">~Leny</p>`. Keep the "Follow your nose…" line. Add the full-screen `<div class="bloom" id="bloom">`.
- Modify: `namit-gid-site/assets/css/site.css`. Add the bloom styles (a radial warm white, `#FFF4DC` centre, from `DOOR`) and the greeting styles (reuse the old hero h1 type).

**Interfaces:**
- Consumes: `toDoor()`, `html.at-door` and the `#door*` layer ids.
- Produces:
  - `enterKitchen(): Promise<void>`. It's guarded by an `entering` flag (a second call returns the same promise). It removes `at-door`, ends with `#menu` at the top of the viewport, and moves keyboard focus to `#menuH`.
  - The timeline `window.__ngEnter` with the labels `push`, `bloomPeak` and `settled`.
  - `preloadKitchen(): Promise<void>`, which resolves when `kitchen.webp?v=2` has decoded. It starts at the wipe (Task 5) or on landing at the door.

- [ ] **Step 1: Write the failing checks.** Run `enterKitchen()` with `__ngEnter` paused and seeked:
  - At `bloomPeak`, `#bloom`'s opacity is 1.
  - At `settled`, `#menu`'s top is within 2 px of the header height, `html` lacks `at-door`, and `document.activeElement.id === 'menuH'`.
  - Calling `enterKitchen()` twice returns the same promise, and there is one `__ngEnter`.
  - With `kitchen.webp` blocked (`read_network_requests` confirms it isn't loaded, simulated by delaying `preloadKitchen`), the timeline stays at `bloomPeak` until it resolves, or for 4 s.
  - Scrolling back to the top after `settled` shows `#dusk` with `#doorLeaf` ajar and doesn't replay. A second door tap enters again.
  - The Order link from the door scrolls to `#menu` without creating `__ngEnter`.
- [ ] **Step 2:** Build the timeline, about 2 s in all:
  - **Anticipation:** `#doorLeaf` scales to 0.98 over 0.15 s.
  - **Push and swing:** the camera pushes in (scaling `#dusk`'s layer box toward `DOOR`, `power2.in`), and at +0.1 s the door leaf swings open (`rotateY` 0 → −75° about the hinge, with `perspective` on `#duskDoor`, 0.9 s, `power2.out`). As the leaf opens, `#doorLeny` and `#doorLight` fade up.
  - **Leny beat:** about 0.35 s while the push slows but does not stop.
  - **Through the doorway:** the push speeds up through the opening, and `#bloom` runs 0 → 1 (`bloomPeak`).
  - **Under the bloom:** await `preloadKitchen()`, jump to `#menu` (`scrollTo` without smooth), and swap `#duskBeach` to `beach-door-crop.webp` before the deep zoom so it stays sharp.
  - **Settle:** `#bloom` runs 1 → 0, the kitchen goes from scale 1.03 to 1 (`power3.out`, 0.6 s), and the greeting lines rise in with a stagger (as the old hero h1 did) (`settled`).
- [ ] **Step 3:** In calm mode, `enterKitchen()` crossfades `#bloom` in and out over 0.4 s each with no camera move.
- [ ] **Step 4:** Connect the door: click, Enter and Space on `#door`, and scroll intent while `at-door`, call `enterKitchen()`. The Order button and `#menu` links bypass it.
- [ ] **Step 5:** Run the Step 1 checks at both sizes and confirm they pass. Measure the frame times across `__ngEnter` played at normal speed with a `requestAnimationFrame` logger. The 95th percentile should be ≤ 20 ms on desktop. Note the result.
- [ ] **Step 6:** Bump the versions and commit. Message: "Door at dusk: through the door into the kitchen, Leny's greeting inside".

### Task 7: The night bookend in the footer

**Files:**
- Modify: `namit-gid-site/index.html`, in `.foot-scene`. Swap `dusk-beach.webp` for `dusk/beach-night-2400.webp` and add `door-closed-night.webp` at `DOOR`. Keep the island, boat, lamp and fireflies.
- Modify: `namit-gid-site/assets/css/site.css`. Add the night door position (the same `DOOR` fractions) and the light under the door, which breathes. Calm mode has no breathing.
- Modify: `namit-gid-site/assets/js/app.js`. When `.foot` first becomes 50% visible (the existing `foot.live` observer), the door light dims once (opacity 1 → .55 → 1 over 1.2 s).

**Interfaces:**
- Consumes: `DOOR` and the Task 3 night assets.

- [ ] **Step 1: Write the failing check.** `.foot-scene img[src*="beach-night"]` exists, and the closed door's centre is within 2 px of `DOOR` mapped into `.foot-scene` at both viewport sizes.
- [ ] **Step 2:** Build it.
- [ ] **Step 3:** Run the check and confirm it passes. Take a screenshot of the footer at both sizes.
- [ ] **Step 4:** Bump the versions and commit. Message: "Door at dusk: the footer is the same beach at night".

### Task 8: Clean-up, full run and the preview deploy

**Files:**
- Modify: `index.html`, `site.css` and `app.js`. Remove anything left unused by the old hero and photo flight (`#shore`, `.plank`, `.badge`, `#lenyArms`, `.hero-frond`, `.frame-slot`, and the shore cloud code). Before deleting `sign-board.webp` and `leny-painted.webp`, grep `review-card.html` and `tools/` for them; keep them if they're used. Keep the old `dusk-beach.webp` until Elvin approves main.

- [ ] **Step 1:** Grep for every id and class removed in Tasks 4 to 7. There should be no references left in the html, css or js.
- [ ] **Step 2:** Do a full run at 375×812 and 1280×800 with no console errors. Check:
  - a first visit: intro → wipe → door → enter → kitchen → footer;
  - a reload: it lands on the door;
  - calm mode;
  - Skip mid-intro;
  - Order mid-intro;
  - a `#menu` deep link;
  - adding a dish and placing a mock order (the order flow is unchanged).
- [ ] **Step 3:** Commit. Message: "Door at dusk: remove the old hero and photo flight". Push with `git push origin redesign-preview`. Never push to main.
- [ ] **Step 4:** Open https://redesign-preview.namit-gid.pages.dev (with `localStorage` cleared) and repeat the first-visit run there. Send Elvin the link and a short screen recording or frames. Ask whether it goes to main.
