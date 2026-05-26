# Website cleanup + Engagement Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the public website to eight visible surfaces, hide five secondary pages from main navigation, and ship a single print-styled `/dossier.html` that exports as a polished PDF for cold-email attachment.

**Architecture:** A one-shot Node script does the mass menu + footer rewrite across all ~20 HTML pages so we don't hand-edit each file. The dossier is a self-contained HTML file with print CSS — opening it in Chrome and using "Save as PDF" produces the deliverable. No new dependencies, no toolchain.

**Tech stack:** Vanilla HTML/CSS, a single throwaway Node script for the bulk rewrite, Chrome's built-in Print-to-PDF.

**Verification:** No automated test framework in this repo. Each task ends with grep-based verification + a manual visual check, followed by an isolated commit.

---

## File map

| Path | Action | Responsibility |
|---|---|---|
| All public HTML pages (~20 files) | Modify | Update the `#menu-panel` `<ul class="menu-list">` to show 8 kept surfaces. Update `<div class="footer-top">` columns to drop the 5 hidden pages. |
| `_cleanup-nav.js` | Create then delete | One-shot Node script to do the bulk rewrite. Removed in Task 1 final step. |
| `sitemap.xml` | Modify | Lower 5 hidden-page priorities to 0.3. |
| `dossier.html` | Create | New print-styled document, ~600 lines, ~21 pages when printed. |
| `dossier/HIMARK-Engagement-Dossier.pdf` | Create | Binary, the rendered output committed as a static asset. |

No changes to `styles/styles.css`, `main/main.js`, `images.config.js`, or any `api/*.js` file.

---

## Decisions baked into this plan

| | Value |
|---|---|
| New menu order | `[00] Home · [01] About · [02] Services · [05] Team · [08] Apply · [08.A] Counsel · [09] Contact · [09.A] Subscribe` |
| Footer columns (universal) | `[01] Engagement: Mandates · Apply · Counsel` · `[02] Firm: Doctrine · Principals · Origin` · `[03] Contact: info@himark.co.za · Subscribe · Client Portal` |
| Legal pages (privacy/terms/cookies/security) | Same as above PLUS a Press link added back into the `[02] Firm` column for transparency |
| Hidden page sitemap priority | 0.3 (was 0.5–0.7) |
| Dossier URL | `/dossier.html`, NOINDEX, absent from sitemap |
| PDF artefact | `dossier/HIMARK-Engagement-Dossier.pdf` committed to repo |

---

## Task 1 — Mass menu + footer rewrite

**Files:**
- Create then delete: `_cleanup-nav.js`
- Modify: every `.html` file at the site root (and `auth/*.html`, `dashboard/*.html`) that contains the menu panel and footer

- [ ] **Step 1: Define the verification**

After this task:
1. `grep -c 'data-page="method"' *.html auth/*.html dashboard/*.html` returns 0 hits in any of the menu-panel/footer regions (body content references on hidden pages themselves are OK).
2. `grep -c '\[ 09.A \].*Subscribe' *.html` returns ≥ 18 (one per kept page that has the menu).
3. Every page's menu shows exactly 8 items.
4. Tag balance preserved on all touched files.

- [ ] **Step 2: Write the one-shot rewrite script**

Create `_cleanup-nav.js` with this content:

```javascript
/* One-shot script: rewrite the side-panel menu and footer across every
   HTML page to reflect the new eight-surface navigation. Deleted at
   the end of Task 1.

   Strategy: anchor on exact-string matches for the current menu list
   and footer-top blocks, replace with the new versions. If a file
   doesn't match the expected pattern, report it and skip — manual
   inspection.
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

/* Pages whose footer keeps a Press link (transparency for governance
   surfaces — see spec §3). */
const LEGAL_PAGES = new Set(['privacy.html', 'terms.html', 'cookies.html', 'security.html']);

/* The expected current menu list block — must match EXACTLY for the
   script to replace it. */
const OLD_MENU_LIST =
'<ul class="menu-list">\n' +
'<li><a href="#" class="menu-item" data-page="home"><span class="mi-num">[ 00 ]</span><span class="mi-name">Home <em>· Origin</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="doctrine"><span class="mi-num">[ 01 ]</span><span class="mi-name">About <em>· Doctrine</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="mandates"><span class="mi-num">[ 02 ]</span><span class="mi-name">Services <em>· Mandates</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="method"><span class="mi-num">[ 03 ]</span><span class="mi-name">Process <em>· Method</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="airass"><span class="mi-num">[ 04 ]</span><span class="mi-name">AIRaaS <em>· Product</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="principals"><span class="mi-num">[ 05 ]</span><span class="mi-name">Team <em>· Principals</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="intake"><span class="mi-num">[ 08 ]</span><span class="mi-name">Apply <em>· Intake</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item menu-item-sub" data-page="sessions"><span class="mi-num">[ 08.A ]</span><span class="mi-name">Counsel <em>· Advisory session</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="direct"><span class="mi-num">[ 09 ]</span><span class="mi-name">Contact <em>· Direct</em></span><span class="mi-arrow">→</span></a></li>\n' +
'</ul>';

const NEW_MENU_LIST =
'<ul class="menu-list">\n' +
'<li><a href="#" class="menu-item" data-page="home"><span class="mi-num">[ 00 ]</span><span class="mi-name">Home <em>· Origin</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="doctrine"><span class="mi-num">[ 01 ]</span><span class="mi-name">About <em>· Doctrine</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="mandates"><span class="mi-num">[ 02 ]</span><span class="mi-name">Services <em>· Mandates</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="principals"><span class="mi-num">[ 05 ]</span><span class="mi-name">Team <em>· Principals</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="intake"><span class="mi-num">[ 08 ]</span><span class="mi-name">Apply <em>· Intake</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item menu-item-sub" data-page="sessions"><span class="mi-num">[ 08.A ]</span><span class="mi-name">Counsel <em>· Advisory session</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item" data-page="direct"><span class="mi-num">[ 09 ]</span><span class="mi-name">Contact <em>· Direct</em></span><span class="mi-arrow">→</span></a></li>\n' +
'<li><a href="#" class="menu-item menu-item-sub" data-page="subscribe"><span class="mi-num">[ 09.A ]</span><span class="mi-name">Subscribe <em>· Journal</em></span><span class="mi-arrow">→</span></a></li>\n' +
'</ul>';

/* New footer columns. The middle column varies by whether this is a
   legal page (keeps Press) or a normal page (drops Press). */
function newFooterTop(isLegal){
  const firmCol = isLegal
    ? '<div><p class="ft-col-t">[ 02 ] Firm</p><ul class="ft-links"><li><a href="#" data-page="doctrine">Doctrine</a></li><li><a href="#" data-page="principals">Principals</a></li><li><a href="#" data-page="press">Press &amp; Media</a></li><li><a href="#" data-page="home">Origin</a></li></ul></div>'
    : '<div><p class="ft-col-t">[ 02 ] Firm</p><ul class="ft-links"><li><a href="#" data-page="doctrine">Doctrine</a></li><li><a href="#" data-page="principals">Principals</a></li><li><a href="#" data-page="home">Origin</a></li></ul></div>';

  return (
    '<div class="footer-top">\n' +
    '<div><div class="ft-wm"><svg width="14" height="10" viewBox="0 0 292 200" fill="none"><rect x="0" y="0" width="28" height="200" fill="#5F8190"/><rect x="28" y="88" width="104" height="20" fill="#5F8190"/><rect x="132" y="0" width="28" height="200" fill="#5F8190"/><polygon points="160,0 182,0 212,120 201,120" fill="#5F8190"/><polygon points="242,0 264,0 223,120 212,120" fill="#5F8190"/><rect x="264" y="0" width="28" height="200" fill="#5F8190"/></svg>HIMARK</div><p class="ft-tag">Strategic Growth Consultancy</p><p class="ft-blurb">HIMARK (Pty) Ltd</p></div>\n' +
    '<div><p class="ft-col-t">[ 01 ] Engagement</p><ul class="ft-links"><li><a href="#" data-page="mandates">Mandates</a></li><li><a href="#" data-page="intake">Apply</a></li><li><a href="#" data-page="sessions">Counsel</a></li></ul></div>\n' +
    firmCol + '\n' +
    '<div><p class="ft-col-t">[ 03 ] Contact</p><ul class="ft-links"><li><a href="#">info@himark.co.za</a></li><li><a href="#" data-page="subscribe">Subscribe to The Journal</a></li><li><a href="#" data-page="signin">Client Portal</a></li></ul></div>\n' +
    '</div>'
  );
}

/* Walk the project for .html files. Recurse into auth/ and dashboard/
   but not node_modules or docs. */
function collectHtmlFiles(dir, out){
  out = out || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'docs') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectHtmlFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = collectHtmlFiles(ROOT);
let menuUpdated = 0, footerUpdated = 0, skipped = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const base = path.basename(file);
  let src = fs.readFileSync(file, 'utf8');
  const originalSrc = src;

  /* Menu replacement — only on pages that have the canonical 9-item
     list. Pages without the side-panel menu (index.html splash, the
     dossier when it exists later) are silently skipped. */
  if (src.includes(OLD_MENU_LIST)) {
    src = src.replace(OLD_MENU_LIST, NEW_MENU_LIST);
    menuUpdated++;
  }

  /* Footer replacement — find any existing <div class="footer-top">…</div>
     block and replace it with the new one. Use a regex anchored on the
     opening + closing tags. */
  const FOOTER_RX = /<div class="footer-top">[\s\S]*?<\/div>\n<\/div>\n<\/footer>/;
  // The closing </div></footer> includes the wrapping </div></div></footer> idiom — but
  // we only want to swap the footer-top block, not the footer-bottom + closing tags.
  // Use a tighter regex that stops at footer-bottom.
  const FOOTER_RX_TIGHT = /<div class="footer-top">[\s\S]*?<\/div>(?=\s*<div class="footer-bottom">)/;
  if (FOOTER_RX_TIGHT.test(src)) {
    src = src.replace(FOOTER_RX_TIGHT, newFooterTop(LEGAL_PAGES.has(base)));
    footerUpdated++;
  }

  if (src !== originalSrc) {
    fs.writeFileSync(file, src);
    console.log('updated', rel);
  } else {
    skipped.push(rel);
  }
}

console.log('\nSummary:');
console.log('  menu updated:    ', menuUpdated, 'files');
console.log('  footer updated:  ', footerUpdated, 'files');
console.log('  skipped (no match):', skipped.length, 'files');
if (skipped.length) {
  console.log('  skipped files:', skipped.join(', '));
}
```

