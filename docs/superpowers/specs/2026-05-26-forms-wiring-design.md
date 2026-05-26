# Forms wiring — Counsel + Apply — design

**Date:** 2026-05-26
**Status:** Approved — ready for implementation plan
**Scope:** Wire the two remaining unwired forms on himark.co.za to HubSpot:
1. The Counsel **session booking form** on `sessions.html` — has a placeholder submit handler and a fully-designed local success overlay, but no network call.
2. The **engagement intake form** on `apply.html` — has no submit handler at all.

Both endpoints mirror the pattern established by `api/subscribe.js` (which itself mirrors `api/chat.js`).

---

## 1. Goals & non-goals

### Goals
- Capture every Counsel-session booking and every engagement application into HubSpot as a Contact, tagged with the right `himark_source` + `himark_tier`.
- Survive duplicate submissions (resubmit with the same email → 200, contact updated in place).
- Use the existing five custom properties — no new HubSpot properties to create.
- Match the existing editorial voice on success and error copy.
- Don't break either form's visual design.

### Non-goals
- A booking-conflict check (the calendar shows the same slots to everyone; first-write wins, principals reconcile manually).
- Sending the visitor a confirmation email (HubSpot Workflows can do this later; not blocking this change).
- Saving the application reference number to HubSpot (`createdate` + email is sufficient for lookup; reference is a vanity number for the visitor only).
- Adding any new HubSpot properties.
- A reCAPTCHA — keeping honeypot + min-time as the bot defence baseline established for the newsletter.

---

## 2. Decisions locked

| Decision | Choice |
|---|---|
| Why-HIMARK answer on Apply | Append to `himark_brief` with separator `\n\n--- Why HIMARK ---\n` |
| Position & Company field on Apply | Split on ` · ` if present, fallback: stuff into jobtitle, leave company blank |
| Apply success state | Glass card mirroring newsletter style, with reference number row |
| Endpoint names | `/api/session-booking` and `/api/apply` |
| Session `himark_tier` value | Literal string `'session'` |
| Apply `himark_tier` value | Clean slug (`tier-01`, `tier-02`, `tier-03`, `airass`, `discovery`) |
| Sessions success overlay | Reuse the existing `#sx-success` visual overlay; gate on POST 2xx |
| Apply success card | Mirror newsletter pattern inside the form-card area, dark surface |
| Fail-open vs fail-closed | Fail-closed: success state only shown after 2xx response |
| Bot defence | Honeypot `_hp` + min-time-on-form `_t` (2 second minimum) |

---

## 3. Architecture

```
┌───────────────────────────┐       ┌───────────────────────────┐
│ sessions.html             │       │ apply.html                │
│  bkc-form                 │       │  itk-form                 │
└────────────┬──────────────┘       └─────────────┬─────────────┘
             │                                    │
             ▼                                    ▼
   ┌──────────────────────┐            ┌──────────────────────┐
   │ /api/session-booking │            │ /api/apply           │
   │  (Vercel function)   │            │  (Vercel function)   │
   └──────────┬───────────┘            └──────────┬───────────┘
              │                                   │
              └────────────── POST ───────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │ HubSpot CRM v3       │
                    │ /crm/v3/objects/     │
                    │       contacts       │
                    └──────────────────────┘
```

Two endpoints, two frontend handlers. ~80 lines of HubSpot helper logic duplicated across the three functions (`api/subscribe.js`, `api/session-booking.js`, `api/apply.js`). Acceptable duplication — the alternative (a shared `api/_hubspot.js` import) would require changes to the function bundling assumptions and isn't worth the gain at this size.

---

## 4. Backend — `/api/session-booking.js`

### Request

```
POST /api/session-booking
Content-Type: application/json

{
  "name":    "Ada Lovelace",
  "email":   "ada@example.com",
  "company": "Analytical Engine Ltd",
  "role":    "Founder",
  "format":  "video" | "in-person",
  "brief":   "We want to talk through positioning for our Series A.",
  "window":  "Friday, 30 May 2026 · 14:00 SAST",
  "_hp":     "",
  "_t":      1737800000000
}
```

### Responses

