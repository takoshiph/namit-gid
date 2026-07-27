# Mobile menu: peek layout + affordance cleanup

**Date:** 2026-07-26
**Scope:** `namit-gid-site/index.html`, mobile breakpoint only (`max-width: 720px`). No changes to desktop/tablet layout, JS data model, or the order modal.

## Problem

The current mobile menu (`@media (max-width:720px)` block, `.menu-item` rules) stacks each dish image above its text, both centered. Validated against the live site in a phone-width preview — it works but feels flat and doesn't use the screen distinctively. Confirmed direction via visual mockups: each dish image should bleed off the left or right screen edge ("peek"), alternating per item, with its info text beside it in the remaining space.

Reviewing that peek layout surfaced several rough edges inherited from the existing desktop-first CSS that need fixing as part of this change, not deferred:

1. The circular rotating badge ("tap to order · fresh batch ·") is anchored to a fixed corner of the image box. Once the box bleeds off-screen on one side, the badge — for items peeking off the *right* — anchors to a point that's now off-screen too, making it invisible on roughly half the menu.
2. `.dish-btn::after` (a second "tap to order" overlay) only appears on `:hover`, which doesn't fire reliably on touch. It's redundant with the badge and the explicit "Order" button, and dead weight on mobile.
3. Even-indexed items currently right-align their info text to mirror the image side. Right-aligned multi-line body copy is harder to read; only the block's position on screen should mirror, not internal text alignment.
4. `.back-type` (the giant stroked-outline word behind the dish) is sized/centered for the old centered-stage layout. Once the stage bleeds off-edge, it will overlap the info column.
5. Continuous per-card animations (`bob` on the image, `shadowBreathe` on the shadow, `orbit` on the badge) all run simultaneously and independently per card. Stacked across 7 mobile cards this reads as busy rather than calm.
6. No visual separation between stacked full-bleed cards.

## Design

### Layout mechanics (`.menu-item` mobile block, replaces existing rules — not appended)

- `.menu-item`: `display:flex; align-items:center` per item, no horizontal padding (so the image can reach the true screen edge), vertical padding only.
- `.dish-stage`: fixed width (`58vw`), `flex:0 0 auto`. Bleeds via `margin-left: calc(-1 * var(--peek) * 1vw)` for odd items (peek left), `margin-right` for even items (peek right) — same odd/even parity already used for `fromL` in the existing JS build loop.
- `.info`: `flex:1 1 auto; min-width:0`, always left-aligned text (`text-align:left; align-items:flex-start`), regardless of which side of the screen it lands on. Only its position (which side) mirrors via `flex-direction:row-reverse` on even items — not its internal alignment.
- Even items use `flex-direction:row-reverse` to place info on the left, image bleeding right.

### Peek amount: discrete tiers, not continuous

Per-item bleed amount is picked from each dish's `desc` length at build time (in the existing `DISHES.forEach` loop, as a `style="--peek:NN"` attribute on `.dish-stage`) — three fixed tiers, not a continuous formula, so the result reads as a deliberate rhythm rather than a value silently leaking from a character count:

| desc length | tier | visible % | `--peek` (vw, of 58vw box) |
|---|---|---|---|
| < 130 chars | short | ~70% visible | 17 |
| 130–145 chars | medium | ~65% visible | 20 |
| > 145 chars | long | ~60% visible | 23 |

Against the current 7 dishes this gives: Cheesecake → short, Banana/Shawarma/Sushi/Palabok → medium, Lumpia/Tiramisu → long.

### Badge (rotating "tap to order · fresh batch") — corner-aware anchor

The badge must anchor to whichever corner stays on-screen — opposite the peek direction:

- Odd items (image peeks left) → badge stays at its current bottom-**right** anchor (already on-screen).
- Even items (image peeks right) → badge mirrors to bottom-**left** (`left:-2%` instead of `right:-2%`).

### Remove the hover-only overlay on touch

Scope `.dish-btn:hover::after` to `@media (hover:hover) and (pointer:fine)` so it only appears on devices that genuinely support hover (desktop/trackpad). Keep `:focus-visible::after` unscoped — that's keyboard accessibility, unrelated to touch. On mobile the badge becomes the sole persistent "tap to order" affordance, plus the explicit "Order" button already in the info column.

### Back-type (giant outline word)

Hide `.menu-item .back-type` entirely at the mobile breakpoint (`display:none`). It's a desktop-only flourish; on the bled-edge mobile layout it has no room to live without overlapping the info text, and isn't essential to the peek concept.

### Motion

At the mobile breakpoint, disable the continuous `bob` animation on `.dish-btn` and `shadowBreathe` on `.dish-shadow` (both decorative, both run forever, both compound with the badge's `orbit` to feel busy across 7 stacked cards). Keep the badge's `orbit` — it's slow (18s) and is now the sole "tap to order" cue on mobile, so it should stay animated. Keep the one-time `reveal-l`/`reveal-r` fade-in (fires once via `IntersectionObserver`, not continuous).

### Breathing room

Add a `1px` divider (`border-bottom:1px solid rgba(53,40,31,.12)`) between stacked `.menu-item`s at the mobile breakpoint (`:not(:last-child)`), plus the existing vertical padding, so cards don't read as one unbroken smear.

## Out of scope

- Desktop/tablet layout — untouched.
- The order modal, form, and Supabase submission logic — untouched.
- `prefers-reduced-motion` handling — the existing global rule already zeroes all animation/transition and continues to apply on top of this.

## Verification

Manual check in a phone-width browser view (390px, devtools device toolbar) after implementation:

- Every item's dish image bleeds off the correct alternating edge with no horizontal scrollbar (body already has `overflow-x:hidden`).
- The rotating badge is visible on-screen for every item, both odd and even.
- Description text is left-aligned on every item regardless of screen side.
- No visual overlap between the (now-hidden on mobile) back-type and the info text.
- Tapping the image opens the order modal (existing `[data-dish]` click delegation is unchanged).
- A thin divider is visible between stacked items.