- [ ] **Step 3: Run the script and inspect output**

```bash
node _cleanup-nav.js
```

Expected: prints `updated <path>` for each modified file, then a summary. Both `menu updated` and `footer updated` should be around 16–18 (every page that has both menu + footer). `skipped` should contain the splash entry (`index.html` — has no menu) and potentially `dossier.html` (doesn't exist yet) and `auth/mfa.html` if its footer differs from the canonical pattern.

If a file you expected to be modified is in the `skipped` list, open it and inspect — its menu or footer may have drifted from the canonical block. Either fix it manually OR update the script's old-string anchors and re-run.

- [ ] **Step 4: Verify the rewrites**

```bash
# The five hidden data-page values should no longer appear in any
# menu-list block. They may still appear in body content of the hidden
# pages themselves (insights.html linking to itself, etc.) — that's OK.

grep -c 'data-page="method".*Method' home.html about.html services.html team.html apply.html sessions.html contact.html subscribe.html
# Expected: 0 in each kept page

grep -c 'data-page="airass".*AIRaaS.*Product' home.html about.html services.html team.html apply.html sessions.html contact.html subscribe.html
# Expected: 0 in each kept page

# Subscribe link present in every kept page's menu
grep -c '\[ 09.A \]' home.html about.html services.html team.html apply.html sessions.html contact.html subscribe.html
# Expected: 1 in each

# Footer simplification — verify the new Engagement column
grep -c '\[ 01 \] Engagement.*Mandates.*Apply.*Counsel' home.html
# Expected: 0 (the column is multiline; use a less greedy check)

grep -c 'data-page="sessions">Counsel' home.html about.html services.html team.html apply.html sessions.html contact.html subscribe.html
# Expected: ≥ 1 in each kept page (it's now in the footer Engagement column)

# Legal pages keep Press in footer
grep -c 'data-page="press">Press' privacy.html terms.html cookies.html security.html
# Expected: 1 in each

# Non-legal pages drop Press from footer
grep -c 'data-page="press">Press' home.html about.html services.html team.html apply.html sessions.html contact.html subscribe.html
# Expected: 0 in each (no press link in their footers)

# Tag balance still holds across the modified files
node -e "['home.html','about.html','services.html','team.html','apply.html','sessions.html','contact.html','subscribe.html'].forEach(f=>{const s=require('fs').readFileSync(f,'utf8');console.log(f,'div',(s.match(/<div\b/gi)||[]).length+'/'+(s.match(/<\/div>/gi)||[]).length,'ul',(s.match(/<ul\b/gi)||[]).length+'/'+(s.match(/<\/ul>/gi)||[]).length,'footer',(s.match(/<footer\b/gi)||[]).length+'/'+(s.match(/<\/footer>/gi)||[]).length);});"
# Expected: every pair balanced
```

- [ ] **Step 5: Visual spot-check (one minute)**

Open `home.html` in a browser. Click the menu trigger (right-edge `[ 01—09 ]`). Confirm the side panel lists exactly 8 items: Home, About, Services, Team, Apply, Counsel, Contact, Subscribe. Scroll to the footer — confirm the three columns are clean and have the expected items.

Do the same on `privacy.html` — confirm Press still appears in its `[ 02 ] Firm` footer column.

- [ ] **Step 6: Remove the one-shot script**

```bash
rm _cleanup-nav.js
ls _cleanup-nav.js 2>&1 | head -1
# Expected: "ls: cannot access '_cleanup-nav.js': No such file or directory"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
nav: collapse menu to 8 surfaces, simplify footer

Side-panel menu across every page now lists only the 8 kept
surfaces (Home, About, Services, Team, Apply, Counsel, Contact,
Subscribe). Press, Process, AIRaaS, Insights, Work removed from
the index and from every page's footer.

Footer columns standardised across all pages:
  [01] Engagement: Mandates · Apply · Counsel
  [02] Firm:       Doctrine · Principals · Origin
                   (legal pages also keep Press for transparency)
  [03] Contact:    info@himark.co.za · Subscribe · Client Portal

Pages remain on disk and remain linkable from anywhere — they just
stop competing for attention in the global navigation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Lower sitemap priorities for hidden pages

**Files:**
- Modify: `sitemap.xml`

- [ ] **Step 1: Define the verification**

After this task, `sitemap.xml` has these priorities:
- `insights.html` → 0.3 (was 0.5)
- `work.html` → 0.3 (was 0.5)
- `press.html` → 0.3 (was 0.7)
- `process.html` → 0.3 (was 0.8)
- `product.html` → 0.3 (was 0.9)

`dossier.html` is NOT listed.
`subscribe.html` keeps its 0.6 priority.

- [ ] **Step 2: Read the current sitemap to confirm the priorities**

Run:
```bash
grep -B 1 "priority" sitemap.xml | grep -E "loc|priority" | head -40
```

Note the exact `<loc>` strings and current priorities — you'll match on these.

- [ ] **Step 3: Lower the five priorities**

Open `sitemap.xml`. For each of the five hidden pages, change the `<priority>` line.

Find:
```xml
    <loc>https://www.himark.co.za/insights.html</loc>
    <lastmod>2026-05-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
```
Change `0.5` to `0.3`.

Find:
```xml
    <loc>https://www.himark.co.za/work.html</loc>
    <lastmod>2026-05-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
```
Change `0.5` to `0.3`.

Find:
```xml
    <loc>https://www.himark.co.za/press.html</loc>
    <lastmod>2026-05-25</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
```
Change `0.7` to `0.3`.

Find (process — the current priority depends on the file's current state; use whatever it actually is):
```xml
    <loc>https://www.himark.co.za/process.html</loc>
```
Set its `<priority>` to `0.3`.

Find (product):
```xml
    <loc>https://www.himark.co.za/product.html</loc>
```
Set its `<priority>` to `0.3`.

- [ ] **Step 4: Verify**

```bash
grep -A 3 "process.html\|product.html\|insights.html\|work.html\|press.html" sitemap.xml | grep "priority"
# Expected: 5 lines, all showing 0.3
```

Confirm `dossier.html` is NOT present:
```bash
grep -c "dossier" sitemap.xml
# Expected: 0
```

- [ ] **Step 5: Commit**

```bash
git add sitemap.xml
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "sitemap: demote 5 hidden pages to priority 0.3"
```

---

## Task 3 — Build /dossier.html shell + print CSS

**Files:**
- Create: `dossier.html`

- [ ] **Step 1: Define the verification**

After this task:
1. `dossier.html` exists at the site root.
2. It contains `<meta name="robots" content="noindex,nofollow">`.
3. It contains a `<style>` block with both `@media screen` and `@media print` rules.
4. It contains at least one `<section class="dossier-page">` for testing.
5. The "Print as PDF" button is present, wrapped in `<div class="dossier-screen-only">`.
6. Opening in a browser shows a styled letter-size page; clicking Print as PDF opens Chrome's print dialog.

- [ ] **Step 2: Create the file with the shell + first page**

Create `dossier.html` with this exact content (this is the SHELL only — content fills out in Task 4):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>HIMARK · Engagement Dossier · 2026</title>
<meta name="description" content="HIMARK Engagement Dossier — the firm in a single document. Private."/>
<meta name="robots" content="noindex,nofollow"/>
<meta name="theme-color" content="#1C2B3A"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Roboto:ital,wght@0,300;0,400;1,300&family=Source+Sans+3:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300&display=swap" rel="stylesheet"/>
<link rel="icon" type="image/svg+xml" href="images/himark-favicon.svg"/>
<style>
  :root{
    --midnight: #1C2B3A;
    --ocean:    #5F8190;
    --ocean-dk: #2E4A5A;
    --ocean-lt: #8AADB8;
    --off:      #F7F7F5;
    --ink:      #1C2B3A;
    --ink-mut:  rgba(28,43,58,.66);
  }
  *{ box-sizing: border-box; }
  html, body{ margin: 0; padding: 0; background: #E8E8E5; color: var(--ink); font-family: 'Roboto', sans-serif; font-weight: 300; -webkit-font-smoothing: antialiased; }

  /* ── PAGE FRAME ──────────────────────────────────────────── */
  .dossier-page{
    width: 8.5in;
    min-height: 11in;
    padding: 0.85in 0.95in;
    background: var(--off);
    position: relative;
    page-break-after: always;
    counter-increment: dossier-page;
  }
  .dossier-page:last-of-type{ page-break-after: auto; }
  .dossier-page.cover{ background: var(--midnight); color: var(--off); }
  .dossier-page.dark{  background: var(--midnight); color: var(--off); }

  /* Page-corner coords */
  .dp-coord-tl, .dp-coord-tr, .dp-foot-l, .dp-foot-r{
    position: absolute;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    letter-spacing: .22em;
    color: var(--ocean);
  }
  .dossier-page.dark .dp-coord-tl,
  .dossier-page.dark .dp-coord-tr,
  .dossier-page.dark .dp-foot-l,
  .dossier-page.dark .dp-foot-r{ color: var(--ocean-lt); }

  .dp-coord-tl{ top: 0.35in; left: 0.95in; }
  .dp-coord-tr{ top: 0.35in; right: 0.95in; }
  .dp-foot-l{   bottom: 0.42in; left: 0.95in; }
  .dp-foot-r{   bottom: 0.42in; right: 0.95in; }
  .dp-foot-r::after{ content: counter(dossier-page); margin-left: 12px; }

  /* ── EDITORIAL TYPOGRAPHY ────────────────────────────────── */
  .dp-eyebrow{
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: .24em;
    color: var(--ocean);
    text-transform: uppercase;
    margin: 0 0 14px;
  }
  .dossier-page.dark .dp-eyebrow{ color: var(--ocean-lt); }

  .dp-h1{
    font-family: 'Source Sans 3', sans-serif;
    font-weight: 300;
    font-size: 60px;
    line-height: .98;
    letter-spacing: -.02em;
    color: var(--midnight);
    margin: 0 0 22px;
  }
  .dossier-page.dark .dp-h1{ color: var(--off); }
  .dp-h1 em{ font-style: italic; font-weight: 300; color: var(--ocean-dk); }
  .dossier-page.dark .dp-h1 em{ color: var(--ocean-lt); }

  .dp-h2{
    font-family: 'Source Sans 3', sans-serif;
    font-weight: 300;
    font-size: 38px;
    line-height: 1.04;
    letter-spacing: -.015em;
    color: var(--midnight);
    margin: 32px 0 14px;
  }
  .dossier-page.dark .dp-h2{ color: var(--off); }
  .dp-h2 em{ font-style: italic; color: var(--ocean-dk); }
  .dossier-page.dark .dp-h2 em{ color: var(--ocean-lt); }

  .dp-h3{
    font-family: 'Source Sans 3', sans-serif;
    font-weight: 600;
    font-size: 16px;
    letter-spacing: .01em;
    color: var(--midnight);
    margin: 22px 0 8px;
  }
  .dossier-page.dark .dp-h3{ color: var(--off); }

  .dp-body{
    font-family: 'Roboto', sans-serif;
    font-weight: 300;
    font-size: 13.5px;
    line-height: 1.62;
    color: var(--ink-mut);
    margin: 0 0 14px;
    max-width: 6.2in;
  }
  .dossier-page.dark .dp-body{ color: rgba(226,240,240,.78); }

  .dp-lead{
    font-family: 'Source Sans 3', sans-serif;
    font-weight: 300;
    font-size: 19px;
    line-height: 1.45;
    color: var(--ocean-dk);
    margin: 0 0 26px;
    max-width: 6.0in;
    font-style: italic;
  }
  .dossier-page.dark .dp-lead{ color: var(--ocean-lt); }

  .dp-mono{
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    letter-spacing: .14em;
    color: var(--ocean);
    text-transform: uppercase;
  }

  .dp-rule{
    border: 0;
    border-top: 1px solid rgba(95,129,144,.28);
    margin: 26px 0;
  }
  .dossier-page.dark .dp-rule{ border-top-color: rgba(138,173,184,.22); }

  /* ── KEEP-TOGETHER UTILITIES ─────────────────────────────── */
  .dp-keep{ page-break-inside: avoid; }
  .dp-h1, .dp-h2, .dp-h3{ page-break-after: avoid; }
  .dp-body{ orphans: 3; widows: 3; }

  /* ── COVER PAGE ──────────────────────────────────────────── */
  .cover-frame{
    position: absolute;
    inset: 0.6in;
    border: 1px solid rgba(138,173,184,.28);
    pointer-events: none;
  }
  .cover-stack{
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 0.95in;
  }
  .cover-wm{
    font-family: 'Source Sans 3', sans-serif;
    font-weight: 300;
    font-size: 84px;
    letter-spacing: -.02em;
    color: var(--off);
    margin: 0 0 12px;
  }
  .cover-strap{
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: .34em;
    color: var(--ocean-lt);
    text-transform: uppercase;
    margin: 0 0 60px;
  }
  .cover-title{
    font-family: 'Source Sans 3', sans-serif;
    font-weight: 300;
    font-size: 30px;
    letter-spacing: .04em;
    color: var(--off);
    text-transform: uppercase;
    margin: 0;
  }
  .cover-title em{ font-style: italic; color: var(--ocean-lt); text-transform: none; }
  .cover-meta{
    position: absolute;
    bottom: 0.95in;
    left: 0.95in;
    right: 0.95in;
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    letter-spacing: .22em;
    color: var(--ocean-lt);
    text-transform: uppercase;
  }

  /* ── PRINT BUTTON (screen-only) ──────────────────────────── */
  .dossier-screen-only{
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 1000;
  }
  .dp-print-btn{
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: .18em;
    text-transform: uppercase;
    color: var(--off);
    background: var(--midnight);
    border: 1px solid var(--midnight);
    padding: 12px 18px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 16px 30px -16px rgba(28,43,58,.4);
  }
  .dp-print-btn:hover{ background: var(--ocean-dk); border-color: var(--ocean-dk); }
  .dp-print-btn::after{ content: '↓'; font-size: 13px; }

  /* ── SCREEN MODE ─────────────────────────────────────────── */
  @media screen{
    body{ padding: 24px 0; }
    .dossier-page{
      margin: 24px auto;
      box-shadow: 0 24px 48px -28px rgba(28,43,58,.28);
    }
  }

  /* ── PRINT MODE ──────────────────────────────────────────── */
  @page{
    size: Letter;
    margin: 0;
  }
  @media print{
    body{ background: var(--off); padding: 0; }
    .dossier-screen-only{ display: none !important; }
    .dossier-page{
      margin: 0;
      box-shadow: none;
      page-break-after: always;
    }
    .dossier-page:last-of-type{ page-break-after: auto; }
    /* preserve background colors and borders */
    *{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- Screen-only print button -->
<div class="dossier-screen-only">
<button class="dp-print-btn" type="button" onclick="window.print()">Print as PDF</button>
</div>

<!-- ── COVER PAGE ── -->
<section class="dossier-page cover" data-coord="[ DOSSIER · 2026 ]">
<div class="cover-frame"></div>
<div class="cover-stack">
<h1 class="cover-wm">HIMARK</h1>
<p class="cover-strap">[ DOSSIER · 2026 ]</p>
<p class="cover-title">Engagement <em>Dossier</em></p>
</div>
<div class="cover-meta">
<span>[ INSTITUTIONAL · CONFIDENTIAL ]</span>
<span>For the recipient</span>
</div>
</section>

<!-- The remaining ~20 pages are added in Task 4. -->

</body>
</html>
```

- [ ] **Step 3: Verify**

```bash
ls -la dossier.html
# Expected: file present, ~12KB

# NOINDEX present
grep -c 'name="robots" content="noindex' dossier.html
# Expected: 1

# Print + screen media queries present
grep -c '@media screen' dossier.html
grep -c '@media print' dossier.html
# Expected: 1 each

# Cover page present
grep -c 'class="cover-wm"' dossier.html
# Expected: 1

# Screen-only print button present
grep -c 'class="dp-print-btn"' dossier.html
# Expected: 1

# Tag balance
node -e "const s=require('fs').readFileSync('dossier.html','utf8');console.log('div',(s.match(/<div\b/gi)||[]).length+'/'+(s.match(/<\/div>/gi)||[]).length,'section',(s.match(/<section\b/gi)||[]).length+'/'+(s.match(/<\/section>/gi)||[]).length,'style',(s.match(/<style\b/gi)||[]).length+'/'+(s.match(/<\/style>/gi)||[]).length);"
# Expected: every pair balanced
```

- [ ] **Step 4: Visual spot-check**

Open `dossier.html` directly in Chrome. The cover page should show: midnight background, "HIMARK" wordmark centered, `[ DOSSIER · 2026 ]` coord, "Engagement *Dossier*" title with italic suffix, "FOR THE RECIPIENT" mono in the bottom-right.

A "Print as PDF" button should sit in the top-right of the viewport.

Click "Print as PDF" → Chrome opens its print dialog. **Don't actually save yet** — just confirm the dialog opens and the preview shows a letter-size page with the cover design.

- [ ] **Step 5: Commit**

```bash
git add dossier.html
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
dossier: scaffold /dossier.html with print CSS + cover page

Single-file, print-styled document for cold-email PDF attachment.
NOINDEX, absent from sitemap. Uses the editorial design system
(Source Sans 3 / Roboto / JetBrains Mono, midnight/ocean/off
palette). Print CSS sets letter-size pages with full-bleed
margins controlled inside each .dossier-page. Screen mode stacks
pages with subtle drop shadows and a floating "Print as PDF"
button. Cover page in place; content sections land in Task 4.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Write the dossier content (sections 01–10 + back)

**Files:**
- Modify: `dossier.html` (insert the new sections between the cover `</section>` and `</body>`)

- [ ] **Step 1: Define the verification**

After this task, `dossier.html` contains exactly 21 `<section class="dossier-page">` elements when counted. Sections present, in order:

1. Cover (already there)
2. Foreword
3. The Firm (1 page)
4. The Firm (continued)
5. Principals — Matime
6. Principals — Mokgwadi
7. Principals — Mothiba
8. Principals — Cammay
9. Mandates — Tier 01
10. Mandates — Tier 02
11. Mandates — Tier 03
12. The Method (1)
13. The Method (2)
14. AIRaaS (1)
15. AIRaaS (2)
16. Engagement Model
17. Voice — essay 1
18. Voice — essay 2
19. Voice — essay 3
20. Boilerplate · Contact
21. Back cover

- [ ] **Step 2: Insert the content sections**

Open `dossier.html`. Find the line `<!-- The remaining ~20 pages are added in Task 4. -->` and replace it with the following content block (verbatim):

```html
<!-- ── 02 · FOREWORD ── -->
<section class="dossier-page" data-coord="[ 02 · FOREWORD ]">
<span class="dp-coord-tl">[ 02 · FOREWORD ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">Foreword</p>
<h2 class="dp-h1">Clarity precedes <em>scale.</em></h2>
<p class="dp-lead">A note from the principal office, by way of introduction.</p>

<p class="dp-body">HIMARK was founded in March 2026 on three premises that have not changed since. The first is that clarity precedes scale — that a founder-led business cannot grow past the limits of how clearly it has positioned itself, and that the work of clarification is more often refused than completed. The second is that volume is a tax on quality — that the modern consultancy's instinct to scale by adding mandates erodes the very judgement clients are paying for. The third is that engagements are earned, not won — that the firm-of-record relationship to a founder is best protected by accepting deliberately fewer mandates than the market would award.</p>

<p class="dp-body">This dossier is the firm in long form. It is sent only to operators we are already in conversation with, on the assumption that the brand and website have done the work of introducing us, and that what remains is the harder work of seeing whether our doctrine matches yours.</p>

<p class="dp-body">If something here resonates, the right next step is the form on page sixteen. If something here doesn't, this document is yours to keep — we believe the institutional artefacts are more useful than the engagement itself in many cases.</p>

<hr class="dp-rule"/>
<p class="dp-mono">— The Principals · HIMARK</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 03 · THE FIRM ── -->
<section class="dossier-page" data-coord="[ 03 · THE FIRM ]">
<span class="dp-coord-tl">[ 03 · THE FIRM ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">The Firm</p>
<h2 class="dp-h1">An institution for <em>founder-led growth.</em></h2>

<p class="dp-body">HIMARK is a premium strategic growth consultancy headquartered in Randburg, Gauteng, working with founder-led businesses pursuing premium-tier market positions across South Africa and globally. Founded in 2026 by Neo Matime and Neo Mokgwadi, the firm operates on a deliberately limited mandate model — a small number of engagements each quarter, every one anchored by a senior principal.</p>

<p class="dp-body">The firm designs and operates the strategic infrastructure beneath the businesses it works with: brand architecture, demand engineering, AI integration through its proprietary AIRaaS platform, and direct principal counsel. It does not pitch, does not chase volume, and accepts engagements by application.</p>

<h3 class="dp-h3">Founding facts</h3>
<p class="dp-body"><strong>Founded:</strong> March 2026 · <strong>Headquarters:</strong> Randburg, Gauteng · <strong>Legal entity:</strong> HIMARK (Pty) Ltd · <strong>Structure:</strong> independent, founder-owned, no outside capital · <strong>Founders:</strong> Neo Matime, Neo Mokgwadi · <strong>Principals:</strong> four senior · <strong>Mandate model:</strong> by application, reviewed quarterly · <strong>Proprietary platform:</strong> AIRaaS.</p>

<h3 class="dp-h3">Doctrine, in three lines</h3>
<p class="dp-body" style="font-style:italic;color:var(--ocean-dk);">Clarity precedes scale. Volume is a tax on quality. Engagements are earned — not won.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 04 · PRINCIPALS — INTRO ── -->
<section class="dossier-page dark" data-coord="[ 04 · PRINCIPALS ]">
<span class="dp-coord-tl">[ 04 · PRINCIPALS ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">The Principals</p>
<h2 class="dp-h1">Every engagement is <em>anchored.</em></h2>
<p class="dp-lead">No account managers. No junior swarms. The principal whose name is on the engagement letter is the principal who runs the engagement.</p>

<p class="dp-body">Four senior principals hold the firm's mandates. Each is the principal of record for one of the firm's four core domains. The four bios that follow describe each principal in the language they would use to describe themselves to a peer.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 05 · NEO MATIME ── -->
<section class="dossier-page" data-coord="[ 05.01 · MATIME ]">
<span class="dp-coord-tl">[ 05.01 · MATIME ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">Principal · 01</p>
<h2 class="dp-h1">Neo Matime<br/><em>Founder &amp; Chief Executive</em></h2>

<p class="dp-body">Neo Matime is the founder and chief executive of HIMARK, the premium strategic growth consultancy he co-founded in Randburg, South Africa, in 2026. He operates across commercial strategy, brand architecture, and AI integration for founder-led businesses pursuing premium-tier market positions across Africa and globally. He personally leads the firm's Tier 03 Private Partner engagements — the small number of deeply embedded mandates the firm accepts each year — and serves as the principal of record on the most demanding briefs.</p>

<h3 class="dp-h3">Doctrine</h3>
<p class="dp-body" style="font-style:italic;color:var(--ocean-dk);">Clarity precedes scale. Volume is a tax on quality. Engagements are earned — not won.</p>

<h3 class="dp-h3">Domains</h3>
<p class="dp-body">Strategy · AI Integration · Founder Office · Tier 03 Lead</p>

<h3 class="dp-h3">Mandate</h3>
<p class="dp-body">Anchors Private Partner mandates. Direct line for executive-level engagements.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 06 · NEO MOKGWADI ── -->
<section class="dossier-page" data-coord="[ 05.02 · MOKGWADI ]">
<span class="dp-coord-tl">[ 05.02 · MOKGWADI ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">Principal · 02</p>
<h2 class="dp-h1">Neo Mokgwadi<br/><em>Chief Marketing Officer</em></h2>

<p class="dp-body">Neo Mokgwadi is the co-founder and chief marketing officer of HIMARK. She leads brand positioning, market communication, and demand architecture across the firm — owning the brand layer that sits beneath every client mandate the firm takes on. She specialises in premium-tier market entry and architectural brand systems that hold under scrutiny long after the launch quarter, and authors most of the firm's externally-facing voice.</p>

<h3 class="dp-h3">Doctrine</h3>
<p class="dp-body" style="font-style:italic;color:var(--ocean-dk);">Positioning is destiny. Brands earn premium pricing through restraint — not volume of message.</p>

<h3 class="dp-h3">Domains</h3>
<p class="dp-body">Brand · Positioning · GTM Strategy · Demand</p>

<h3 class="dp-h3">Mandate</h3>
<p class="dp-body">Owns brand, positioning, and demand architecture across all tiers.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 07 · THELMA MOTHIBA ── -->
<section class="dossier-page" data-coord="[ 05.03 · MOTHIBA ]">
<span class="dp-coord-tl">[ 05.03 · MOTHIBA ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">Principal · 03</p>
<h2 class="dp-h1">Thelma Mothiba<br/><em>Chief Operations Officer</em></h2>

<p class="dp-body">Thelma Mothiba is the chief operations officer at HIMARK, where she owns delivery across the firm's full engagement portfolio. Her remit covers every milestone, every onboarding moment, every internal handover — the operational substrate that turns a strategic recommendation into a measurable outcome on the client's books. She runs the firm's operating cadence and tooling layer.</p>

<h3 class="dp-h3">Doctrine</h3>
<p class="dp-body" style="font-style:italic;color:var(--ocean-dk);">Strategy without delivery is fiction. Cadence is the discipline that holds an engagement together.</p>

<h3 class="dp-h3">Domains</h3>
<p class="dp-body">Operations · Tech Stack · Onboarding · Delivery</p>

<h3 class="dp-h3">Mandate</h3>
<p class="dp-body">Owns the operating cadence. Ensures principal commitments land on time, in scope.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 08 · NATHANAEL CAMMAY ── -->
<section class="dossier-page" data-coord="[ 05.04 · CAMMAY ]">
<span class="dp-coord-tl">[ 05.04 · CAMMAY ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">Principal · 04</p>
<h2 class="dp-h1">Nathanael Cammay<br/><em>Chief Technology Officer</em></h2>

<p class="dp-body">Nathanael Cammay is the chief technology officer at HIMARK, owning the firm's technology architecture end-to-end. His remit spans the AI infrastructure that powers AIRaaS, the proprietary Atlas assistant trained on principal counsel, and the data platforms underpinning every client engagement the firm undertakes. He is the principal of record on the firm's AIRaaS platform — HIMARK's productised AI integration layer.</p>

<h3 class="dp-h3">Doctrine</h3>
<p class="dp-body" style="font-style:italic;color:var(--ocean-dk);">Infrastructure is the unseen advantage. The right architecture compounds; the wrong one ages.</p>

<h3 class="dp-h3">Domains</h3>
<p class="dp-body">AI Architecture · Platforms · Atlas · Data</p>

<h3 class="dp-h3">Mandate</h3>
<p class="dp-body">Builds the AI, data, and platform layer behind every HIMARK engagement.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 09 · MANDATE TIER 01 ── -->
<section class="dossier-page" data-coord="[ 09 · TIER 01 ]">
<span class="dp-coord-tl">[ 09 · MANDATES · TIER 01 ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">Mandate · Tier 01</p>
<h2 class="dp-h1">Signature <em>Partner.</em></h2>
<p class="dp-lead">The entry tier. Targeted intervention on a single strategic constraint, anchored by a senior principal.</p>

<h3 class="dp-h3">Designed for</h3>
<p class="dp-body">Founder-led businesses with a clear, well-defined growth constraint — a launch, a re-positioning, a single high-stakes campaign — who want principal-grade thinking applied to a discrete problem without committing to a quarter-long engagement.</p>

<h3 class="dp-h3">What the engagement contains</h3>
<p class="dp-body">A six-week intervention with a single senior principal as the engagement lead. Deliverables shape to the brief but typically include a positioning audit, a strategic recommendation document, and the operational artefacts to implement the recommendation. The principal remains the point of contact throughout; there are no account managers and no juniors in the loop.</p>

<h3 class="dp-h3">Cadence</h3>
<p class="dp-body">Weekly principal call. Mid-cycle review. End-of-cycle handover including all internal working documents.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 10 · MANDATE TIER 02 ── -->
<section class="dossier-page" data-coord="[ 10 · TIER 02 ]">
<span class="dp-coord-tl">[ 10 · MANDATES · TIER 02 ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">Mandate · Tier 02</p>
<h2 class="dp-h1">Growth <em>Partner.</em></h2>
<p class="dp-lead">The standard engagement. A quarter-long mandate covering brand, demand, and operating cadence under a single principal.</p>

<h3 class="dp-h3">Designed for</h3>
<p class="dp-body">Founder-led businesses moving from product-market fit to scale, or from local credibility to category leadership. The work spans multiple disciplines — brand positioning, demand engineering, operating-cadence design — and requires a principal who can hold them together as a single system.</p>

<h3 class="dp-h3">What the engagement contains</h3>
<p class="dp-body">A twelve-week engagement led by a senior principal, with the wider firm available for specialist contributions where the brief requires (AI integration via AIRaaS, brand-system production, operations tooling). The output is a complete strategic infrastructure — positioning, demand architecture, operating cadence, principal counsel — designed to compound for two to three years after the engagement closes.</p>

<h3 class="dp-h3">Cadence</h3>
<p class="dp-body">Twice-weekly principal touch. Monthly steering review. Standing access to the principal between formal sessions.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 11 · MANDATE TIER 03 ── -->
<section class="dossier-page" data-coord="[ 11 · TIER 03 ]">
<span class="dp-coord-tl">[ 11 · MANDATES · TIER 03 ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">Mandate · Tier 03</p>
<h2 class="dp-h1">Private <em>Partner.</em></h2>
<p class="dp-lead">The deepest tier. A year-long, deeply embedded mandate. Tier 03 is led personally by Neo Matime and accepts no more than two engagements per year.</p>

<h3 class="dp-h3">Designed for</h3>
<p class="dp-body">Operators with a single, generation-defining ambition. The Tier 03 engagement is not a consultancy retainer — it is a year-long principal-of-record relationship in which HIMARK becomes the strategic counterpart for every meaningful decision the founder makes about brand, demand, and architecture.</p>

<h3 class="dp-h3">What the engagement contains</h3>
<p class="dp-body">Twelve months of direct principal access. The full firm — every senior principal, the AIRaaS platform, the operating cadence layer — sits behind the lead principal. The engagement is by mutual selection: HIMARK accepts a Tier 03 only when the principal believes the founder's ambition is consequential enough to justify dedicating a year of his time.</p>

<h3 class="dp-h3">Cadence</h3>
<p class="dp-body">Continuous access. Weekly working session. Monthly strategic review with the full principal team. Quarterly inflection-point review against the original ambition.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 12 · THE METHOD (1) ── -->
<section class="dossier-page" data-coord="[ 12 · METHOD ]">
<span class="dp-coord-tl">[ 12 · THE METHOD ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">The Method</p>
<h2 class="dp-h1">An engine, <em>not a checklist.</em></h2>
<p class="dp-lead">The Method Engine is the underlying machinery the firm uses to convert a founder's ambition into a durable strategic position. Five phases. One principal anchoring all of them.</p>

<h3 class="dp-h3">Phase 01 · Diagnostic</h3>
<p class="dp-body">The first three weeks of every engagement, regardless of tier, are a structured diagnostic. The principal interviews the founder, the senior team, and where appropriate, the market. The output is a single document called the Diagnostic Brief — the firm's articulation of where the business actually is, in language the founder rarely uses in public.</p>

<h3 class="dp-h3">Phase 02 · Doctrine</h3>
<p class="dp-body">Doctrine is the second phase: the firm's recommendation of where the business should stand, and on what basis. It is written for the founder personally, not for the board. It contains positioning statements, strategic ambition statements, and the operating principles against which the next twelve to twenty-four months of decisions will be tested.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 13 · THE METHOD (2) ── -->
<section class="dossier-page" data-coord="[ 13 · METHOD ]">
<span class="dp-coord-tl">[ 13 · THE METHOD ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">The Method · continued</p>

<h3 class="dp-h3">Phase 03 · Architecture</h3>
<p class="dp-body">Architecture is the build phase. Brand systems, demand mechanisms, AI integration, operating cadences — the actual instruments the business will run on. This is where most consultancies stop being useful; HIMARK treats this phase as the load-bearing one. The principal who anchored Doctrine continues to anchor Architecture so the build doesn't drift from the recommendation.</p>

<h3 class="dp-h3">Phase 04 · Operation</h3>
<p class="dp-body">Operation is the live phase: the firm's instruments are now running inside the business. The principal moves from designer to advisor, present at the cadence the engagement defines. The work in Operation is to defend the doctrine against the gravity of operational chaos.</p>

<h3 class="dp-h3">Phase 05 · Handover</h3>
<p class="dp-body">Every engagement ends. Handover is the deliberate transfer of the firm's working documents, doctrine, and ongoing rationale to the client's internal team. The firm believes its work is complete when the founder can defend the doctrine without us in the room.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 14 · AIRaaS (1) ── -->
<section class="dossier-page dark" data-coord="[ 14 · AIRaaS ]">
<span class="dp-coord-tl">[ 14 · AIRaaS ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">Product</p>
<h2 class="dp-h1">AIRaaS — <em>AI integration, productised.</em></h2>
<p class="dp-lead">The proprietary infrastructure HIMARK uses to embed AI into client engagements without rebuilding from scratch every time.</p>

<p class="dp-body">AIRaaS — "AI Receptionist as a Service" — is HIMARK's productised AI integration layer. It sits behind the firm's mandates as a deployable infrastructure: client-facing assistants trained on the client's own doctrine, internal AI tooling for delivery teams, and the data pipelines that connect both to the client's CRM, knowledge base, and operating systems.</p>

<p class="dp-body">It is not a chatbot. It is the firm's architectural answer to the question of how a founder-led business can adopt AI without the integration cost cancelling out the productivity gain.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 15 · AIRaaS (2) ── -->
<section class="dossier-page" data-coord="[ 15 · AIRaaS ]">
<span class="dp-coord-tl">[ 15 · AIRaaS ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">AIRaaS · the pipeline</p>

<h3 class="dp-h3">Stage 01 · Calibration</h3>
<p class="dp-body">The platform ingests the client's existing knowledge — internal documents, customer transcripts, founder voice — and produces a calibrated language model trained specifically on the client's doctrine. The output is not a generic LLM with a few prompts; it is a system that speaks the way the firm speaks.</p>

<h3 class="dp-h3">Stage 02 · Surface</h3>
<p class="dp-body">The calibrated system is surfaced where the client's customers and team actually meet it: web chat, voice, scheduling, internal AI co-pilots. Each surface is configured against the operating cadence defined in the engagement, not against a vendor's defaults.</p>

<h3 class="dp-h3">Stage 03 · Integration</h3>
<p class="dp-body">The surfaces connect to the client's CRM, knowledge base, and operating instruments via standard integrations. Every qualified interaction routes back to a contact record; every internal AI co-pilot output is auditable against the doctrine it was calibrated to.</p>

<h3 class="dp-h3">Stage 04 · Compound</h3>
<p class="dp-body">Once running, the platform learns from the engagement: which interactions converted, which doctrine statements held under pressure, which calibration drifted. The principal reviews the drift quarterly and re-calibrates against the original doctrine.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 16 · ENGAGEMENT MODEL ── -->
<section class="dossier-page" data-coord="[ 16 · ENGAGEMENT ]">
<span class="dp-coord-tl">[ 16 · ENGAGEMENT ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">How to engage</p>
<h2 class="dp-h1">By <em>application.</em></h2>
<p class="dp-lead">HIMARK does not pitch. The firm accepts a deliberately limited number of mandates each quarter, reviewed by a principal directly.</p>

<h3 class="dp-h3">The Application</h3>
<p class="dp-body">The intake form at <strong>himark.co.za/apply</strong> is read by a principal within five working days. The brief — the box that asks you to describe the strategic objective and constraint — is the most important field. A specific, well-articulated brief receives a faster and more substantive response than a generic enquiry.</p>

<h3 class="dp-h3">The Counsel Session</h3>
<p class="dp-body">For operators not yet ready to apply, the firm runs Strategic Advisory Sessions — a single principal hour, video or in person, against a brief you set. The booking sits at <strong>himark.co.za/sessions</strong>. The session is paid; the rate is provided at booking.</p>

<h3 class="dp-h3">Response time</h3>
<p class="dp-body">Within five working days for applications. Within two working days for press, partnership, or session enquiries. Email <strong>info@himark.co.za</strong> for anything outside those channels.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 17 · VOICE · ESSAY 1 ── -->
<section class="dossier-page" data-coord="[ 17 · VOICE ]">
<span class="dp-coord-tl">[ 17 · VOICE · 01 ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">From The Journal</p>
<h2 class="dp-h1">The premium <em>position.</em></h2>

<p class="dp-body">A premium position is not a price. It is a refusal — a deliberate refusal to be considered alongside the businesses your customer would otherwise consider. Most premium brands collapse not because their price is too high, but because they accept comparisons they should have declined. The work of premium positioning is the work of curating which comparisons your business will and will not show up in.</p>

<p class="dp-body">In practice, this means accepting fewer customers, fewer markets, fewer use-cases. It means rewriting the website to disqualify visitors faster, not convert more of them. It means writing pricing pages that make a third of your readers leave immediately — and the remaining two-thirds stay because they recognise themselves.</p>

<p class="dp-body">There is no premium position without restraint. The firms that have it know exactly what they are not.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 18 · VOICE · ESSAY 2 ── -->
<section class="dossier-page" data-coord="[ 18 · VOICE ]">
<span class="dp-coord-tl">[ 18 · VOICE · 02 ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">From The Journal</p>
<h2 class="dp-h1">Architecture, <em>not campaigns.</em></h2>

<p class="dp-body">The campaign era is ending in slow motion. Founder-led businesses that built on quarterly bursts — launches, drops, paid pushes — are quietly losing to businesses that built brand and demand as architecture: systems that issue value continuously, without the metabolic cost of starting from zero every ninety days.</p>

<p class="dp-body">Architecture compounds. Campaigns expire. The difference shows up most clearly in the third year: businesses with architecture spend less and convert more; businesses with campaigns are still spending the same amount, still launching new things, still trying to recapture the attention they had at launch.</p>

<p class="dp-body">If you are running campaigns, the right question is not "what's the next campaign." The right question is what would have to be true for your business to never need another campaign.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 19 · VOICE · ESSAY 3 ── -->
<section class="dossier-page" data-coord="[ 19 · VOICE ]">
<span class="dp-coord-tl">[ 19 · VOICE · 03 ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">From The Journal</p>
<h2 class="dp-h1">AI without <em>illusion.</em></h2>

<p class="dp-body">The AI conversation in mid-market businesses has split into two illusions. The first is that AI is a productivity tool — a faster way to write the same emails, build the same decks, draft the same campaigns. The second is that AI is a replacement — that a calibrated assistant can substitute for a senior team.</p>

<p class="dp-body">Both illusions are expensive. The productivity framing pays for tools that don't change the work; the replacement framing pays for assistants that quietly degrade judgement. The third framing — the one HIMARK builds toward — is integration. AI as architecture: embedded into the operating system of the business, calibrated to its doctrine, auditable against its own outputs.</p>

<p class="dp-body">Done with discipline, the integration framing is the only one that compounds. The other two are just new ways to spend money.</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 20 · BOILERPLATE · CONTACT ── -->
<section class="dossier-page" data-coord="[ 20 · CONTACT ]">
<span class="dp-coord-tl">[ 20 · CONTACT ]</span>
<span class="dp-coord-tr">DOSSIER · 2026</span>

<p class="dp-eyebrow">For the record</p>
<h2 class="dp-h1">Direct <em>lines.</em></h2>

<h3 class="dp-h3">Boilerplate</h3>
<p class="dp-body">HIMARK is a premium strategic growth consultancy headquartered in Randburg, Gauteng. Founded in 2026 by Neo Matime and Neo Mokgwadi, the firm designs and operates the strategic infrastructure beneath founder-led businesses — brand architecture, demand engineering, AI integration, and principal counsel. Every engagement is anchored by a senior principal. HIMARK accepts a deliberately limited number of mandates each quarter.</p>

<h3 class="dp-h3">Direct contact</h3>
<p class="dp-body">General enquiries: <strong>info@himark.co.za</strong><br/>Press and media: <strong>press@himark.co.za</strong><br/>Applications: <strong>himark.co.za/apply</strong><br/>Advisory sessions: <strong>himark.co.za/sessions</strong></p>

<h3 class="dp-h3">Postal</h3>
<p class="dp-body">HIMARK (Pty) Ltd<br/>Randburg, Gauteng<br/>South Africa</p>

<hr class="dp-rule"/>
<p class="dp-mono">Reference · HIMARK-DOSSIER-2026.05 · Confidential to recipient</p>

<span class="dp-foot-l">HIMARK</span>
<span class="dp-foot-r">Page</span>
</section>

<!-- ── 21 · BACK COVER ── -->
<section class="dossier-page cover" data-coord="[ END · DOSSIER ]">
<div class="cover-frame"></div>
<div class="cover-stack">
<p class="cover-strap">[ END · DOSSIER ]</p>
<p class="cover-title">HIMARK <em>· 2026</em></p>
</div>
<div class="cover-meta">
<span>HIMARK (Pty) Ltd</span>
<span>Randburg · ZA</span>
</div>
</section>
```

- [ ] **Step 3: Verify**

```bash
# Count the dossier pages
grep -c '<section class="dossier-page' dossier.html
# Expected: 21

# Spot the major sections
grep -c 'dp-eyebrow.*Foreword' dossier.html
# Expected: 1
grep -c 'dp-eyebrow.*The Firm' dossier.html
# Expected: 1
grep -c 'Principal · 0[1234]' dossier.html
# Expected: 4 (one per principal)
grep -c 'Mandate · Tier 0[123]' dossier.html
# Expected: 3
grep -c 'AIRaaS' dossier.html
# Expected: ≥ 4 (eyebrow, headline, body mentions)

# Tag balance
node -e "const s=require('fs').readFileSync('dossier.html','utf8');console.log('section',(s.match(/<section\b/gi)||[]).length+'/'+(s.match(/<\/section>/gi)||[]).length,'div',(s.match(/<div\b/gi)||[]).length+'/'+(s.match(/<\/div>/gi)||[]).length,'h2',(s.match(/<h2\b/gi)||[]).length+'/'+(s.match(/<\/h2>/gi)||[]).length);"
# Expected: all balanced
```

- [ ] **Step 4: Visual spot-check**

Open `dossier.html` in Chrome. Scroll all the way through. Confirm:
- 21 pages stacked vertically with subtle drop shadows
- Cover page is midnight, "HIMARK · Engagement Dossier" centered
- Foreword on a light page with italic lead
- Each principal on their own page with name + title in italic suffix
- Three Tier pages
- Two Method pages
- AIRaaS intro on a midnight page, AIRaaS pipeline on a light page
- Three Voice essays
- Boilerplate / Contact page
- Back cover

No empty pages, no broken layouts. The "Print as PDF" button still sits top-right.

- [ ] **Step 5: Commit**

```bash
git add dossier.html
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
dossier: write 20 content pages

Foreword · The Firm · Principals (4) · Mandates (3) · Method (2)
· AIRaaS (2) · Engagement Model · Voice (3 essays) · Boilerplate
· Back cover. 21 letter-size pages total when printed.

Content sourced from existing site (about, services, team,
process, product, apply, sessions, insights, press) and curated
for cold-email cadence — a single read top-to-bottom rather than
a series of independent surfaces.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Generate the PDF and commit it

**Files:**
- Create: `dossier/HIMARK-Engagement-Dossier.pdf` (binary)

This task is half manual — there's no CLI shortcut for Chrome's print-to-PDF that's worth introducing. The principal team will produce the PDF in five minutes; we just place and commit it.

- [ ] **Step 1: Create the destination directory**

```bash
mkdir -p dossier
ls -d dossier
# Expected: "dossier"
```

- [ ] **Step 2: Open the dossier in Chrome and save as PDF**

In Chrome (NOT in DevTools, NOT in Incognito — Incognito sometimes alters print fidelity):

1. Open `https://www.himark.co.za/dossier.html` *(after the previous commits are deployed)* OR open the local file via `file:///.../himark-site/dossier.html`.
2. Press **Ctrl+P** (Windows) or **Cmd+P** (Mac), OR click the "Print as PDF" button in the top-right.
3. In the print dialog:
   - **Destination:** Save as PDF
   - **Paper size:** Letter
   - **Margins:** None *(our CSS controls margins inside each page)*
   - **Scale:** Default (100%)
   - **Background graphics:** ✓ enabled *(critical — without this the midnight pages render white)*
   - **Headers and footers:** ✗ disabled
4. Click **Save**. Save the file to: `C:\Users\Neo\OneDrive\Documents\HIMARK SGC\HIMARK\himark-site\dossier\HIMARK-Engagement-Dossier.pdf`

- [ ] **Step 3: Verify the PDF**

```bash
ls -la dossier/HIMARK-Engagement-Dossier.pdf
# Expected: file present, ~2–5 MB
```

Open the PDF in any viewer. Confirm:
- 21 pages
- Cover page has midnight background and the HIMARK wordmark
- Each principal on their own page
- Background colors preserved on AIRaaS intro page (midnight)
- Page breaks fall between sections (no headings orphaned at the bottom of a page; no paragraphs split mid-sentence across pages)

If page-break quality is poor, return to `dossier.html`, adjust `page-break-*` rules where the breaks fall badly, regenerate.

- [ ] **Step 4: Commit the PDF**

```bash
git add dossier/HIMARK-Engagement-Dossier.pdf
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "dossier: commit rendered PDF for cold-email attachment"
```

- [ ] **Step 5: Push everything**

```bash
git push origin main
```

Vercel will redeploy. After deploy:
- `https://www.himark.co.za/dossier.html` loads with NOINDEX
- Searching `site:himark.co.za` on Google should NOT include the dossier
- The eight visible surfaces all show the new menu/footer

---

## Rollback

If anything goes wrong post-deploy:

```bash
# Revert the entire feature
git revert --no-edit 4e47e23..HEAD
git push origin main
# 4e47e23 is the spec commit — adjust to whatever the spec commit hash actually is
```

Or surgically:
- Revert Task 1 alone if the nav cleanup turns out to break a hidden page's UX
- Revert Task 5 alone to remove the PDF binary without touching the source