| Status | Body | When |
|---|---|---|
| 200 | `{ "ok": true }` | HubSpot create OR update succeeded |
| 200 | `{ "ok": true, "queued": true }` | `HUBSPOT_ACCESS_TOKEN` missing — captured in logs |
| 400 | `{ "ok": false, "error": "invalid-email" \| "missing-name" \| "missing-window" \| "missing-format" \| "missing-brief" \| "honeypot" \| "too-fast" \| "invalid-body" }` | Validation failure |
| 405 | `{ "ok": false, "error": "method-not-allowed" }` | Anything other than GET/POST |
| 502 | `{ "ok": false, "error": "upstream-failed" }` | HubSpot non-2xx |

GET returns a diagnostic blob (same shape as `api/subscribe.js`).

### Logic

1. Method dispatch (GET → diagnostic; POST → continue; else → 405).
2. Body parse + guard.
3. Honeypot check (`_hp !== ''` → 400 honeypot).
4. Min-time check (`Date.now() - _t < 2000` AND `_t > 0` → 400 too-fast).
5. Validate:
   - `email` matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - `name` length 1–200
   - `window` non-empty (the calendar selection)
   - `format` is one of `video` / `in-person`
   - `brief` length 1–4000
6. Split `name` on first whitespace → firstname / lastname (lastname may be empty if single token).
7. Fold window + format → `timelineStr`:
   - `format === 'in-person'` → `${window} · In person`
   - else → `${window} · Video call`
8. Build properties:
   ```
   email, firstname, lastname,
   company, jobtitle: role,
   phone: '',
   hs_lead_status: 'NEW',
   lifecyclestage: 'lead',
   himark_source: 'session-form',
   himark_tier: 'session',
   himark_brief: brief,
   himark_timeline: timelineStr,
   himark_budget: ''
   ```
9. POST to HubSpot. On 409, parse Existing ID and PATCH. (Same helper as `api/subscribe.js` line 38–98.)
10. Map result → response per the table above.

---

## 5. Backend — `/api/apply.js`

### Request

```
POST /api/apply
Content-Type: application/json

{
  "name":             "Ada Lovelace",
  "position_company": "Founder · Analytical Engine Ltd",
  "email":            "ada@example.com",
  "phone":            "+27 11 555 0123",
  "tier":             "tier-02",
  "brief":            "We are a 40-person fintech raising Series A...",
  "why":              "HIMARK's positioning around founder-led growth matches...",
  "_hp":              "",
  "_t":               1737800000000
}
```

### Responses

| Status | Body | When |
|---|---|---|
| 200 | `{ "ok": true, "reference": "APP-20260526-143005" }` | HubSpot create OR update succeeded |
| 200 | `{ "ok": true, "queued": true, "reference": "APP-..." }` | Token missing — captured in logs |
| 400 | `{ "ok": false, "error": "invalid-email" \| "missing-name" \| "missing-position-company" \| "brief-too-short" \| "honeypot" \| "too-fast" \| "invalid-body" }` | Validation failure |
| 405 | `{ "ok": false, "error": "method-not-allowed" }` | Anything other than GET/POST |
| 502 | `{ "ok": false, "error": "upstream-failed" }` | HubSpot non-2xx |

GET returns a diagnostic blob.

### Logic

1. Method dispatch.
2. Body parse + guard.
3. Bot defence (honeypot + min-time, same as session-booking).
4. Validate:
   - `name` 1–200
   - `position_company` 1–200
   - `email` regex
   - `brief` length ≥ 200 (matches the visible form copy)
   - `tier` optional — if present, must be one of the five known slugs (`tier-01`, `tier-02`, `tier-03`, `airass`, `discovery`); else stored as empty string
5. Split `name` on first whitespace → firstname / lastname.
6. Split `position_company` on ` · ` (em-spaced bullet) → jobtitle / company:
   - If exactly one ` · ` present → `jobtitle = parts[0].trim()`, `company = parts[1].trim()`
   - Otherwise → `jobtitle = position_company.trim()`, `company = ''`
7. Fold brief + why → `briefStr`:
   - If `why` is non-empty: `${brief}\n\n--- Why HIMARK ---\n${why}`
   - Else: `brief`
