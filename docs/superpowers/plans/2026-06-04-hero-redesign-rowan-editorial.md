# Home Hero — Rowan-editorial Redesign · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cinematic 300-frame canvas hero on `home.html` with a Rowan-style asymmetric editorial hero — 40% B&W architectural photograph + 60% cream content panel with ALL CAPS Pain→Partner headline, single `BEGIN WITH ATLAS` CTA, and a soft scroll-mask transition into the doctrine pillars below.

**Architecture:** All changes scoped to `home.html` inline styles + markup + a single deletion in `main/main.js`. No changes to `styles/styles.css`, no changes to other home sections (doctrine / orbit / deep-dive / marquee / anchor / principals). The new CTA reuses the existing apply-link interceptor (no new JS). The scroll-mask transition is pure CSS via a `::before` pseudo on `.home-doctrine`.

**Tech Stack:** Plain HTML + CSS + a small JS deletion. No build step. Vercel auto-deploys on push to main.

**Spec:** `docs/superpowers/specs/2026-06-04-hero-redesign-rowan-editorial-design.md`

---

## File map

| File | Action | Where |
|---|---|---|
| `home.html` | Modify | Replace lines **2119–2140** (hero `<section>` + `<div class="hero-spacer">`); remove all `.hero-*` and `.home-hero-cta*` rules from the inline `<style>` block; add ~250 lines of new inline CSS |
| `main/main.js` | Modify | Delete lines **1328–1473** (the 300-frame canvas IIFE — entire `(function(){ const page=document.getElementById('page-home'); ... })();` block) |
| `images/home-hero.jpg` | Create | New asset (1600×2000px portrait B&W architectural photo, ~180KB). Layout still works without it via a dark fallback background |

`images/hero-scroll/` (the 300 frame JPEGs) is **left in place** for now — separate cleanup commit later.

---

## Reusable patterns already in the codebase (no new code needed)

1. **Apply-link interceptor** at `main/main.js:2481–2503` — catches clicks on any `<a href="apply.html">`, opens the chat panel via `chatTgl.click()`, then seeds Atlas's first turn with "I'd like to apply" via `window.sQ()`. The new hero CTA uses this exact pattern: `<a href="apply.html" class="hero-cta">`. No new JS.

2. **HIMARK H mark SVG** already exists in the topnav lockup at `home.html:2076–2080` — same `<svg viewBox="0 0 140 200">` can be inlined into the new hero photo overlay.

3. **CSS custom properties** for colours (`--off`, `--midnight`, `--ocean`, `--ocean-lt`, `--ink-mut`) and fonts (`--f-disp`, `--f-body`, `--f-mono`) are already defined in `styles/styles.css :root`. No additions.

---

### Task 1: Verify the CTA interceptor + spike the new CTA in dev

**Files:**
- Read: `main/main.js:2481–2503`

This is a research task — no code change. Confirms the planned CTA wiring before any layout work begins.

- [ ] **Step 1: Read the existing apply-link interceptor**

Open `main/main.js` and read lines 2481–2503. Confirm the regex on line 2489: `/^\/?(?:\.{1,2}\/)*apply\.html(?:[?#].*)?$/` matches `apply.html`, `/apply.html`, `./apply.html`. Confirm the click handler calls `chatTgl.click()` and seeds via `sQ()`.

- [ ] **Step 2: Spike test in browser DevTools console**

In a deployed page (or local dev), paste in DevTools console:
```js
const a = document.createElement('a');
a.href = 'apply.html';
a.textContent = 'spike';
document.body.appendChild(a);
a.click();
```
Expected: chat panel opens, Atlas greets, "I'd like to apply" appears as the user's first message about 900ms later.

- [ ] **Step 3: Confirm and commit nothing**

The interceptor works. The new hero CTA `<a href="apply.html" class="hero-cta">BEGIN WITH ATLAS ↗</a>` will fire it. No code change in this task — proceed to Task 2.

---

### Task 2: Replace the hero markup in home.html

**Files:**
- Modify: `home.html:2119–2140`

