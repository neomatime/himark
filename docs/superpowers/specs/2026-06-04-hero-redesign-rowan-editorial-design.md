# HIMARK landing hero — Rowan-editorial redesign

**Date:** 2026-06-04
**Status:** Draft for user review
**Scope:** Replace `home.html` hero section only. All other sections (doctrine pillars, orbit, deep-dive, image marquee, anchor, principals) are out of scope and remain unchanged.

## Goal

The current home hero is a sticky cinematic 300-frame canvas that the visitor scrubs through scroll. It costs ~5MB of JPEG sequence to load and pushes the brand toward "tech demo" rather than "considered consultancy". The user is unhappy with it.

Replace it with a Rowan-style editorial hero — asymmetric photograph + content panel, ALL CAPS pain-to-partner headline, single CTA into Atlas, soft scroll-driven transition into the doctrine pillars below.

## Reference

[Rowan & Hill Legal Advisors landing template](https://unbounce.com/landing-page-template/rowan-legal-consulting-page/) — sibling consultancy positioning. Same compositional discipline (asymmetric split, B&W photo, ALL CAPS editorial typography, abundant negative space, single CTA, monochrome palette). HIMARK becomes a tonal sibling.

## Design decisions

These were resolved through user Q&A during brainstorming:

| Decision | Chosen | Rejected alternates |
|---|---|---|
| Aesthetic fidelity to Rowan | Full vibe — asymmetric split + typography + restraint + monochrome | Single-element borrowing |
| Scope | Hero only | Rowan-pure (strip everything) / Rowan-lite (re-treat all sections) / hybrid |
| Left panel content | B&W architectural minimalism | Principal portrait / abstract texture / typography-led |
| Headline stance | Pain → Partner (Rowan's exact pattern) | Conviction / Position / Outcome-forward |
| Primary CTA | Single — `BEGIN WITH ATLAS ↗` | Apply-only / two CTAs / single inline line |
| Motion | Initial reveal + scroll-mask transition | Reveal-only / parallax drift / ambient detail |

## Layout

100vh asymmetric two-column split.

```
┌──────────────────────────────────────────────────────────────┐
│  [HIMARK lockup]              [topnav links] [BEGIN W/ATLAS]│  ← existing sticky glass nav
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                              │                               │
│    ┌────────────────┐        │   ░░░ negative space ░░░     │
│    │                │        │                               │
│    │   B&W modern   │        │   ── 1px vertical hairline ──│
│    │  architectural │        │                               │
│    │   photograph   │        │      EYEBROW · ALL CAPS       │
│    │                │        │                               │
│    │   ~40% vw      │        │      WHEN GROWTH STALLS,      │
│    │                │        │      YOU NEED MORE THAN       │
│    │                │        │      A CONSULTANT.            │
│    │                │        │      YOU NEED A PARTNER.      │
│    │                │        │                               │
│    │                │        │      Supporting paragraph...  │
│    │                │        │      ──                       │
│    │  ⊥ H mark      │        │      BEGIN WITH ATLAS  ↗      │
│    └────────────────┘        │                               │
└──────────────────────────────────────────────────────────────┘
```

- **Split ratio**: 40% image / 60% content
- **Image side**: full-bleed B&W photograph; HIMARK H mark bottom-left
- **Content side**: cream `--off` background; content positioned in lower 60%; upper 40% is intentional negative space
- **Vertical hairline** at the image/content boundary: 1px, ocean at 30% opacity
- **Horizontal hairline** below the paragraph: 1px, midnight at 12% opacity, width 80px

The existing sticky glass topnav sits above the hero unchanged.

## Content + copy

### Eyebrow
```
—  STRATEGIC GROWTH CONSULTANCY  ·  RANDBURG  ·  BY APPLICATION
```
Mono, ALL CAPS, ocean, with a 24px leading dash rule.

### Headline (3 lines, locked structure)
```
WHEN GROWTH STALLS,
YOU NEED MORE THAN A CONSULTANT.
YOU NEED A PARTNER.
```
Pain → False-answer → Real-answer. The word "CONSULTANT" deliberately reclaims the category HIMARK is technically inside.

### Supporting paragraph
```
HIMARK is a strategic growth consultancy for founder-led firms ready to compound.
We design and operate the brand, demand, and AI infrastructure beneath your next
chapter — anchored by a senior principal, by application only.
```
Three jobs: name the firm + category, name the audience, name the operating model. ~50 words, matching Rowan's density.

### CTA
```
BEGIN WITH ATLAS  ↗
```
Mono uppercase, no button chrome — text + arrow only. Underline animates in on hover. Click opens Atlas in the existing chat widget via the apply-link interceptor in `main.js`.

### Brand mark on photograph
Inline SVG of the framed-H glyph, 32×40px, white stroke at 60% opacity, positioned bottom-left at 32px inset. Same glyph used in the topnav lockup — reads as the firm's stamp on the artwork.

## Visual treatment

### Typography

| Element | Family | Weight | Size (desktop) | Treatment |
|---|---|---|---|---|
| Eyebrow | `var(--f-mono)` | 500 | 10px | ALL CAPS, letter-spacing .22em, `--ocean` |
| Headline | `var(--f-disp)` Source Sans 3 | **700** | clamp(40px, 4.4vw, 56px) | ALL CAPS, letter-spacing .005em, line-height 1.06, `--midnight` |
| Paragraph | `var(--f-body)` Roboto | 300 | 14px | sentence case, line-height 1.75, `--ink-mut`, max-width 440px |
| CTA label | `var(--f-mono)` | 600 | 11px | ALL CAPS, letter-spacing .18em, `--midnight`, underline-on-hover |

The headline shifts from the current light weight 300 to **heavy weight 700** — short, ALL CAPS, bold lines do the talking, as in Rowan.

### Colour palette

All variables already exist in `:root`. No additions needed.

- `--off` `#F7F7F5` — content panel background (matches Rowan's parchment)
- `--midnight` `#1C2B3A` — headline + ink
- `--ocean` `#5F8190` — eyebrow + hairlines + brand mark
- `--ocean-lt` `#8AADB8` — secondary text + hover states

### Image processing
Desaturate to true B&W in CSS: `filter: grayscale(1) contrast(1.05)`. Lets us swap stock images later without re-processing.

### Image sourcing (initial)
Unsplash stock — architectural photographers like Sergei Akulich, Joel Filipe, or similar (free for commercial use). Eventual replacement with a commissioned shoot (Johannesburg-specific) is a future task and out of scope for this work.

- File path: `images/home-hero.jpg`
- Dimensions: ~1600×2000px portrait, JPEG q80, target <200KB
- CSS: `object-fit: cover; object-position: center`

## Motion behaviour

### Initial reveal (on first paint)
Sequenced cascade:
1. Image fades in: `opacity 0 → 1` over 600ms, ease-out
2. Eyebrow translates up: `translateY(12px) → 0` + `opacity 0 → 1`, 500ms, delay 200ms
3. Headline same, delay 320ms (each line in sequence with a 100ms internal stagger — three sub-elements)
4. Paragraph same, delay 540ms
5. Horizontal hairline draws in from left: `scaleX(0 → 1) transform-origin: left`, 400ms, delay 700ms
6. CTA fades in: `opacity 0 → 1`, 400ms, delay 820ms

Total reveal: ~1.2s from page paint.

### Scroll-mask transition (as visitor scrolls past)
Once the visitor begins to scroll, the **doctrine pillars section below emerges through a soft mask** — like a glass plate sliding up over the hero. Implementation: the doctrine section is wrapped in a `position: relative` container with a top edge that has a subtle blur + translucency gradient (matches the existing glass UI system), and as the visitor scrolls, it visually overrides the hero from below.

Effect: the hero doesn't "leave" the page — the next section glides over it. Cinematic without being noisy.

### Reduced motion
`@media (prefers-reduced-motion: reduce)` neutralises all of the above. Image and content paint instantly at their final state. Scroll behaviour stays normal.

## Responsive behaviour

### Tablet (768px–1024px)
- Split ratio adjusts to 38/62
- Headline size scales down: clamp(32px, 4.5vw, 44px)
- Brand mark on photo scales to 28×35px

### Mobile (<768px)
- **Stack vertically**: photograph on top (~45vh), content below (~55vh)
- Vertical hairline collapses out, horizontal hairline stays
- Headline size: clamp(28px, 7vw, 36px)
- Paragraph max-width drops to 100% (with padding)
- Brand mark on photo positions to bottom-right with 20px inset
- Negative space pattern flips — small space above eyebrow, content takes most of the panel

### Small mobile (<400px)
- Photograph compresses to ~40vh
- Headline drops to a single weight-700 line with three `<br>` breaks (no scaling beyond the clamp floor)

## Integration with existing code

### Files touched
- `home.html` — replace lines 2119–2133 (existing hero markup) with new hero structure
- `home.html` inline `<style>` — add new hero CSS in the page's existing inline style block (replacing the existing `.hero-*` rules)
- `main/main.js` — the existing 300-frame canvas IIFE (lines 976–1121) becomes dead code; remove it and the `<canvas>` element it drives. The `.hero-spacer` 300vh runway also removes
- `images/home-hero.jpg` — new asset, user provides or sources from Unsplash

### Files NOT touched
- All other home.html sections (doctrine pillars, orbit, deep-dive, marquee, anchor, principals)
- `images/hero-scroll/` directory (300 frame JPEGs) — left in place for now; can be deleted in a separate cleanup commit
- `styles/styles.css` — all changes scoped to the inline `<style>` block in `home.html`

### Reusing existing patterns
- Sticky glass topnav: unchanged. Already styled correctly.
- Apply-link interceptor: existing logic in `main.js` handles `[data-page="intake"]` and `data-open-atlas` patterns. New CTA uses `data-open-atlas` so the click → Atlas-open path works without rewiring.
- Glass UI vocabulary: photograph side gets a subtle inner shadow on its right edge to read as "set into the page" rather than floating — pulls from the established glass pattern.

### Click behaviour
```html
<a href="#" data-open-atlas class="hero-cta">
  <span>BEGIN WITH ATLAS</span>
  <span class="hero-cta-arrow" aria-hidden="true">↗</span>
</a>
```
Existing main.js click interceptor opens the chat panel and seeds Atlas's first turn. No new JS needed.

## What's deliberately NOT in this design

- No carousel, no testimonials, no logos in the hero
- No video, no canvas, no animated SVG illustrations
- No second CTA, no nav-style "scroll to section" affordance
- No multi-language toggle, no accessibility skip-link in the hero (the existing sitewide skip-link is sufficient)

## Testing approach

This is a visual / layout change. No automated tests. Manual verification:

1. **Desktop browsers**: Chrome, Safari, Firefox, Edge at 1440×900 and 1920×1080
2. **Mobile**: iPhone Safari (390×844) and Android Chrome (360×800)
3. **Reduced motion**: macOS System Settings → Accessibility → Display → Reduce motion
4. **Cold-start render**: throttle to slow 3G in DevTools, confirm no FOUC
5. **CTA click path**: tap `BEGIN WITH ATLAS` → confirm Atlas opens, seeds first turn, no page nav
6. **Topnav behaviour**: glass nav still translucent over the new hero, scroll shadow still fires
7. **Section transition**: scroll past hero → doctrine pillars emerge through scroll-mask cleanly

## Future work (out of scope)

- Commissioned architectural photo shoot (Johannesburg-specific)
- Mobile-first hero variant if analytics show 60%+ mobile traffic
- Hero copy A/B testing once the new design ships
- Extending the same Rowan-editorial discipline to other pages (services, apply, contact)
