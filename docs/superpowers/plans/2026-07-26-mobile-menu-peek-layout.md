# Mobile Menu Peek Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked/centered mobile menu layout in `namit-gid-site/index.html` with a "peek" layout where each dish image bleeds off the alternating screen edge, and fix the affordance/motion/readability issues that surfaced when reviewing that layout.

**Architecture:** This is a single static HTML file (no build step, no framework, no test runner). All changes are CSS edits inside the existing `<style>` block plus one small addition to the existing vanilla-JS menu-building loop. Every task is a self-contained edit to `namit-gid-site/index.html`, verified by (a) a grep check that the exact new text landed and (b) a manual visual check by opening the file directly in a browser with the device toolbar set to 390px width.

**Tech Stack:** Plain HTML/CSS/JS. No package.json, no bundler, no test framework exists in this repo — do not introduce one.

## Global Constraints

- Only the mobile breakpoint (`@media (max-width: 720px)`) may change. Desktop/tablet layout (above 720px) must render identically to before — never remove or edit a rule outside a `max-width:720px` block.
- No new dependencies, build tooling, or test framework. Edit `namit-gid-site/index.html` directly.
- Peek amounts are three **fixed discrete values** — 17 / 20 / 23 (vw) — chosen by a `desc.length` threshold, not a continuously-scaled formula. Thresholds: `< 130` → 17, `130–145` → 20, `> 145` → 23.
- `body{overflow-x:hidden}` (already present, do not remove) is what makes the bled-off-edge images not produce a horizontal scrollbar — every task must preserve it.
- The order modal, Supabase submission logic, and the `[data-dish]` click-delegation handler are out of scope — do not touch them.

---

### Task 1: Peek layout mechanics (JS tier attribute + core mobile CSS)

**Files:**
- Modify: `namit-gid-site/index.html` (the JS menu-build loop, and two `@media (max-width: 720px)` blocks in the `<style>` section)

**Interfaces:**
- Consumes: `DISHES` array (each item has `.desc`, a string) — already defined earlier in the same `<script>` block.
- Produces: a `--peek` inline CSS custom property (unitless vw number: 17, 20, or 23) set on every `.dish-stage` element, which later tasks and the CSS below rely on via `var(--peek, 20)`.

- [ ] **Step 1: Confirm the current JS build loop is unmodified**

Run:
```bash
grep -n "const list = document.getElementById('menuList');" "namit-gid-site/index.html"
```
Expected: one match, followed a few lines later by `sec.innerHTML = \``. This confirms you're editing the right, not-yet-modified loop.

- [ ] **Step 2: Add the tier function and set `--peek` on each dish-stage**

Edit `namit-gid-site/index.html`. Find this exact block:

```html
const list = document.getElementById('menuList');
DISHES.forEach((d,i)=>{
  const sec = document.createElement('section');
  sec.className = 'menu-item';
  const fromL = i % 2 === 0;
  sec.innerHTML = `
    <div class="dish-stage ${fromL?'reveal-l':'reveal-r'}">
