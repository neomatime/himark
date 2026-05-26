# Newsletter wiring — design

**Date:** 2026-05-25
**Status:** Approved — ready for implementation plan
**Scope:** Add a subscribe flow for "The Journal — Bulletin from the Principal Office," the irregular publication already positioned on `insights.html`. Capture subscribers into HubSpot via the same pattern `api/chat.js` uses today.

---

## 1. Goals & non-goals

### Goals
- Turn the existing "Subscribe via Direct for new-issue notification" suggestion on `insights.html` into a real form that captures the visitor's email + first name and forwards them to HubSpot.
- Provide a second, dedicated `/subscribe.html` surface that can be linked directly (from press kit, social bios, future emails) without dragging visitors through the full journal page.
- Keep the editorial system intact — same mono coords, italic-suffix headlines, glass-card grammar.

### Non-goals
- Sending the actual newsletter. (HubSpot Marketing Hub or a separate ESP will handle delivery; out of scope.)
- Double opt-in confirmation. (Explicitly chosen against — see §6.)
- Building a dedicated "journal subscribers" static list in HubSpot. (Tagged via property; segment can be built later from `himark_source` searches.)
- A confirmation email at the moment of subscription. (Manual welcome by the principal team on first issue; out of scope for this change.)
- Bot-defence beyond honeypot + min-time-on-form (no CAPTCHA, no challenge UI).

---

## 2. User-facing decisions

| Decision         | Choice                                                          |
| ---------------- | --------------------------------------------------------------- |
| Form fields      | First name + email (two fields).                                |
| Placement        | (a) Inline block on `insights.html`. (b) Standalone `subscribe.html`. |
| Opt-in           | Single opt-in.                                                  |
| HubSpot routing  | Source tag only — `himark_source: 'journal-subscribe'`, `himark_tier: 'journal'`. |
| Success cadence  | "The next issue lands when there's something to say."           |
| Spam defence     | Honeypot field + min-time-on-form (no CAPTCHA).                 |

---

## 3. Architecture

```
┌─────────────────────────┐       ┌─────────────────────────┐
│ insights.html           │       │ subscribe.html          │
│ (inline form block)     │       │ (dedicated page)        │
└──────────┬──────────────┘       └────────────┬────────────┘
           │                                   │
           └────────────── POST ───────────────┘
                          │
                          ▼
                ┌──────────────────────┐
                │ /api/subscribe.js    │
                │  (Vercel function)   │
                │                      │
                │  • validate          │
                │  • bot checks        │
                │  • POST contact      │
                │  • 409 → PATCH       │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ HubSpot CRM v3       │
                │ /crm/v3/objects/     │
                │       contacts       │
                └──────────────────────┘
```

The two front-end surfaces are independent HTML markup but share a single inline `<script>` block per page. The script is small enough that duplication is cheaper than introducing a new shared JS file. The two scripts POST to the same `/api/subscribe.js` endpoint.

---

## 4. Backend — `/api/subscribe.js`

### Contract

**Request**
```
POST /api/subscribe
Content-Type: application/json

{
  "email": "ada@example.com",
  "firstname": "Ada",
  "_hp": "",                  // honeypot — must be empty
  "_t": 1737800000000         // ms timestamp of when the form was rendered
}
```

**Response — success**
```
200 OK
{ "ok": true }
```

**Response — validation failure**
```
400 Bad Request
{ "ok": false, "error": "invalid-email" | "missing-name" | "honeypot" | "too-fast" }
```

**Response — HubSpot token missing (degraded mode)**
```
200 OK
{ "ok": true, "queued": true }
```
The visitor still sees success; the email is logged server-side so the team can recover the address later.

**Response — HubSpot API failure**
```
502 Bad Gateway
{ "ok": false, "error": "upstream-failed" }
```

### Logic

1. Method check — only POST. GET returns a small JSON diagnostic blob (mirrors the pattern in `chat.js`) — `{ ok:true, function:'api/subscribe', hubspotConfigured: bool }`.
2. Parse body. Reject if missing.
3. Validate email against `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Trim firstname. Require firstname length 1–80.
4. Reject if honeypot is non-empty (`_hp !== ''`).
5. Reject if `Date.now() - _t < 2000` (form submitted in under 2 seconds — clearly automated).
6. If `HUBSPOT_ACCESS_TOKEN` is missing, log the capture and return `{ ok:true, queued:true }`.
7. POST to `https://api.hubapi.com/crm/v3/objects/contacts` with properties:
   - `email`
   - `firstname`
   - `lifecyclestage: 'subscriber'`
   - `hs_lead_status: 'NEW'`
   - `himark_source: 'journal-subscribe'`
   - `himark_tier: 'journal'`
8. On 409 conflict, parse the existing contact id from the response body and PATCH the same properties on it. (Mirrors the `pushToHubSpot` function in `chat.js`.)
9. Any other non-OK response → log + return 502.

### Idempotency
Calling subscribe twice with the same email is safe. The 409 → PATCH branch updates rather than rejects, and properties only stamp the source tag — nothing gets duplicated.

---

## 5. Frontend

### 5.1 Shared markup pattern

Both surfaces render the same form skeleton. The visible class names differ between surfaces (inline vs. standalone) so each page's CSS can scope its own layout. The interactive script is duplicated per page but parametrised at the top.

```html
<form class="js-sub-form" novalidate>
  <input type="hidden" name="_hp" value=""
         tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px"/>
  <input type="hidden" name="_t" value="<rendered-ms>"/>

  <div class="js-sub-row">
    <label>
      <span>First name</span>
      <input type="text" name="firstname" required autocomplete="given-name" maxlength="80"/>
    </label>
    <label>
      <span>Email</span>
      <input type="email" name="email" required autocomplete="email" inputmode="email"/>
    </label>
  </div>

  <button type="submit" class="js-sub-submit">
    <span class="js-sub-label">Subscribe</span>
    <span class="js-sub-arrow">→</span>
  </button>

  <p class="js-sub-msg" role="status" aria-live="polite"></p>
</form>
```