8. Generate reference:
   ```js
   const d = new Date();
   const pad = n => String(n).padStart(2, '0');
   const reference = `APP-${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
   ```
9. Build properties:
   ```
   email, firstname, lastname,
   company, jobtitle,
   phone: phone || '',
   hs_lead_status: 'NEW',
   lifecyclestage: 'lead',
   himark_source: 'apply-form',
   himark_tier: tier || '',
   himark_brief: briefStr,
   himark_timeline: '',
   himark_budget: ''
   ```
10. POST to HubSpot. 409 → PATCH (same helper).
11. Response includes `reference` in success AND queued cases. (Visitor always sees a reference, even if HubSpot wasn't reached, so they can reference their submission via email if needed.)

---

## 6. Frontend — sessions.html

### Markup changes

Inside `<form id="bkc-form">`, add two hidden inputs at the top of the existing field grid:

```html
<input type="text" name="_hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" class="bkc-hp"/>
<input type="hidden" name="_t" value="0" data-bkc-t/>
```

Also add a status paragraph just below the submit button:

```html
<p class="bkc-msg" role="status" aria-live="polite"></p>
```

### CSS additions

In the page-scoped `<style>` block:

```css
.bkc-hp{ position:absolute; left:-9999px; width:1px; height:1px; opacity:0; }
.bkc-msg{
  font-family:'Roboto',sans-serif;
  font-weight:300;
  font-size:13px;
  color:#E0A0A0;  /* legible on the midnight surface */
  margin:12px 0 0;
  min-height:1em;
}
.bkc-msg:empty{ display:none; }
.bkc-form .bkc-submit[aria-busy="true"]{ opacity:.7; cursor:wait; }
```

### Submit handler

Rewrite `window.submitBooking`:

1. Stamp `Date.now()` onto `[data-bkc-t]` on page load (separate `DOMContentLoaded` block, scoped IIFE).
2. On submit:
   - `preventDefault()`.
   - Keep the existing alert if date/time not selected.
   - Disable submit + `aria-busy="true"` + label `Sending…`.
   - Clear any previous `.bkc-msg` text.
   - Compute `whenStr` and `formatStr` as today.
   - POST to `/api/session-booking` with `{ name, email, company, role, format, brief, window: whenStr, _hp, _t }`.
   - On 2xx → populate the existing `#sx-success-*` slots (same code as today), then `#sx-success.classList.add('show')`.
   - On error → set `.bkc-msg.textContent` to the right copy (slug-based) and keep the form editable.
   - Always restore submit state (button label, `aria-busy`, `disabled`).

### Error copy (form is on dark midnight surface)

- `invalid-email` → "That doesn't look like an email address. Check the spelling and try again."
- `missing-name` → "Add your name and try again."
- `missing-brief` → "Add the brief so the principal can prepare."
- `missing-window` / `missing-format` → "Pick a date, time and format first."
- generic → "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly."

---

## 7. Frontend — apply.html

### Markup changes

1. Add `name="..."` to every existing input/textarea/select per the table in section 5 (currently they have none).
2. Add explicit `value="..."` slugs to each tier dropdown option:
   ```html
   <option value="">Select a mandate</option>
   <option value="tier-01">Tier 01 — Signature Partner</option>
   <option value="tier-02">Tier 02 — Growth Partner</option>
   <option value="tier-03">Tier 03 — Private Partner</option>
   <option value="airass">AIRaaS — Receptionist Product</option>
   <option value="discovery">Discovery / Not yet decided</option>
   ```
3. Add two hidden inputs at the top of the field grid (honeypot + `_t`).
4. Add a `<p class="itk-msg" role="status" aria-live="polite">` inside the form-foot, just above the submit button.
5. Add a hidden success-card sibling of the form, inside the form-card container:
   ```html
   <div class="itk-success" hidden>
     <span class="itk-success-coord">[ ✓ ]  APPLICATION RECEIVED</span>
     <h2 class="itk-success-hl">Filed.</h2>
     <p class="itk-success-body">A principal will review your brief and respond within five working days. The record has been logged.</p>
     <div class="itk-success-ref">
       <span class="itk-success-ref-l">Reference</span>
       <span class="itk-success-ref-v" data-ref></span>
     </div>
   </div>
   ```

### CSS additions

Page-scoped, mirroring the form's existing dark surface:

```css
.itk-hp{ position:absolute; left:-9999px; width:1px; height:1px; opacity:0; }
.itk-msg{
  font-family:'Roboto',sans-serif;
  font-weight:300;
  font-size:13px;
  color:#E0A0A0;
  margin:12px 0 0;
  min-height:1em;
}
.itk-msg:empty{ display:none; }
.itk-submit[aria-busy="true"]{ opacity:.7; cursor:wait; }

.itk-success{
  background:var(--midnight);
  border:1px solid rgba(138,173,184,.22);
  padding:64px 56px;
  color:var(--off);
}
.itk-success-coord{
  display:block;
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  letter-spacing:.22em;
  color:var(--ocean-lt);
  text-transform:uppercase;
  margin-bottom:18px;
}
.itk-success-hl{
  font-family:'Source Sans 3',sans-serif;
  font-weight:300;
  font-size:clamp(42px,4.4vw,64px);
  line-height:1;
  letter-spacing:-.02em;
  margin:0 0 22px;
  color:var(--off);
}
.itk-success-body{
  font-family:'Roboto',sans-serif;
  font-weight:300;
  font-size:16px;
  line-height:1.6;
  color:rgba(226,240,240,.78);
  margin:0 0 30px;
  max-width:540px;
}
.itk-success-ref{
  display:flex;
  flex-direction:column;
  gap:6px;
  padding-top:24px;
  border-top:1px solid rgba(138,173,184,.18);
  max-width:340px;
}
.itk-success-ref-l{
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  letter-spacing:.2em;
  color:var(--ocean-lt);
  text-transform:uppercase;
}
.itk-success-ref-v{
  font-family:'JetBrains Mono',monospace;
  font-size:16px;
  color:var(--off);
  letter-spacing:.08em;
}
```

### Submit handler (new IIFE script block)

Mirror the newsletter handler. On 2xx:
1. Hide the form.
2. Populate `[data-ref]` with `data.reference`.
3. Reveal `.itk-success`.
4. Smooth-scroll the success card into view.

### Client-side validation
- `name`, `position_company`, `email`, `brief` are required.
- email regex check.
- `brief.length >= 200` — if shorter, inline message "The brief needs to be at least 200 characters." Don't POST.

### Error copy (dark surface)
- `invalid-email` → "That doesn't look like an email address. Check the spelling and try again."
- `missing-name` → "Add your name and try again."
- `missing-position-company` → "Add your role and company."
- `brief-too-short` → "The brief needs to be at least 200 characters."
- generic → "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly."

---

## 8. HubSpot impact summary

| Form | `himark_source` | `himark_tier` | Notes |
|---|---|---|---|
| Newsletter (existing) | `journal-subscribe` | `journal` | shipped |
| Atlas chat lead (existing) | `atlas-chat` | `unsure` or visitor-stated | shipped |
| Atlas chat session (existing) | `atlas-chat-session-booking` | `session` | shipped |
| Counsel session form (this PR) | `session-form` | `session` | new |
| Apply intake form (this PR) | `apply-form` | tier slug or empty | new |

Five distinct source slugs means HubSpot active lists can segment by precisely which surface captured the contact.

---

## 9. Files touched

| Path | Change |
|---|---|
| `api/session-booking.js` | **New.** Vercel function. See §4. |
| `api/apply.js` | **New.** Vercel function. See §5. |
| `sessions.html` | Modify the `<form id="bkc-form">` markup (add honeypot/_t/msg slot), add page-scoped CSS, rewrite `submitBooking`. |
| `apply.html` | Add `name=` attributes to fields, add explicit `value=` slugs to tier dropdown, add honeypot/_t/msg/success markup, add page-scoped CSS, add new submit-handler IIFE script block. |

No changes to `styles/styles.css`, `main/main.js`, sitemap, or any other page.

No new HubSpot properties to create — the five existing properties cover both endpoints.

---

## 10. Out of scope (recorded for later)

- Conflict detection on session bookings (multiple visitors picking the same slot).
- Automated visitor confirmation email (HubSpot Workflow once the team is ready).
- Storing the application reference number to HubSpot.
- A/B testing form copy.
- Plausible custom-event tracking on submit success.
- Resubmit cool-down (the 409→PATCH path already handles duplicates server-side; a UI-level cool-down isn't justified yet).
- File attachments on Apply (pitch decks, portfolio links).

---

## 11. Open questions

None. All four key decisions and two follow-up confirmations were resolved during brainstorming.