Replace the cinematic hero section + the 300vh scroll runway with the new asymmetric editorial hero. The new markup is layout-only — CSS is added in Task 3.

- [ ] **Step 1: Verify current line range**

Run:
```bash
sed -n '2119,2140p' home.html
```
Expected: shows `<section class="hero snap-section">` at the top, `<div class="hero-spacer" aria-hidden="true"></div>` at the bottom (line 2140).

- [ ] **Step 2: Replace lines 2119–2140 with the new hero markup**

Using the Edit tool, replace the entire block (old hero `<section>` through the `hero-spacer` `<div>`, inclusive) with:

```html
<section class="hero" aria-label="HIMARK · founder-led growth">
<div class="hero-grid">

<!-- LEFT — B&W architectural photograph + brand mark -->
<div class="hero-photo" aria-hidden="true">
<div class="hero-photo-img"></div>
<svg class="hero-photo-mark" viewBox="0 0 140 200" width="32" height="40" aria-hidden="true" focusable="false">
<g fill="#ffffff">
<rect x="14" y="14" width="38" height="170"/>
<rect x="88" y="14" width="38" height="170"/>
<rect x="52" y="85" width="16" height="30"/>
<rect x="72" y="85" width="16" height="30"/>
</g>
<rect x="4" y="4" width="132" height="192" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="square" stroke-linejoin="miter"/>
</svg>
</div>

<!-- VERTICAL HAIRLINE between photo and content -->
<div class="hero-rule" aria-hidden="true"></div>

<!-- RIGHT — content panel -->
<div class="hero-content">
<p class="hero-eyebrow"><span class="hero-eyebrow-rule" aria-hidden="true"></span>STRATEGIC GROWTH CONSULTANCY  ·  RANDBURG  ·  BY APPLICATION</p>
<h1 class="hero-hl">
<span>WHEN GROWTH STALLS,</span>
<span>YOU NEED MORE THAN A CONSULTANT.</span>
<span>YOU NEED A PARTNER.</span>
</h1>
<p class="hero-sub">HIMARK is a strategic growth consultancy for founder-led firms ready to compound. We design and operate the brand, demand, and AI infrastructure beneath your next chapter — anchored by a senior principal, by application only.</p>
<div class="hero-h-rule" aria-hidden="true"></div>
<a href="apply.html" class="hero-cta">
<span class="hero-cta-l">BEGIN WITH ATLAS</span>
<span class="hero-cta-arrow" aria-hidden="true">↗</span>
</a>
</div>

</div>
</section>
```

- [ ] **Step 3: Verify markup change**

Run:
```bash
grep -nE "class=\"hero\"|class=\"hero-grid\"|hero-photo|hero-content|hero-cta\b" home.html | head -10
```
Expected: the new class names appear once each; `hero-canvas`, `hero-spacer`, `hero-video`, `hero-meta-row` no longer appear in this region.

Run:
```bash
grep -nE "hero-canvas|hero-spacer|hero-video" home.html
```
Expected: no output (zero matches).

- [ ] **Step 4: Open the page locally**

Run a local preview (any of `python -m http.server 8000`, `npx serve`, or just open `home.html` in a browser). Expected: the hero area looks completely broken — unstyled stacked text. That's correct; CSS comes next.

- [ ] **Step 5: Commit**

```bash
git add home.html
git commit -m "hero: replace cinematic canvas with editorial asymmetric markup"
```

---

### Task 3: Remove the old hero CSS + add new desktop layout & typography

**Files:**
- Modify: `home.html` inline `<style>` block

Strip every old `.hero-*` and `.home-hero-cta*` rule from the inline style block. Add the new hero layout + typography in their place. Desktop only at this point — responsive comes in Task 7.

- [ ] **Step 1: Find and audit the old hero CSS rules**

Run:
```bash
grep -nE "^\s*\.hero[\s\.\{]|\.home-hero-cta|\.hero-spacer|\.hero-canvas|\.hero-video|\.hero-c\s*\{|\.hero-eyebrow|\.hero-hl|\.hero-meta|\.hero-cta" home.html | head -40
```
Expected: a list of every old hero CSS rule with line numbers. Note the line ranges to remove. Most are in the inline `<style>` block in the `<head>` of `home.html`.