The `_t` value is set on render via inline JS: `<input ... value="${Date.now()}"/>`.

### 5.2 States

| State        | Triggered by                                     | UI                                                                      |
| ------------ | ------------------------------------------------ | ----------------------------------------------------------------------- |
| `idle`       | Initial render                                   | Form visible. Submit button shows "Subscribe".                          |
| `submitting` | Submit clicked + client validation passes        | Button text → "Sending…", `disabled` + `aria-busy="true"`.              |
| `success`    | 200 OK from `/api/subscribe`                     | Form is replaced in-place with a success card (see copy below).         |
| `error`      | Non-2xx response or network error                | `js-sub-msg` shows the error copy. Form stays editable for retry.       |

### 5.3 Copy

| Block            | Copy                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Eyebrow (inline) | `[ 07.B · NEWSLETTER ]` (the journal already uses 07.A — keeps the subscribe block inside the journal family) |
| Eyebrow (page)   | `[ 07.C · SUBSCRIBE ]` (dedicated standalone surface, same family)                                                                  |
| Headline inline  | "The Journal, *in your inbox.*"                                                                                                     |
| Headline page    | "The bulletin, *direct.*"                                                                                                           |
| Body (page)      | "The Journal is irregular by design — it issues when there is something to say, not on a schedule. Three or four issues most quarters. No tracking pixels, no third-party broadcast." |
| Submit label     | "Subscribe"                                                                                                                         |
| Success card     | Eyebrow "[ ✓ ] On the list" · Headline "You're in." · Body "The next issue lands when there's something to say. Until then, the inbox stays quiet." |
| Generic error    | "Couldn't reach the desk. Try again in a moment, or email **info@himark.co.za** directly."                                          |
| Invalid email    | "That doesn't look like an email address. Check the spelling and try again."                                                        |

### 5.4 Accessibility
- Form fields have visible labels (not placeholder-only).
- `aria-live="polite"` on the message paragraph so screen readers hear state changes.
- `aria-busy="true"` on the submit button during in-flight submission.
- Tab order: firstname → email → submit. Honeypot has `tabindex="-1"` so keyboard users skip it.
- Error message includes the actionable next step (retry vs. fallback email).
- Submit button minimum 44px tall to match the tap-target system already in place.

---

## 6. Why single opt-in

POPIA (South Africa's privacy regime) and GDPR both allow single opt-in when consent is unambiguous and the user understands what they're subscribing to. Both conditions hold here: the form copy names the publication, names the cadence, and the visitor is on either `insights.html` (already reading the journal) or `subscribe.html` (a single-purpose subscribe page). Double opt-in would add a confirmation email step that this site has no infra for yet (no transactional email provider wired up) and would create drop-off without meaningful protection at our list size.

If the list grows past low thousands or starts attracting bot signups, revisit and either layer in a confirmation email or HubSpot Marketing's built-in double opt-in flow.

---

## 7. HubSpot setup checklist

Before this is live in production, ensure inside the HubSpot account:
1. **Custom properties MUST exist** at Settings → Properties → Contacts (Single-line text):
   - `himark_source`
   - `himark_tier`
   - `himark_brief`
   - `himark_timeline`
   - `himark_budget`

   **Important — verified in production 2026-05-26:** HubSpot does NOT silently ignore unknown properties as earlier docs claimed. If even one is missing, the v3 `/crm/v3/objects/contacts` POST returns 400 `PROPERTY_DOESNT_EXIST` and the entire contact create fails — the lead is lost. The first three properties are also used by `api/chat.js` so creating all five at once is the right move.

2. The Private App access token in `HUBSPOT_ACCESS_TOKEN` has the `crm.objects.contacts.write` scope. (`.read` is not strictly required — the 409→PATCH flow only needs write.)

3. (Optional) Build a HubSpot active list with filter `himark_source EQUALS journal-subscribe` so the team can send broadcasts to journal subscribers later. Not blocking for this change.

---

## 8. Files touched

| Path                                | Change                                                  |
| ----------------------------------- | ------------------------------------------------------- |
| `api/subscribe.js`                  | **New.** Vercel serverless function. See §4.            |
| `insights.html`                     | Replace the "Subscribe via Direct" sentence with an inline subscribe block (form markup + page-scoped CSS + inline script). Update `aria-current`/`data-page` where relevant. |
| `subscribe.html`                    | **New.** Full page mirroring `apply.html`'s editorial scaffolding (hero, footer, nav). Hosts the dedicated subscribe surface. |
| `main/main.js`                      | Add `subscribe:'subscribe.html'` to `PAGE_URLS`.        |
| `sitemap.xml`                       | Add `https://www.himark.co.za/subscribe.html` at priority 0.6. |
| `press.html`                        | Add a "Journal" row in the press contact card linking to `subscribe.html`. (Small enrichment — readers who land on the press kit may also be the audience for the journal.) |

No CSS changes to `styles/styles.css` — all new styles are scoped inline per page using the same `.prk-*`-style convention introduced on the press kit.

---

## 9. Open questions

None at this time. The user reviewed the four key decisions (fields, placement, opt-in, routing) and the design above before this spec was written.

---

## 10. Out of scope (recorded for later)

- HubSpot static list creation for journal subscribers.
- Welcome email automation (manual until volume justifies).
- Subscriber preference centre (unsubscribe URL, frequency choice).
- A/B testing the form copy or button label.
- Integrating Plausible custom-event tracking on submit (low-cost addition — defer until we want subscribe-page conversion analytics).
