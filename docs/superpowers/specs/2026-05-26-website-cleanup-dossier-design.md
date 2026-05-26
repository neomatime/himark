# Website cleanup + Engagement Dossier — design

**Date:** 2026-05-26
**Status:** Approved — ready for implementation plan
**Scope:** Collapse the public website to eight focused surfaces and consolidate the deep institutional content into a single print-ready HTML file (`/dossier.html`) that exports as a polished PDF for cold-email attachment.

---

## 1. Goals & non-goals

### Goals
- Reduce the visible footprint of the website so each remaining surface earns its place.
- Move the long-form institutional content — Method, AIRaaS, Mandate detail, principal bios, Journal essays — out of the public navigation and into a single curated document.
- Produce a polished PDF the principal team can attach to outbound emails, hand to qualified prospects, or print as a leave-behind.
- Reuse the existing editorial design system (Source Sans 3 / Roboto / JetBrains Mono, midnight/ocean/off palette, mono coords) so the document feels like the firm, not a generic deck.

### Non-goals
- Deleting any HTML page. Every existing page stays linkable — they just stop appearing in the main menu.
- Rewriting the home / about / services / team / apply / counsel / contact / subscribe pages. They keep their current content.
- Lead-gen gating for the PDF (no form-wall to download). The PDF is a private artefact the team sends out; it never lives on a public URL.
- A new dynamic PDF-generation pipeline. The document is hand-curated HTML printed to PDF via Chrome. Updates re-print.

---

## 2. Decisions locked

| Decision | Choice |
|---|---|
| Document purpose | Cold-email attachment to qualified prospects |
| Cut depth | Heavy — eight visible surfaces, five secondary pages hidden from nav |
| Counsel/Sessions in main nav | Stays primary |
| Voice/Journal essays in dossier | Included as section 08 |
| PDF generation | Chrome's Print → Save as PDF (no toolchain dependencies) |
| Pre-rendered PDF committed | Yes — `/dossier/HIMARK-Engagement-Dossier.pdf` lives in the repo |
| Dossier URL | `/dossier.html` — NOINDEX, removed from sitemap |
| Public form-gating for PDF | No |

---

## 3. Website — kept vs. hidden

### The eight kept surfaces

| Coord | File | Role on the public site |
|---|---|---|
| `[ 00 ]` | `home.html` | Brand, positioning, single CTA to Apply |
| `[ 01 ]` | `about.html` | Founding doctrine, kept lean — one screen of copy |
| `[ 02 ]` | `services.html` | Mandate tiers — overview only, no deep description |
| `[ 05 ]` | `team.html` | Principals — faces + role. The principals are the product. |
| `[ 08 ]` | `apply.html` | The intake form — primary conversion |
| `[ 08.A ]` | `sessions.html` | Counsel session booking — light-touch entry |
| `[ 09 ]` | `contact.html` | Direct line to the firm |
| `[ 09.A ]` | `subscribe.html` | Journal signup — soft secondary |

### The five hidden surfaces

These pages remain on disk, remain linkable from anywhere (including the dossier), but disappear from the main nav and footer columns:

- `press.html` — press kit (still linkable from the dossier's back cover)
- `insights.html` — Journal index
- `work.html` — engagements log
- `process.html` — Method detail page
- `product.html` — AIRaaS detail page
- The Press contact card on `press.html` itself stays intact (it's the press kit page's own surface)

Each hidden page's sitemap priority drops from its current 0.5–0.7 down to 0.3. Robots remain `index,follow` — they're still indexable; just lower priority.

### What "hidden from nav" means concretely

- The `#menu-panel` `<ul class="menu-list">` on every page (currently lists 00–09 with sub-items) is rewritten to list only the eight kept surfaces.
- Footer columns are rewritten to remove direct links to the five hidden pages. Press kit retains a footer link only on legal pages (privacy/terms/cookies/security) for transparency. Insights gets a Subscribe-page cross-link in the footer Firm column.
- `data-page="press|journal|engagements|method|airass"` references in the body content stay as-is — internal cross-links continue to work via the router.

---

## 4. Dossier structure

A single `dossier.html` page, ~20–25 letter-size pages when printed.

| Page | Section | Source content | Approx pages |
|---|---|---|---|
| 1 | **Cover** | Wordmark · "Engagement Dossier · 2026" · coord `[ DOSSIER · 2026 ]` | 1 |
| 2 | **Foreword** | Founding doctrine — clarity precedes scale, volume is a tax on quality, engagements are earned | 1 |
| 3–4 | **The Firm** | Who, when (founded 2026 in Randburg), where, structure (independent), scale (deliberately limited), source: about.html + press.html boilerplate | 2 |
| 5–8 | **The Principals** | Full bio per principal — Matime, Mokgwadi, Mothiba, Cammay. Each principal gets a half-to-full page with bio, doctrine, domains. Source: team.html principals array | 4 |
| 9–11 | **Mandates** | Tier 01 Signature Partner, Tier 02 Growth Partner, Tier 03 Private Partner — each in depth. Source: services.html tier descriptions | 3 |
| 12–13 | **The Method** | Method Engine phase-by-phase. Source: process.html Method Engine SVG + copy | 2 |
| 14–15 | **AIRaaS** | The AI integration platform — pipeline, principles, what it does. Source: product.html | 2 |
| 16 | **Engagement Model** | How to apply, response times, what we need from you. Source: apply.html intake copy | 1 |
| 17–19 | **Voice — selected essays** | Three selected Journal essays in long-form. Source: insights.html | 3 |
| 20 | **Boilerplate · Contact · Reference** | Press boilerplate, direct contact, reference number (`HIMARK-DOSSIER-2026.05`) | 1 |
| Back | **End matter** | Wordmark + small print | 1 |

Total: ~21 pages.

---

## 5. Dossier — technical shape

### File
- **Path:** `dossier.html` at the site root.
- **NOINDEX:** `<meta name="robots" content="noindex,nofollow">` so search engines never list it.
- **Sitemap:** explicitly NOT listed in `sitemap.xml`.
- **No nav chrome:** the dossier doesn't load the wordmark / menu trigger / cookies banner / chat widget. It's a document, not a page.

### Print-CSS contract
```css
@page {
  size: Letter;            /* 8.5" × 11" */
  margin: 0;               /* page edges controlled inside via .dossier-page padding */
}

@media print {
  body { background: var(--off); }
  .dossier-page {
    page-break-after: always;
    width: 8.5in;
    min-height: 11in;
    padding: 0.85in 0.95in;
    box-sizing: border-box;
  }
  .dossier-page:last-of-type { page-break-after: auto; }
  .dossier-screen-only { display: none; }
}

@media screen {
  /* Stack pages with visual separation so the document is also readable
     on-screen as a single scroll. Add a print button. */
  .dossier-page {
    max-width: 8.5in;
    margin: 24px auto;
    background: var(--off);
    box-shadow: 0 12px 36px -16px rgba(28, 43, 58, 0.18);
  }
}
```

### Page anatomy
Every page is a `<section class="dossier-page" data-coord="[ 00.A ]">`. Inside:
- Top-left: coord (mono)
- Top-right: section title (mono)
- Body: per-section content
- Bottom-left: wordmark glyph
- Bottom-right: page number (set via CSS counter)

A small **"Print as PDF"** button visible only on screen (`.dossier-screen-only`) gives the team a one-click prompt.

### Brand consistency
The dossier uses the same CSS custom properties (`--midnight`, `--ocean`, `--ocean-dk`, `--ocean-lt`, `--off`) and the same three fonts as the rest of the site. CSS is scoped inline in `<style>` — no changes to `styles/styles.css`.

### Pre-rendered PDF
After the dossier HTML is final, the principal team prints it to PDF in Chrome (File → Print → "Save as PDF", layout = Letter, margins = None — letting our CSS control margins). The resulting PDF is committed at `dossier/HIMARK-Engagement-Dossier.pdf`. When dossier.html changes meaningfully, re-print and re-commit.

---

## 6. Files touched

| Path | Action | Notes |
|---|---|---|
| `home.html` through `dashboard/dashboard.html` (~20 pages) | Modify the `#menu-panel` and footer to reflect the new 8-surface nav | Side-panel `<ul class="menu-list">` and footer column lists |
| `sitemap.xml` | Modify — lower priority of hidden pages, keep dossier OUT | 5 priority changes |
| `dossier.html` | Create | New single page, ~600 lines |
| `dossier/HIMARK-Engagement-Dossier.pdf` | Create | Binary, ~3–5 MB |
| `docs/superpowers/specs/...-cleanup-dossier-design.md` | This spec | |
| `docs/superpowers/plans/...-cleanup-dossier.md` | Implementation plan | |

No changes to `styles/styles.css`, `images.config.js`, `main/main.js`, or any `api/*.js` file.

---

## 7. Acceptance criteria

The work is done when all of these hold:

1. The eight kept surfaces all show only the eight-item menu when their menu trigger is clicked.
2. Press / Insights / Work / Process / Product no longer appear in any page's footer columns (legal pages excepted for Press).
3. Direct navigation to a hidden page (e.g. `/insights.html`) still loads and the page works.
4. `sitemap.xml` lists the eight kept pages at their existing priorities, the dossier is absent, and the five hidden pages all sit at priority 0.3.
5. `dossier.html` opens in a browser, renders ~21 distinct pages stacked vertically on screen with the "Print as PDF" button visible.
6. Printing `dossier.html` from Chrome with default A4/Letter settings produces a PDF with: correct page breaks (no orphan headings, no split paragraphs across pages), readable typography, the editorial design system intact.
7. `dossier/HIMARK-Engagement-Dossier.pdf` is committed and matches the rendered output.
8. `/dossier.html` returns `noindex,nofollow` in its meta robots tag.

---

## 8. Out of scope (parked)

- Lead-gen gating (form-walled PDF download).
- A public landing page for the dossier (e.g. `/get-the-dossier`).
- Auto-rebuild of the PDF on every commit (CI/CD pipeline).
- Re-introducing the hidden pages later — that's a separate decision.
- Localised versions of the dossier (English-only for now).
- The HubSpot proxy / `/api/apply` situation. Resolves later; orthogonal.

---

## 9. Open questions

None. All four key decisions (purpose, cut depth, format, gating) were resolved during brainstorming.