- [ ] **Step 2: Delete every old `.hero-*` and `.home-hero-cta*` rule**

Use Edit to remove each rule (and its `@media` variants) from the inline `<style>` block. After deletion, run the same grep again and confirm zero matches.

Run:
```bash
grep -nE "^\s*\.hero[\s\.\{]|\.home-hero-cta|\.hero-canvas|\.hero-video|\.hero-spacer|\.hero-c\s*\{|\.hero-eyebrow|\.hero-hl|\.hero-meta" home.html
```
Expected: no output (zero matches).

- [ ] **Step 3: Add the new hero CSS to the inline `<style>` block**

Insert the following near the end of the existing inline `<style>` block in `home.html` (just before the `</style>` tag — exact location doesn't matter, but keep all hero CSS together):

```css
/* ============================================================
   HERO — Rowan-editorial asymmetric split
   ============================================================ */
.hero{
  position:relative;
  width:100%;
  height:100vh;
  min-height:680px;
  background:var(--off);
  overflow:hidden;
}
.hero-grid{
  display:grid;
  grid-template-columns:40% 1px 1fr;
  height:100%;
  width:100%;
}

/* LEFT — photograph + brand mark */
.hero-photo{
  position:relative;
  background:#0E1822;    /* dark fallback when image hasn't loaded */
  overflow:hidden;
}
.hero-photo-img{
  position:absolute;
  inset:0;
  background-image:url('images/home-hero.jpg');
  background-size:cover;
  background-position:center;
  filter:grayscale(1) contrast(1.05);
}
.hero-photo-mark{
  position:absolute;
  bottom:32px;
  left:32px;
  opacity:.55;
  z-index:1;
}

/* VERTICAL HAIRLINE between photo and content */
.hero-rule{
  background:rgba(95,129,144,.30);
  width:1px;
  height:100%;
}

/* RIGHT — content panel */
.hero-content{
  position:relative;
  padding:0 clamp(40px, 6vw, 88px) clamp(80px, 10vh, 120px);
  display:flex;
  flex-direction:column;
  justify-content:flex-end;   /* content sits in lower portion */
  align-items:flex-start;
  gap:18px;
  max-width:680px;
}

/* Eyebrow */
.hero-eyebrow{
  font-family:var(--f-mono);
  font-size:10px;
  font-weight:500;
  letter-spacing:.22em;
  text-transform:uppercase;
  color:var(--ocean);
  margin:0;
  display:flex;
  align-items:center;
  gap:14px;
  line-height:1.6;
}
.hero-eyebrow-rule{
  display:inline-block;
  width:24px;
  height:1px;
  background:var(--ocean);
  flex-shrink:0;
}

/* Headline */
.hero-hl{
  font-family:var(--f-disp);
  font-weight:700;
  font-size:clamp(40px, 4.4vw, 56px);
  letter-spacing:.005em;
  line-height:1.06;
  color:var(--midnight);
  text-transform:uppercase;
  margin:8px 0 12px;
  max-width:560px;
}
.hero-hl > span{ display:block; }

/* Supporting paragraph */
.hero-sub{
  font-family:var(--f-body);
  font-weight:300;
  font-size:14px;
  line-height:1.75;
  color:var(--ink-mut);
  max-width:440px;
  margin:0;
}

/* Horizontal compositional hairline above the CTA */
.hero-h-rule{
  width:80px;
  height:1px;
  background:rgba(28,43,58,.12);
  margin:18px 0 6px;
}

/* CTA — text + arrow only, no button chrome */
.hero-cta{
  display:inline-flex;
  align-items:center;
  gap:14px;
  font-family:var(--f-mono);
  font-size:11px;
  font-weight:600;
  letter-spacing:.18em;
  text-transform:uppercase;
  color:var(--midnight);
  text-decoration:none;
  padding:6px 0;
  border-bottom:1px solid transparent;
  cursor:none;
  transition:border-color .25s var(--ease), gap .35s var(--ease), color .25s var(--ease);
}
.hero-cta:hover,
.hero-cta:focus-visible{
  border-bottom-color:var(--midnight);
  gap:18px;
  outline:none;
  color:#000;
}
.hero-cta-arrow{
  font-size:14px;
  line-height:1;
  transition:transform .35s var(--ease);
}
.hero-cta:hover .hero-cta-arrow{
  transform:translate(3px, -3px);
}
```

- [ ] **Step 4: Reload the local preview**

Refresh the browser. Expected: the hero now shows a 40/60 split — left side is dark (image hasn't been placed yet, fallback `#0E1822` is showing); right side shows the eyebrow + headline + paragraph + CTA in the proper editorial typography. Content sits in the lower 60% of the right panel.

- [ ] **Step 5: Commit**

```bash
git add home.html
git commit -m "hero: desktop layout + typography for editorial split"
```

---

### Task 4: Add a placeholder hero image OR confirm asset will be supplied

**Files:**
- Create (optional): `images/home-hero.jpg`

Without an image, the left panel shows a dark fallback. With one, the hero is complete. The user has not supplied an image yet; this task documents the placeholder path.

- [ ] **Step 1: Decide between two paths**

**Path A — user supplies the image now:** Drop a 1600×2000px portrait B&W architectural JPEG at `images/home-hero.jpg`. Skip to Step 2.

**Path B — proceed with the dark fallback for now:** No file. The CSS in Task 3 includes `background:#0E1822` fallback on `.hero-photo`. The page looks intentional (dark panel with the H mark visible at bottom-left). User can drop the real image at the same path later — no code change needed at that point.

- [ ] **Step 2: If image was supplied, verify it loads**

Run:
```bash
ls -lh images/home-hero.jpg
```
Expected: file exists, ideally <200KB. Refresh the browser. Confirm: the dark fallback is replaced by the B&W architectural photo. The H mark sits at the bottom-left of the photo.

- [ ] **Step 3: Commit**

If an image was added:
```bash
git add images/home-hero.jpg
git commit -m "hero: add B&W architectural photograph asset"
```

If no image was added: no commit. Move to Task 5.

---

### Task 5: Add initial reveal motion + prefers-reduced-motion override

**Files:**
- Modify: `home.html` inline `<style>` block

The hero gets a sequenced fade/translate cascade on first paint: image fades in, then eyebrow → headline → paragraph → hairline → CTA cascade up over ~1.2s.

- [ ] **Step 1: Verify current state**

Refresh the browser. Confirm: hero elements are visible immediately at their final positions (no animation yet).

- [ ] **Step 2: Add motion CSS to the inline `<style>` block**

Append to the hero section of the inline `<style>`:

```css
/* ============================================================
   HERO — initial reveal cascade
   ============================================================
   On first paint, each element animates in sequence. Total
   reveal: ~1.2s from paint. After that the hero sits still. */
@keyframes hero-fade-in{
  from { opacity:0; }
  to   { opacity:1; }
}
@keyframes hero-rise-in{
  from { opacity:0; transform:translateY(12px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes hero-rule-draw{
  from { transform:scaleX(0); transform-origin:left; }
  to   { transform:scaleX(1); transform-origin:left; }
}

.hero-photo-img{
  opacity:0;
  animation:hero-fade-in 600ms ease-out 0ms forwards;
}
.hero-eyebrow{
  opacity:0;
  transform:translateY(12px);
  animation:hero-rise-in 500ms cubic-bezier(.2,.7,.2,1) 200ms forwards;
}
.hero-hl > span:nth-child(1){
  opacity:0;
  transform:translateY(12px);
  animation:hero-rise-in 500ms cubic-bezier(.2,.7,.2,1) 320ms forwards;
}
.hero-hl > span:nth-child(2){
  opacity:0;
  transform:translateY(12px);
  animation:hero-rise-in 500ms cubic-bezier(.2,.7,.2,1) 420ms forwards;
}
.hero-hl > span:nth-child(3){
  opacity:0;
  transform:translateY(12px);
  animation:hero-rise-in 500ms cubic-bezier(.2,.7,.2,1) 520ms forwards;
}
.hero-sub{
  opacity:0;
  transform:translateY(12px);
  animation:hero-rise-in 500ms cubic-bezier(.2,.7,.2,1) 640ms forwards;
}
.hero-h-rule{
  transform:scaleX(0);
  transform-origin:left;
  animation:hero-rule-draw 400ms ease-out 760ms forwards;
}
.hero-cta{
  opacity:0;
  animation:hero-fade-in 400ms ease-out 880ms forwards;
}

/* prefers-reduced-motion — paint instantly at final state */
@media (prefers-reduced-motion: reduce){
  .hero-photo-img,
  .hero-eyebrow,
  .hero-hl > span,
  .hero-sub,
  .hero-h-rule,
  .hero-cta{
    animation:none;
    opacity:1;
    transform:none;
  }
}
```

- [ ] **Step 3: Verify reveal cascade**

Refresh the browser with DevTools open → Network tab → "Disable cache" checked. Watch the hero on reload. Expected: image fades in first, eyebrow cascades up next, then each headline line in sequence, then paragraph, then the hairline draws left-to-right, then CTA fades in. Total ~1.2s.

- [ ] **Step 4: Verify reduced-motion override**

In Chrome DevTools: Cmd/Ctrl+Shift+P → "Emulate CSS prefers-reduced-motion: reduce". Refresh. Expected: all hero elements appear instantly at final state, no animation.

- [ ] **Step 5: Commit**

```bash
git add home.html
git commit -m "hero: initial reveal cascade + reduced-motion override"
```

---

### Task 6: Add the scroll-mask transition into the doctrine section

**Files:**
- Modify: `home.html` inline `<style>` block

As the visitor scrolls past the hero, the `.home-doctrine` section emerges through a soft glass-like top edge — pure CSS via a `::before` pseudo on the doctrine section. No JS.

- [ ] **Step 1: Find the doctrine section's current top edge styling**

Run:
```bash
grep -nE "\.home-doctrine\s*\{|\.home-doctrine::before" home.html | head -5
```
Expected: at least one rule for `.home-doctrine`.

- [ ] **Step 2: Add the scroll-mask `::before` pseudo + soften the doctrine top**

In the inline `<style>` block, find the existing `.home-doctrine{...}` rule. Add this directly after it:

```css
/* ============================================================
   HERO → DOCTRINE — scroll-mask transition
   ============================================================
   Soft glass plate sliding up over the hero as you scroll. The
   doctrine section's top edge gets a translucent gradient that
   reads as 'frosted leading edge' over the hero behind it.
   Pure CSS — no scroll JS. The natural document flow does the
   sliding; the gradient gives the visual cue. */
.home-doctrine{
  position:relative;
  z-index:2;
}
.home-doctrine::before{
  content:'';
  position:absolute;
  top:-32px;
  left:0;
  right:0;
  height:64px;
  background:linear-gradient(
    to bottom,
    rgba(247,247,245,0) 0%,
    rgba(247,247,245,.55) 50%,
    rgba(247,247,245,.95) 100%
  );
  -webkit-backdrop-filter:blur(14px) saturate(125%);
          backdrop-filter:blur(14px) saturate(125%);
  pointer-events:none;
  z-index:1;
}
```

- [ ] **Step 3: Verify the transition**

Refresh, scroll slowly from the hero down into the doctrine section. Expected: the doctrine pillars emerge through a soft frosted leading edge — looks like a glass plate sliding up over the bottom of the hero. No hard cut between the two sections.

- [ ] **Step 4: Commit**

```bash
git add home.html
git commit -m "hero: scroll-mask transition into doctrine via glass top edge"
```

---

### Task 7: Add responsive — tablet + mobile + small-mobile

**Files:**
- Modify: `home.html` inline `<style>` block

Three breakpoints. Tablet adjusts split ratio. Mobile stacks vertically. Small-mobile compresses photo height further.

- [ ] **Step 1: Verify current state**

Resize the browser to tablet width (~900px). Expected: hero layout breaks — content is squashed, hairline still visible, photograph too narrow. That's the current state; needs responsive rules.

- [ ] **Step 2: Add the three breakpoint blocks**

Append to the inline `<style>` block:

```css
/* ============================================================
   HERO — responsive
   ============================================================ */

/* Tablet: nudge split ratio, scale headline down */
@media (max-width: 1024px){
  .hero-grid{ grid-template-columns:38% 1px 1fr; }
  .hero-hl{ font-size:clamp(32px, 4.5vw, 44px); }
  .hero-photo-mark{ width:28px; height:35px; bottom:24px; left:24px; }
  .hero-content{ padding:0 32px 80px; }
}

/* Mobile: stack vertically — photo on top, content below */
@media (max-width: 768px){
  .hero{ height:auto; min-height:0; }
  .hero-grid{
    grid-template-columns:1fr;
    grid-template-rows:45vh 1fr;
    height:auto;
  }
  .hero-rule{ display:none; }     /* vertical hairline collapses on stack */
  .hero-photo{ width:100%; height:45vh; }
  .hero-content{
    padding:48px 24px 56px;
    max-width:none;
    gap:14px;
  }
  .hero-eyebrow{ font-size:9px; gap:10px; }
  .hero-eyebrow-rule{ width:18px; }
  .hero-hl{
    font-size:clamp(28px, 7vw, 36px);
    margin:6px 0 10px;
    max-width:none;
  }
  .hero-sub{ max-width:none; font-size:13.5px; }
  .hero-h-rule{ margin:12px 0 4px; }
  .hero-photo-mark{ bottom:20px; left:auto; right:20px; }
}

/* Small mobile: compress photograph further */
@media (max-width: 400px){
  .hero-grid{ grid-template-rows:40vh 1fr; }
  .hero-photo{ height:40vh; }
  .hero-content{ padding:36px 20px 48px; }
}
```

- [ ] **Step 3: Verify each breakpoint**

In DevTools, set device width to:
- **1024px** → split ratio shifts slightly, headline smaller, photo mark scales down
- **768px** → hero stacks vertically; photo on top (~45vh), content below; no vertical hairline
- **390px** (iPhone 12 width) → same stack, slightly tighter padding
- **360px** → photo compresses to 40vh

Expected: all four states look intentional. No overflow, no broken layouts.

- [ ] **Step 4: Commit**

```bash
git add home.html
git commit -m "hero: responsive layouts for tablet + mobile + small mobile"
```

---

### Task 8: Remove the dead canvas IIFE from main/main.js

**Files:**
- Modify: `main/main.js:1328–1473`

The cinematic 300-frame canvas frame-sequence playback IIFE is no longer reachable — the `.hero-canvas` element it queries no longer exists. Delete it.

- [ ] **Step 1: Verify the IIFE bounds**

Run:
```bash
sed -n '1326,1330p' main/main.js
echo '---'
sed -n '1471,1476p' main/main.js
```
Expected:
- Lines 1326–1330: show the `/* HOME — HERO — scroll-driven canvas frame-sequence playback. */` comment header + `(function(){` opening at 1328.
- Lines 1471–1476: show `})();` closing the IIFE at 1473, blank line 1474, the `/* PRINCIPALS — scroll choreography... */` comment header at 1475, then `(function(){` for the principal-cards IIFE at 1476.

- [ ] **Step 2: Delete lines 1328–1473 (inclusive) AND the preceding `/* HOME — HERO */` comment header**

Use the Edit tool. The full text to remove starts a few lines above 1328 with the section comment header and ends with the `})();` closing at line 1473. Look for the comment `/* HOME — HERO — scroll-driven canvas frame-sequence playback.` and remove from there through the closing `})();`.

After deletion, the file should have the `/* PRINCIPALS — scroll choreography... */` comment immediately after whatever IIFE preceded the canvas one.

- [ ] **Step 3: Verify the dead code is gone + nothing else broke**

Run:
```bash
grep -nE "hero-canvas|FRAME_COUNT|FRAME_PATH|drawAt|preloadAll" main/main.js
```
Expected: zero matches.

Then run:
```bash
node --check main/main.js && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 4: Reload home page in browser and verify**

Open DevTools → Console. Refresh `home.html`. Expected: no JavaScript errors. Hero still renders correctly. The "Network" tab no longer shows any `images/hero-scroll/ezgif-frame-*` requests.

- [ ] **Step 5: Commit**

```bash
git add main/main.js
git commit -m "hero: remove dead 300-frame canvas IIFE from main.js"
```

---

### Task 9: End-to-end visual QA + final commit

**Files:** none modified — QA pass only.

- [ ] **Step 1: Cold-cache load test**

Open DevTools → Network → check "Disable cache" + throttle to "Slow 3G". Refresh `home.html`. Expected: no flash of unstyled content (FOUC). Hero typography and image either both appear together OR image fades in slightly later. No layout shift.

- [ ] **Step 2: CTA click path**

Click `BEGIN WITH ATLAS ↗`. Expected:
- Chat panel opens
- ~900ms later, the seeded message "I'd like to apply" appears as the visitor's first message
- Atlas replies (or starts to)
- The URL does NOT navigate to `apply.html`

- [ ] **Step 3: Scroll-mask transition**

Scroll from the top of the hero down into the doctrine pillars. Expected: smooth visual transition where the doctrine top edge feels like a soft frosted plate sliding up over the hero. No hard line. The sticky topnav still floats above with its own glass treatment.

- [ ] **Step 4: Reduced-motion smoke test**

DevTools → Cmd/Ctrl+Shift+P → "Emulate CSS prefers-reduced-motion: reduce". Refresh. Expected: hero elements appear instantly at final state. Scroll still works. Doctrine transition still works (CSS only, no motion).

- [ ] **Step 5: Cross-browser sanity check**

If possible, open `home.html` in two of: Chrome, Safari, Firefox, Edge. Confirm hero looks the same in each. The `backdrop-filter` on the doctrine `::before` is the only feature with patchy support — Firefox <103 won't blur, but the gradient still shows. Acceptable degradation.

- [ ] **Step 6: Mobile check on a real device or DevTools device emulation**

DevTools → Toggle Device Toolbar → iPhone 14 Pro (393×852) and a small Android (360×800). Verify: hero stacks vertically, photo on top, content below, brand mark visible at bottom-right of photo, all typography readable.

- [ ] **Step 7: Final commit + push**

If everything looks right, no further code changes — just push the accumulated commits:

```bash
git push
```

Expected: Vercel deploys within ~60s. Hit the production URL and re-run Steps 1–6 in production.

---

## Self-review (writer notes)

**Spec coverage:**
- Section 2.1 (Layout) → Tasks 2, 3, 7 ✓
- Section 2.2 (Content + copy) → Task 2 ✓
- Section 2.3 (Visual treatment / typography / palette / hairlines / brand mark / image processing) → Tasks 3 ✓
- Section 2.4 (Motion: initial reveal + scroll-mask + reduced-motion) → Tasks 5, 6 ✓
- Section 2.5 (Responsive: tablet, mobile, small-mobile) → Task 7 ✓
- Section 2.6 (Integration: files touched, dead-code removal, click behaviour) → Tasks 1, 8 ✓
- Section 2.7 (What's deliberately NOT in scope) → reflected in task scoping ✓
- Section 2.8 (Testing approach) → Task 9 ✓

**Placeholder scan:** none — every step contains the actual HTML/CSS/JS/command needed.

**Type consistency:** Class names (`.hero`, `.hero-grid`, `.hero-photo`, `.hero-photo-img`, `.hero-photo-mark`, `.hero-rule`, `.hero-content`, `.hero-eyebrow`, `.hero-eyebrow-rule`, `.hero-hl`, `.hero-sub`, `.hero-h-rule`, `.hero-cta`, `.hero-cta-l`, `.hero-cta-arrow`) are consistent across markup (Task 2), desktop CSS (Task 3), motion CSS (Task 5), responsive CSS (Task 7).

**Scope check:** Single coherent change — one HTML section + its inline CSS + a single JS deletion. Implementable in one session.