```

Replace it with:

```html
const list = document.getElementById('menuList');
function peekTier(desc){
  if(desc.length < 130) return 17;
  if(desc.length <= 145) return 20;
  return 23;
}
DISHES.forEach((d,i)=>{
  const sec = document.createElement('section');
  sec.className = 'menu-item';
  const fromL = i % 2 === 0;
  const peek = peekTier(d.desc);
  sec.innerHTML = `
    <div class="dish-stage ${fromL?'reveal-l':'reveal-r'}" style="--peek:${peek}">
```

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n "peekTier\|--peek:\${peek}" "namit-gid-site/index.html"
```
Expected: two matches — the `function peekTier(desc){` line and the `style="--peek:${peek}"` line.

- [ ] **Step 4: Replace the first mobile `.menu-item` CSS block**

Find this exact block (it comes right after the `.reveal-l,.reveal-r` rules, before the `/* ---------- story ---------- */` comment section):

```css
@media(max-width:720px){
  .menu-item{grid-template-columns:1fr;text-align:center}
  .menu-item:nth-child(even) .info{text-align:center;align-items:center;justify-self:center}
  .menu-item:nth-child(even) .dish-stage{order:0}
  .menu-item .info{align-items:center;justify-self:center}
}
```

Replace it with:

```css
@media(max-width:720px){
  .menu-item{
    display:flex;align-items:center;text-align:left;
    padding:1.8rem 0;gap:0;max-width:100%;
  }
  .menu-item .dish-stage{
    flex:0 0 auto;width:58vw;
    margin-left:calc(-1 * var(--peek, 20) * 1vw);
  }
  .menu-item .info{
    flex:1 1 auto;min-width:0;max-width:none;
    padding-right:1.1rem;text-align:left;align-items:flex-start;
  }
  .menu-item:nth-child(even){flex-direction:row-reverse}
  .menu-item:nth-child(even) .dish-stage{
    margin-left:0;margin-right:calc(-1 * var(--peek, 20) * 1vw);
  }
  .menu-item:nth-child(even) .info{
    padding-right:0;padding-left:1.1rem;
  }
}
```

- [ ] **Step 5: Remove the two conflicting rules in the second mobile block**

The file has a *second*, later `@media (max-width: 720px)` block (under the `/* ---------- mobile pass ---------- */` comment). Because it comes later in the file, its rules for the same selectors would otherwise override Step 4's rules. Find this exact block:

```css
  /* tighter menu rhythm, lighter shadows for scroll perf */
  .menu-item{padding:2rem 1.2rem;gap:1.1rem}
  .menu-item .dish-stage{width:min(70vw,300px)}
  .menu-item h3{font-size:1.55rem}
```

Replace it with (deleting the two conflicting lines, keeping the rest):

```css
  /* tighter menu rhythm, lighter shadows for scroll perf */
  .menu-item h3{font-size:1.55rem}
```

- [ ] **Step 6: Verify both CSS edits landed and the conflicting rules are gone**

Run:
```bash
grep -n "margin-left:calc(-1 \* var(--peek" "namit-gid-site/index.html"
grep -n "width:min(70vw,300px)" "namit-gid-site/index.html"
```
Expected: the first command prints one match (inside the new mobile block). The second command prints **no output** — confirming the old conflicting width rule is gone.

- [ ] **Step 7: Manual visual check**

Open `namit-gid-site/index.html` directly in a browser (double-click it, or drag the file into a browser tab). Open devtools, switch to the device toolbar, set width to 390px. Scroll past the hero to the menu section. Confirm:
- The first dish (Palabok Tray, odd position) has its image bleeding off the **left** edge, text to its right.
- The second dish (Baked Sushi Tray, even position) has its image bleeding off the **right** edge, text to its left.
- No horizontal scrollbar appears anywhere on the page.
- All description paragraphs are left-aligned, on both odd and even items.

- [ ] **Step 8: Commit**

```bash
git add namit-gid-site/index.html
git commit -m "feat: bleed mobile menu images off alternating screen edges"
```

---

### Task 2: Corner-aware badge anchoring

**Files:**
- Modify: `namit-gid-site/index.html` (the "mobile pass" `@media (max-width: 720px)` block)

**Interfaces:**
- Consumes: the odd/even alternation already established by Task 1 (`.menu-item:nth-child(even)`), and the existing `.badge{width:62px;height:62px;right:-2%;bottom:0}` mobile rule.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Confirm the current badge mobile rule is unmodified**

Run:
```bash
grep -n ".badge{width:62px;height:62px;right:-2%;bottom:0}" "namit-gid-site/index.html"
```
Expected: one match.

- [ ] **Step 2: Add the even-item mirror rule**

Find this exact line:

```css
  .badge{width:62px;height:62px;right:-2%;bottom:0}
```

Replace it with:

```css
  .badge{width:62px;height:62px;right:-2%;bottom:0}
  .menu-item:nth-child(even) .badge{right:auto;left:-2%}
```

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n ".menu-item:nth-child(even) .badge{right:auto;left:-2%}" "namit-gid-site/index.html"
```
Expected: one match.

- [ ] **Step 4: Manual visual check**

With devtools still at 390px width, scroll through all 7 menu items. Confirm the small rotating "tap to order · fresh batch" badge is visible on-screen for **every** item — anchored bottom-right on odd items (Palabok, Shawarma, Tiramisu, Banana) and bottom-left on even items (Sushi, Lumpia, Cheesecake). It should never be clipped off the edge of the viewport.

- [ ] **Step 5: Commit**

```bash
git add namit-gid-site/index.html
git commit -m "fix: anchor the rotating order badge to whichever corner stays on-screen"
```

---

### Task 3: Scope the hover "tap to order" overlay to hover-capable devices

**Files:**
- Modify: `namit-gid-site/index.html` (the `.dish-btn:hover::after` rule, desktop-scope CSS section)

**Interfaces:**
- Consumes: the existing `.dish-btn::after{...opacity:0;transition:opacity .3s}` base rule (untouched).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Confirm the current rule is unmodified**

Run:
```bash
grep -n ".dish-btn:hover::after,.dish-btn:focus-visible::after{opacity:1}" "namit-gid-site/index.html"
```
Expected: one match.

- [ ] **Step 2: Split hover out from focus, and scope it to real hover devices**

Find this exact line:

```css
.dish-btn:hover::after,.dish-btn:focus-visible::after{opacity:1}
```

Replace it with:

```css
.dish-btn:focus-visible::after{opacity:1}
@media (hover:hover) and (pointer:fine){
  .dish-btn:hover::after{opacity:1}
}
```

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n "@media (hover:hover) and (pointer:fine)" "namit-gid-site/index.html"
grep -n ".dish-btn:focus-visible::after{opacity:1}" "namit-gid-site/index.html"
```
Expected: both commands print one match each.

- [ ] **Step 4: Manual visual check**

At 390px width in devtools (which reports as a touch/no-hover context), confirm the dark "tap to order" overlay text no longer appears floating over a dish image on its own — the badge and the explicit "Order" button remain the visible affordances. Then switch devtools back to a normal desktop viewport and confirm hovering a dish image still shows the "tap to order" overlay as before (regression check — desktop behavior must be unchanged). Also Tab-focus a dish button with the keyboard and confirm the overlay still appears on focus (accessibility must be unaffected).

- [ ] **Step 5: Commit**

```bash
git add namit-gid-site/index.html
git commit -m "fix: only show the hover order overlay on devices with real hover"
```

---

### Task 4: Hide the giant outline word on mobile

**Files:**
- Modify: `namit-gid-site/index.html` (the "mobile pass" `@media (max-width: 720px)` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm the current mobile back-type rule is unmodified**

Run:
```bash
grep -n ".back-type.two{width:130%;font-size:clamp(2rem,10vw,3.2rem)}" "namit-gid-site/index.html"
```
Expected: one match.

- [ ] **Step 2: Add the hide rule**

Find this exact line:

```css
  .back-type.two{width:130%;font-size:clamp(2rem,10vw,3.2rem)}
```

Replace it with:

```css
  .back-type.two{width:130%;font-size:clamp(2rem,10vw,3.2rem)}
  .menu-item .back-type{display:none}
```

(Note: `.menu-item .back-type` has higher specificity than the plain `.back-type` rules above it, so this hides it on menu cards specifically without needing to touch the hero's own back-type usage — check there is none: the hero section does not use `.back-type` at all, only `.menu-item` sections do, so this selector only affects the menu.)

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n ".menu-item .back-type{display:none}" "namit-gid-site/index.html"
```
Expected: one match.

- [ ] **Step 4: Manual visual check**

At 390px width, scroll through the menu. Confirm the large stroked-outline word that used to sit behind each dish image (e.g. a huge outlined "PALABOK") no longer appears on any mobile menu card, and there is no leftover overlap or empty gap where it used to be.

- [ ] **Step 5: Commit**

```bash
git add namit-gid-site/index.html
git commit -m "fix: hide the giant outline word behind mobile menu images"
```

---

### Task 5: Calm the per-card motion on mobile

**Files:**
- Modify: `namit-gid-site/index.html` (the "mobile pass" `@media (max-width: 720px)` block)

**Interfaces:**
- Consumes: the existing `.dish-btn{animation:bob 5.5s ease-in-out infinite}` and `.dish-shadow{animation:shadowBreathe 5.5s ease-in-out infinite}` base rules (untouched at desktop width).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm the mobile-pass block's dish filter rule is unmodified (anchor point)**

Run:
```bash
grep -n ".dish-btn.natural img{filter:drop-shadow(0 10px 12px rgba(38,52,47,.26))}" "namit-gid-site/index.html"
```
Expected: one match.

- [ ] **Step 2: Add the motion-calming rules**

Find this exact line:

```css
  .dish-btn.natural img{filter:drop-shadow(0 10px 12px rgba(38,52,47,.26))}
```

Replace it with:

```css
  .dish-btn.natural img{filter:drop-shadow(0 10px 12px rgba(38,52,47,.26))}
  .dish-btn{animation:none}
  .dish-shadow{animation:none}
```

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n "  .dish-btn{animation:none}" "namit-gid-site/index.html"
grep -n "  .dish-shadow{animation:none}" "namit-gid-site/index.html"
```
Expected: one match each.

- [ ] **Step 4: Manual visual check**

At 390px width, watch a menu card for ~10 seconds. Confirm the dish image no longer bobs up and down and its shadow no longer pulses — both should sit still. Confirm the small rotating badge is the only thing still animating on the card. Then switch devtools to a desktop-width viewport and confirm the bob/shadow-breathe animations are still present there (regression check — desktop must be unaffected).

- [ ] **Step 5: Commit**

```bash
git add namit-gid-site/index.html
git commit -m "fix: stop the continuous bob/shadow animations on mobile menu cards"
```

---

### Task 6: Add a divider between stacked mobile menu cards

**Files:**
- Modify: `namit-gid-site/index.html` (the "mobile pass" `@media (max-width: 720px)` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm the mobile-pass block's desc font rule is unmodified (anchor point)**

Run:
```bash
grep -n ".menu-item .desc{font-size:.92rem}" "namit-gid-site/index.html"
```
Expected: one match.

- [ ] **Step 2: Add the divider rule**

Find this exact line:

```css
  .menu-item .desc{font-size:.92rem}
```

Replace it with:

```css
  .menu-item .desc{font-size:.92rem}
  .menu-item:not(:last-child){border-bottom:1px solid rgba(53,40,31,.12)}
```

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n ".menu-item:not(:last-child){border-bottom:1px solid rgba(53,40,31,.12)}" "namit-gid-site/index.html"
```
Expected: one match.

- [ ] **Step 4: Manual visual check**

At 390px width, scroll through the full menu. Confirm a thin horizontal line separates each stacked card from the next, and that the very last item (Banana Bread Loaf) has no trailing divider beneath it.

- [ ] **Step 5: Commit**

```bash
git add namit-gid-site/index.html
git commit -m "style: add a divider between stacked mobile menu cards"
```

---

## Final full-menu regression check (after all 6 tasks)

- [ ] Open `namit-gid-site/index.html` in a browser at 390px width and scroll through all 7 dishes end to end. Confirm: alternating bleed direction, no horizontal scrollbar, badge always visible and correctly anchored, no giant outline text, calm (non-bobbing) images, dividers between cards, left-aligned text throughout.
- [ ] Tap a dish image and confirm the order modal still opens correctly with the right dish name/price (regression check on the unmodified `[data-dish]` click handler).
- [ ] Widen devtools back past 720px and confirm the desktop layout (grid, centered dish stage, hover bob/shadow animations, back-type visible) is completely unchanged from before this plan.
