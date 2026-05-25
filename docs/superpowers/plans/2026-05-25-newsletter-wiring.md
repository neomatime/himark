# Newsletter wiring — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working email + first-name subscribe flow for The Journal — one inline form on `insights.html`, one dedicated `subscribe.html` page — both posting to a new `/api/subscribe` Vercel function that creates/updates a HubSpot CRM contact tagged `himark_source: 'journal-subscribe'`.

**Architecture:** New Vercel serverless function mirrors the HubSpot create-or-update pattern in `api/chat.js`. Two front-end surfaces share the same form skeleton and submit logic (duplicated inline per page — small enough that introducing a shared JS file would cost more than it saves). Honeypot + min-time-on-form for bot defence. Single opt-in. No new env vars beyond the already-configured `HUBSPOT_ACCESS_TOKEN`.

**Tech stack:** Vanilla HTML/CSS/JS, Vercel serverless functions (Node CommonJS), HubSpot CRM v3 REST API.

**Verification:** The repo has no automated test framework. "Test" steps in this plan mean: define the expected behaviour, implement, then verify by curling the endpoint or loading the page in a browser. Each task ends with a manual verification + git commit.

---

## File map

| Path                                  | Action                                          | Responsibility                                            |
| ------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `api/subscribe.js`                    | **Create**                                      | Validate body, push HubSpot contact, return JSON status.  |
| `main/main.js`                        | Modify (line ~22, the `PAGE_URLS` block)        | Register `subscribe` in the SPA router map.               |
| `insights.html`                       | Modify (the `[J.06]` "Forthcoming" cell ~L188)  | Replace the static sentence with inline form + script.    |
| `subscribe.html`                      | **Create**                                      | Standalone subscribe page mirroring `apply.html` scaffolding. |
| `press.html`                          | Modify (press contact card ~L1414)              | Append `[ 05 ] Journal` row linking to `/subscribe.html`. |
| `sitemap.xml`                         | Modify                                          | Add `subscribe.html` at priority 0.6.                     |

No changes to `styles/styles.css`. All new styles are page-scoped via inline `<style>` blocks following the convention used on `press.html`.

---

## Task 1 — Backend: `/api/subscribe.js`

**Files:**
- Create: `api/subscribe.js`

- [ ] **Step 1: Define the verification (what does success look like?)**

Three behaviours must hold after this task:

| Verification                              | How to run                                                                              | Expected                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GET diagnostic returns 200 JSON           | `curl -s http://localhost:3000/api/subscribe`                                           | `{"ok":true,"function":"api/subscribe","method":"GET", ...}`      |
| POST with invalid email returns 400       | `curl -s -X POST http://localhost:3000/api/subscribe -H "Content-Type: application/json" -d '{"email":"nope","firstname":"Ada","_hp":"","_t":0}'` | `{"ok":false,"error":"invalid-email"}` |
| POST with honeypot filled returns 400     | `curl -s -X POST http://localhost:3000/api/subscribe -H "Content-Type: application/json" -d '{"email":"ada@example.com","firstname":"Ada","_hp":"bot","_t":0}'` | `{"ok":false,"error":"honeypot"}` |

Hold these expectations in mind while implementing. Run them in Step 3.

- [ ] **Step 2: Implement `api/subscribe.js`**

Create the file with this exact content:

```javascript
/* HIMARK · Journal subscribe endpoint
   Vercel serverless function (CommonJS, no package.json required).

   Receives POST { email, firstname, _hp, _t } from the subscribe form
   on insights.html and subscribe.html. Validates, runs minimal bot
   defence, then creates or updates a HubSpot CRM contact tagged with
   himark_source: 'journal-subscribe'.

   Env vars:
     - HUBSPOT_ACCESS_TOKEN  (optional)  — HubSpot Private App token
                              with crm.objects.contacts.write scope.
                              Without it, the subscribe call still
                              returns 200 (queued:true) so the visitor
                              sees success; the email is logged for
                              manual recovery.

   Mirrors the pattern in api/chat.js — keep the two functions in
   structural sync if you touch one.
*/

'use strict';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FORM_MS = 2000;  // submissions faster than this are bots

function json(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/* HUBSPOT — create-or-update contact via v3 CRM. Same approach as
   pushToHubSpot in api/chat.js: POST first, on 409 parse existing
   id and PATCH. */
async function pushToHubSpot(record){
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.log('[subscribe] HUBSPOT_ACCESS_TOKEN not set — captured but not forwarded:', record.email);
    return { skipped: 'no-token' };
  }

  const properties = {
    email: record.email,
    firstname: record.firstname || '',
    lifecyclestage: 'subscriber',
    hs_lead_status: 'NEW',
    himark_source: 'journal-subscribe',
    himark_tier: 'journal'
  };

  let res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties })
  });

  if (res.ok) {
    console.log('[subscribe] hubspot: contact created for', record.email);
    return { created: true };
  }

  if (res.status === 409) {
    let existingId = null;
    try {
      const err = await res.json();
      const msg = err && err.message || '';
      const m = msg.match(/Existing ID:\s*(\d+)/i);
      if (m) existingId = m[1];
    } catch (_) {}
    if (existingId) {
      const patch = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });
      if (patch.ok) {
        console.log('[subscribe] hubspot: contact updated for', record.email);
        return { updated: true };
      }
      const t = await patch.text().catch(() => '');
      console.error('[subscribe] hubspot patch failed', patch.status, t.slice(0, 300));
      return { error: 'patch-failed', status: patch.status };
    }
    console.error('[subscribe] hubspot 409 but no existing id parsed');
    return { error: 'conflict-no-id' };
  }

  const t = await res.text().catch(() => '');
  console.error('[subscribe] hubspot create failed', res.status, t.slice(0, 300));
  return { error: 'create-failed', status: res.status };
}

module.exports = async (req, res) => {
  /* GET — diagnostic blob, used to verify deploy + env config. */
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      function: 'api/subscribe',
      method: 'GET',
      hubspotConfigured: !!process.env.HUBSPOT_ACCESS_TOKEN,
      runtime: process.version || 'unknown'
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method-not-allowed' });
  }

  /* Parse body. Vercel parses JSON automatically when content-type
     is application/json, but guard for both shapes. */
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') {
    return json(res, 400, { ok: false, error: 'invalid-body' });
  }

  const email     = String(body.email     || '').trim().toLowerCase();
  const firstname = String(body.firstname || '').trim();
  const hp        = String(body._hp || '').trim();
  const t         = Number(body._t) || 0;

  /* Honeypot — non-empty means a bot filled the hidden field. */
  if (hp !== '') {
    console.warn('[subscribe] honeypot triggered for', email);
    return json(res, 400, { ok: false, error: 'honeypot' });
  }

  /* Min time on form — submitted in under 2 seconds is suspicious. */
  if (t > 0 && (Date.now() - t) < MIN_FORM_MS) {
    console.warn('[subscribe] too-fast submission for', email);
    return json(res, 400, { ok: false, error: 'too-fast' });
  }

  /* Validation. */
  if (!firstname || firstname.length > 80) {
    return json(res, 400, { ok: false, error: 'missing-name' });
  }
  if (!EMAIL_RX.test(email)) {
    return json(res, 400, { ok: false, error: 'invalid-email' });
  }

  const result = await pushToHubSpot({ email, firstname });

  if (result.skipped === 'no-token') {
    return json(res, 200, { ok: true, queued: true });
  }
  if (result.created || result.updated) {
    return json(res, 200, { ok: true });
  }
  return json(res, 502, { ok: false, error: 'upstream-failed' });
};
```

- [ ] **Step 3: Verify with `vercel dev`**

Run the local Vercel dev server in a separate terminal:

```bash
npx vercel dev --listen 3000
```

Then run all three checks from Step 1:

```bash
# 1. GET diagnostic
curl -s http://localhost:3000/api/subscribe
# Expected: {"ok":true,"function":"api/subscribe","method":"GET","hubspotConfigured":true|false,"runtime":"v..."}

# 2. Invalid email
curl -s -X POST http://localhost:3000/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"nope","firstname":"Ada","_hp":"","_t":0}'
# Expected: {"ok":false,"error":"invalid-email"}

# 3. Honeypot triggered
curl -s -X POST http://localhost:3000/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","firstname":"Ada","_hp":"bot","_t":0}'
# Expected: {"ok":false,"error":"honeypot"}
```

If `vercel dev` is unavailable locally, deploy to a Vercel preview branch and run the same curls against the preview URL.

- [ ] **Step 4: Commit**

```bash
git add api/subscribe.js
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
api: add /api/subscribe — HubSpot newsletter signup

Mirrors api/chat.js HubSpot pattern. POST { email, firstname, _hp, _t }
creates or updates a contact tagged himark_source: 'journal-subscribe'.
Single opt-in. Honeypot + min-time-on-form bot defence. Returns 200
even when HUBSPOT_ACCESS_TOKEN is missing so the visitor sees success
and the email is logged for manual recovery.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Router map wiring

**Files:**
- Modify: `main/main.js` (around line 22, the `PAGE_URLS` map)

- [ ] **Step 1: Define the verification**

After this change, `goP('subscribe')` from any page should resolve to `subscribe.html` (root) or `../subscribe.html` (subdirectory).

- [ ] **Step 2: Add `subscribe` to `PAGE_URLS`**

In `main/main.js`, find:

```javascript
  engagements:'work.html',
  journal:'insights.html',
  direct:'contact.html',
  press:'press.html',
```

Add a line so it reads:

```javascript
  engagements:'work.html',
  journal:'insights.html',
  direct:'contact.html',
  press:'press.html',
  subscribe:'subscribe.html',
```

- [ ] **Step 3: Verify**

Run:

```bash
grep -n "subscribe:" main/main.js
```

Expected: `  subscribe:'subscribe.html',`

- [ ] **Step 4: Commit**

```bash
git add main/main.js
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "router: register subscribe page in PAGE_URLS"
```

---

## Task 3 — Inline subscribe block on `insights.html`

**Files:**
- Modify: `insights.html` (the `[J.06]` "Forthcoming" cell — currently around line 188)

- [ ] **Step 1: Define the verification**

After this change:
1. The "Forthcoming" cell in the journal grid is replaced with a subscribe form (name + email + button).
2. Submitting a valid email shows the success card in-place.
3. Submitting an invalid email shows an inline error message; the form stays editable.
4. The eyebrow reads `[ 07.B · NEWSLETTER ]`.
5. No console errors. Tab order: firstname → email → submit (honeypot skipped).

- [ ] **Step 2: Find the existing markup**

Open `insights.html`. Locate this exact block (currently around line 187-189):

```html
<div class="cap-cell r3d d2" data-idx="[J.06]">
<div class="cap-t">Forthcoming</div>
<p class="cap-d" style="margin-top:8px;font-style:italic;color:var(--ink-mut)">More issues will appear here as they are written. The journal is irregular by design — it issues when there is something to say, not on a schedule. Subscribe via <a class="mf-link" href="#" data-page="direct">Direct</a> for new-issue notification.</p>
</div>
```

- [ ] **Step 3: Replace with the subscribe block**

Replace the entire `<div class="cap-cell r3d d2" data-idx="[J.06]">…</div>` block with:

```html
<div class="cap-cell r3d d2 nl-cell" data-idx="[J.06]" id="nl-inline">
  <span class="nl-coord">[ 07.B · NEWSLETTER ]</span>
  <div class="cap-t">The Journal, <em style="font-style:italic;color:var(--ocean-dk)">in your inbox.</em></div>
  <p class="cap-d" style="margin-top:8px;color:var(--ink-mut)">Irregular by design — issues when there is something to say, not on a schedule. Three or four most quarters. No tracking pixels.</p>

  <form class="nl-form" id="nl-form-inline" novalidate>
    <input type="text" name="_hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" class="nl-hp"/>
    <input type="hidden" name="_t" value="0" data-nl-t/>

    <label class="nl-field">
      <span class="nl-field-l">First name</span>
      <input type="text" name="firstname" required autocomplete="given-name" maxlength="80" class="nl-input"/>
    </label>
    <label class="nl-field">
      <span class="nl-field-l">Email</span>
      <input type="email" name="email" required autocomplete="email" inputmode="email" class="nl-input"/>
    </label>

    <button type="submit" class="nl-submit">
      <span class="nl-submit-label">Subscribe</span>
      <span class="nl-submit-arrow">→</span>
    </button>

    <p class="nl-msg" role="status" aria-live="polite"></p>
  </form>

  <div class="nl-success" hidden>
    <span class="nl-success-coord">[ ✓ ]  On the list</span>
    <div class="cap-t">You're <em style="font-style:italic;color:var(--ocean-dk)">in.</em></div>
    <p class="cap-d" style="margin-top:8px;color:var(--ink-mut)">The next issue lands when there's something to say. Until then, the inbox stays quiet.</p>
  </div>
</div>
```

- [ ] **Step 4: Add the scoped CSS**

In `insights.html`, find the page's `<style>` block (search for the existing `.cap-cell` styles). Inside that block, append the following CSS:

```css
/* ===== Inline newsletter cell ===== */
.nl-cell{ position:relative; }
.nl-coord{
  display:block;
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  letter-spacing:.22em;
  color:var(--ocean);
  text-transform:uppercase;
  margin-bottom:10px;
}
.nl-form{
  display:flex;
  flex-direction:column;
  gap:14px;
  margin-top:18px;
}
.nl-field{
  display:flex;
  flex-direction:column;
  gap:6px;
}
.nl-field-l{
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  letter-spacing:.18em;
  color:var(--ocean);
  text-transform:uppercase;
}
.nl-input{
  font-family:'Roboto',sans-serif;
  font-weight:300;
  font-size:15px;
  color:var(--midnight);
  background:transparent;
  border:none;
  border-bottom:1px solid rgba(95,129,144,.3);
  padding:8px 0;
  transition:border-color .22s ease;
}
.nl-input:focus{ outline:none; border-bottom-color:var(--midnight); }
.nl-input::placeholder{ color:rgba(95,129,144,.5); }
.nl-hp{
  position:absolute;
  left:-9999px;
  width:1px;
  height:1px;
  opacity:0;
}
.nl-submit{
  margin-top:4px;
  align-self:flex-start;
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  letter-spacing:.18em;
  text-transform:uppercase;
  color:var(--off);
  background:var(--midnight);
  border:1px solid var(--midnight);
  padding:12px 18px;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  gap:10px;
  min-height:44px;
  transition:background .22s ease, color .22s ease;
}
.nl-submit:hover{ background:var(--ocean-dk); border-color:var(--ocean-dk); }
.nl-submit:focus-visible{ outline:2px solid var(--ocean); outline-offset:2px; }
.nl-submit[aria-busy="true"]{ opacity:.7; cursor:wait; }
.nl-submit-arrow{ font-size:14px; line-height:1; }
.nl-msg{
  font-family:'Roboto',sans-serif;
  font-weight:300;
  font-size:13px;
  color:#9A4A4A;
  margin:0;
  min-height:1em;
}
.nl-msg:empty{ display:none; }
.nl-success-coord{
  display:block;
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  letter-spacing:.22em;
  color:var(--ocean-dk);
  text-transform:uppercase;
  margin-bottom:10px;
}
@media (prefers-reduced-motion: reduce){
  .nl-submit, .nl-input{ transition:none; }
}
```

- [ ] **Step 5: Add the inline form-handler script**

Scroll to the bottom of `insights.html`, just before the closing `</body>` tag (and before `<script src="main/main.js"></script>` if it appears there). Add this script block:

```html
<script>
(function(){
  'use strict';
  var ENDPOINT = '/api/subscribe';

  function wire(formEl, successEl){
    if(!formEl) return;

    /* Stamp render time on the hidden _t input — used server-side to
       filter sub-2-second auto-submits. */
    var tEl = formEl.querySelector('[data-nl-t]');
    if(tEl) tEl.value = String(Date.now());

    var msg = formEl.querySelector('.nl-msg');
    var btn = formEl.querySelector('.nl-submit');
    var btnLabel = formEl.querySelector('.nl-submit-label');

    formEl.addEventListener('submit', function(ev){
      ev.preventDefault();
      if(btn.getAttribute('aria-busy') === 'true') return;
      msg.textContent = '';

      var fd = new FormData(formEl);
      var firstname = (fd.get('firstname') || '').toString().trim();
      var email     = (fd.get('email')     || '').toString().trim();

      if(!firstname){ msg.textContent = 'Add your first name and try again.'; return; }
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        msg.textContent = "That doesn't look like an email address. Check the spelling and try again.";
        return;
      }

      btn.setAttribute('aria-busy','true');
      btn.disabled = true;
      btnLabel.textContent = 'Sending…';

      fetch(ENDPOINT, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          email: email,
          firstname: firstname,
          _hp: (fd.get('_hp') || '').toString(),
          _t: Number(fd.get('_t')) || 0
        })
      }).then(function(r){ return r.json().catch(function(){ return {ok:false}; }); })
        .then(function(data){
          if(data && data.ok){
            formEl.hidden = true;
            if(successEl) successEl.hidden = false;
            return;
          }
          var err = data && data.error || 'unknown';
          if(err === 'invalid-email'){
            msg.textContent = "That doesn't look like an email address. Check the spelling and try again.";
          } else if(err === 'missing-name'){
            msg.textContent = 'Add your first name and try again.';
          } else {
            msg.textContent = "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly.";
          }
        })
        .catch(function(){
          msg.textContent = "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly.";
        })
        .then(function(){
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
          btnLabel.textContent = 'Subscribe';
        });
    });
  }

  var inline = document.getElementById('nl-form-inline');
  var cell   = document.getElementById('nl-inline');
  var success = cell ? cell.querySelector('.nl-success') : null;
  wire(inline, success);
})();
</script>
```

- [ ] **Step 6: Verify**

Start the local dev server (if not already):

```bash
npx vercel dev --listen 3000
```

Open `http://localhost:3000/insights.html` in a browser:

1. Scroll to the bottom of the journal grid. The last cell should now show the eyebrow `[ 07.B · NEWSLETTER ]`, the headline "The Journal, in your inbox.", and a two-field form with a "Subscribe" button.
2. Submit with empty fields → expect the inline error "Add your first name and try again."
3. Submit with name "Ada" and email "nope" → expect "That doesn't look like an email address. Check the spelling and try again."
4. Submit with name "Ada" and email "ada@example.com" → expect the form to be replaced in-place with the success card showing "You're in."
5. Open DevTools → Network. Confirm the POST to `/api/subscribe` returned `{ok:true}` (or `{ok:true,queued:true}` if `HUBSPOT_ACCESS_TOKEN` is unset locally).
6. Open DevTools → Console. Expect no errors.
7. Tab through the cell. Expect: firstname → email → submit. The honeypot must NOT receive focus.

- [ ] **Step 7: Commit**

```bash
git add insights.html
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
insights: replace static subscribe sentence with inline form

The [J.06] "Forthcoming" cell now hosts a working two-field subscribe
form (firstname + email) posting to /api/subscribe. Coord [ 07.B ·
NEWSLETTER ] keeps it inside the journal family.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Dedicated `subscribe.html` page

**Files:**
- Create: `subscribe.html`

- [ ] **Step 1: Define the verification**

After this task:
1. `http://localhost:3000/subscribe.html` loads with the standard HIMARK chrome (wordmark, menu trigger, side panel, footer, chat widget).
2. Hero coord reads `[ 07.C · SUBSCRIBE ]`.
3. Form behaves identically to the inline version on `insights.html` (validation, submit, success card swap).
4. Page passes the same a11y bar: visible labels, live-region status, 44px+ submit, tab order skips honeypot.

- [ ] **Step 2: Create the file**

Create `subscribe.html` with this exact content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Subscribe to The Journal | HIMARK</title>
<meta name="description" content="Subscribe to The Journal — HIMARK's irregular bulletin from the principal office. Three or four issues most quarters. No tracking pixels, no third-party broadcast."/>
<meta name="author" content="HIMARK"/>
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"/>
<meta name="theme-color" content="#1C2B3A"/>
<link rel="canonical" href="https://www.himark.co.za/subscribe.html"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="HIMARK"/>
<meta property="og:title" content="Subscribe to The Journal | HIMARK"/>
<meta property="og:description" content="Subscribe to The Journal — HIMARK's irregular bulletin from the principal office."/>
<meta property="og:url" content="https://www.himark.co.za/subscribe.html"/>
<meta property="og:image" content="https://www.himark.co.za/images/about-hero.jpg"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:locale" content="en_ZA"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="Subscribe to The Journal | HIMARK"/>
<meta name="twitter:description" content="Subscribe to The Journal — HIMARK's irregular bulletin from the principal office."/>
<meta name="twitter:image" content="https://www.himark.co.za/images/about-hero.jpg"/>
<script type="application/ld+json">{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "url": "https://www.himark.co.za/subscribe.html",
  "name": "Subscribe to The Journal | HIMARK",
  "description": "Subscribe to The Journal — HIMARK's irregular bulletin from the principal office.",
  "isPartOf": { "@id": "https://www.himark.co.za/#website" },
  "inLanguage": "en-ZA",
  "breadcrumb": {
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home",    "item": "https://www.himark.co.za/" },
      { "@type": "ListItem", "position": 2, "name": "Journal", "item": "https://www.himark.co.za/insights.html" },
      { "@type": "ListItem", "position": 3, "name": "Subscribe","item": "https://www.himark.co.za/subscribe.html" }
    ]
  }
}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Roboto:ital,wght@0,300;0,400;1,300&family=Source+Sans+3:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300&display=swap" rel="stylesheet"/>
<link rel="icon" type="image/svg+xml" href="images/himark-favicon.svg"/><link rel="apple-touch-icon" href="images/himark-favicon.svg"/><link rel="manifest" href="manifest.json"/><link rel="icon" type="image/x-icon" href="images/himark-favicon.ico"/><link rel="stylesheet" href="styles/styles.css"/>

<style>
  #page-subscribe .sub-band{
    max-width:760px;
    margin:0 auto;
    padding:96px 56px 96px;
  }
  #page-subscribe .sub-eyebrow{
    font-family:'JetBrains Mono',monospace;
    font-size:11px;
    letter-spacing:.22em;
    color:var(--ocean);
    text-transform:uppercase;
    margin:0 0 18px;
  }
  #page-subscribe .sub-hl{
    font-family:'Source Sans 3',sans-serif;
    font-weight:300;
    font-size:clamp(42px,5.2vw,76px);
    line-height:1;
    letter-spacing:-.02em;
    color:var(--midnight);
    margin:0 0 26px;
  }
  #page-subscribe .sub-hl em{
    font-style:italic;
    font-weight:300;
    color:var(--ocean-dk);
  }
  #page-subscribe .sub-body{
    font-family:'Roboto',sans-serif;
    font-weight:300;
    font-size:17px;
    line-height:1.65;
    color:var(--ocean-dk);
    margin:0 0 40px;
    max-width:580px;
  }
  #page-subscribe .sub-form{
    display:flex;
    flex-direction:column;
    gap:18px;
    border-top:1px solid rgba(95,129,144,.2);
    padding-top:32px;
    max-width:520px;
  }
  #page-subscribe .sub-field{ display:flex; flex-direction:column; gap:6px; }
  #page-subscribe .sub-field-l{
    font-family:'JetBrains Mono',monospace;
    font-size:10px;
    letter-spacing:.2em;
    color:var(--ocean);
    text-transform:uppercase;
  }
  #page-subscribe .sub-input{
    font-family:'Roboto',sans-serif;
    font-weight:300;
    font-size:16px;
    color:var(--midnight);
    background:transparent;
    border:none;
    border-bottom:1px solid rgba(95,129,144,.3);
    padding:10px 0;
    transition:border-color .22s ease;
  }
  #page-subscribe .sub-input:focus{ outline:none; border-bottom-color:var(--midnight); }
  #page-subscribe .sub-hp{
    position:absolute; left:-9999px; width:1px; height:1px; opacity:0;
  }
  #page-subscribe .sub-submit{
    margin-top:8px;
    align-self:flex-start;
    font-family:'JetBrains Mono',monospace;
    font-size:11px;
    letter-spacing:.18em;
    text-transform:uppercase;
    color:var(--off);
    background:var(--midnight);
    border:1px solid var(--midnight);
    padding:14px 22px;
    cursor:pointer;
    display:inline-flex;
    align-items:center;
    gap:10px;
    min-height:44px;
    transition:background .22s ease;
  }
  #page-subscribe .sub-submit:hover{ background:var(--ocean-dk); border-color:var(--ocean-dk); }
  #page-subscribe .sub-submit:focus-visible{ outline:2px solid var(--ocean); outline-offset:2px; }
  #page-subscribe .sub-submit[aria-busy="true"]{ opacity:.7; cursor:wait; }
  #page-subscribe .sub-submit-arrow{ font-size:14px; line-height:1; }
  #page-subscribe .sub-msg{
    font-family:'Roboto',sans-serif;
    font-weight:300;
    font-size:14px;
    color:#9A4A4A;
    margin:0;
    min-height:1em;
  }
  #page-subscribe .sub-msg:empty{ display:none; }

  #page-subscribe .sub-success{
    border:1px solid rgba(95,129,144,.22);
    background:var(--off);
    padding:48px 36px;
    max-width:520px;
  }
  #page-subscribe .sub-success-coord{
    display:block;
    font-family:'JetBrains Mono',monospace;
    font-size:10px;
    letter-spacing:.22em;
    color:var(--ocean-dk);
    text-transform:uppercase;
    margin-bottom:14px;
  }
  #page-subscribe .sub-success-hl{
    font-family:'Source Sans 3',sans-serif;
    font-weight:300;
    font-size:38px;
    line-height:1;
    color:var(--midnight);
    margin:0 0 14px;
    letter-spacing:-.01em;
  }
  #page-subscribe .sub-success-hl em{ font-style:italic; color:var(--ocean-dk); }
  #page-subscribe .sub-success-body{
    font-family:'Roboto',sans-serif;
    font-weight:300;
    font-size:15px;
    line-height:1.6;
    color:var(--ocean-dk);
    margin:0;
  }

  @media (max-width:680px){
    #page-subscribe .sub-band{ padding:64px 28px 64px; }
    #page-subscribe .sub-success{ padding:36px 26px; }
  }
  @media (prefers-reduced-motion: reduce){
    #page-subscribe .sub-input, #page-subscribe .sub-submit{ transition:none; }
  }
</style>

  <script src="images.config.js"></script>
  <script defer data-domain="himark.co.za" src="https://plausible.io/js/script.js"></script>
</head>
<body data-page="subscribe" data-location="root">
<div id="cd"></div>
<div id="cr"></div>
<canvas id="cvs"></canvas>

<a href="#" id="brand-mark" data-page="home" aria-label="HIMARK">
<img src="images/HIMARK.png" alt="HIMARK" class="brand-wm-img"/>
</a>

<div id="menu-trigger" class="mt-trigger">
<span class="mt-num">[ 01—09 ]</span>
<div class="mt-line"></div>
<span class="mt-label">Index ↑</span>
</div>

<div class="menu-overlay" id="menuOverlay"></div>
<div class="prn-backdrop" id="prnBackdrop"></div>

<aside id="cookies-banner" role="region" aria-label="Cookie preferences">
<span class="cb-coord">[ 09.A · COOKIES ]</span>
<div class="cb-icon" aria-hidden="true"></div>
<div class="cb-text">
<span class="cb-eyebrow">Cookies & Tracking</span>
<p class="cb-msg">HIMARK uses cookies to operate this site, measure performance, and remember your preferences. See our <a href="#" data-page="cookies">Cookies Policy</a> and <a href="#" data-page="privacy">Privacy Notice</a> for the full schedule.</p>
</div>
<div class="cb-actions">
<button class="cb-btn cb-btn-ghost" id="cb-deny">Deny</button>
<button class="cb-btn cb-btn-secondary" id="cb-necessary">Necessary Only</button>
<button class="cb-btn cb-btn-primary" id="cb-accept">Accept All</button>
</div>
</aside>

<div id="menu-panel">
<div class="menu-bg-grid"></div>
<span class="menu-coord-tl">[ INDEX / 09 ]</span>
<span class="menu-coord-tr" id="menuClose">CLOSE [ × ]</span>
<ul class="menu-list">
<li><a href="#" class="menu-item" data-page="home"><span class="mi-num">[ 00 ]</span><span class="mi-name">Home <em>· Origin</em></span><span class="mi-arrow">→</span></a></li>
<li><a href="#" class="menu-item" data-page="doctrine"><span class="mi-num">[ 01 ]</span><span class="mi-name">About <em>· Doctrine</em></span><span class="mi-arrow">→</span></a></li>
<li><a href="#" class="menu-item" data-page="mandates"><span class="mi-num">[ 02 ]</span><span class="mi-name">Services <em>· Mandates</em></span><span class="mi-arrow">→</span></a></li>
<li><a href="#" class="menu-item" data-page="method"><span class="mi-num">[ 03 ]</span><span class="mi-name">Process <em>· Method</em></span><span class="mi-arrow">→</span></a></li>
<li><a href="#" class="menu-item" data-page="airass"><span class="mi-num">[ 04 ]</span><span class="mi-name">AIRaaS <em>· Product</em></span><span class="mi-arrow">→</span></a></li>
<li><a href="#" class="menu-item" data-page="principals"><span class="mi-num">[ 05 ]</span><span class="mi-name">Team <em>· Principals</em></span><span class="mi-arrow">→</span></a></li>
<li><a href="#" class="menu-item" data-page="intake"><span class="mi-num">[ 08 ]</span><span class="mi-name">Apply <em>· Intake</em></span><span class="mi-arrow">→</span></a></li>
<li><a href="#" class="menu-item menu-item-sub" data-page="sessions"><span class="mi-num">[ 08.A ]</span><span class="mi-name">Counsel <em>· Advisory session</em></span><span class="mi-arrow">→</span></a></li>
<li><a href="#" class="menu-item" data-page="direct"><span class="mi-num">[ 09 ]</span><span class="mi-name">Contact <em>· Direct</em></span><span class="mi-arrow">→</span></a></li>
</ul>
<div class="menu-footer">
<div class="mf-block">
<div class="mf-label">[ 01 ]  Direct</div>
<div class="mf-text"><a class="mf-link" href="mailto:info@himark.co.za">info@himark.co.za</a></div>
<div class="mf-text" style="margin-top:6px">Randburg · Gauteng · ZA</div>
</div>
<div class="mf-block">
<div class="mf-label">[ 02 ]  Group</div>
<div class="mf-text" style="margin-top:6px">Est. 2026</div>
</div>
</div>
</div>

<div class="page" id="page-subscribe">
<div style="padding-top:0">

<section class="sub-band" id="sub-main">
<p class="sub-eyebrow">[ 07.C · SUBSCRIBE ]</p>
<h1 class="sub-hl">The bulletin,<br/><em>direct.</em></h1>
<p class="sub-body">The Journal is irregular by design — it issues when there is something to say, not on a schedule. Three or four issues most quarters. No tracking pixels, no third-party broadcast. Read by everyone who's on the list, including the principals.</p>

<form class="sub-form" id="sub-form" novalidate>
  <input type="text" name="_hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" class="sub-hp"/>
  <input type="hidden" name="_t" value="0" data-nl-t/>

  <label class="sub-field">
    <span class="sub-field-l">First name</span>
    <input type="text" name="firstname" required autocomplete="given-name" maxlength="80" class="sub-input"/>
  </label>
  <label class="sub-field">
    <span class="sub-field-l">Email</span>
    <input type="email" name="email" required autocomplete="email" inputmode="email" class="sub-input"/>
  </label>

  <button type="submit" class="sub-submit">
    <span class="sub-submit-label">Subscribe</span>
    <span class="sub-submit-arrow">→</span>
  </button>

  <p class="sub-msg" role="status" aria-live="polite"></p>
</form>

<div class="sub-success" id="sub-success" hidden>
  <span class="sub-success-coord">[ ✓ ]  On the list</span>
  <h2 class="sub-success-hl">You're <em>in.</em></h2>
  <p class="sub-success-body">The next issue lands when there's something to say. Until then, the inbox stays quiet.</p>
</div>
</section>

<footer class="footer">
<span class="footer-coord-tl">[ END.DOCUMENT ]</span>
<span class="footer-coord-tr">HIMARK / FOOTER</span>
<div class="footer-top">
<div><div class="ft-wm"><svg width="14" height="10" viewBox="0 0 292 200" fill="none"><rect x="0" y="0" width="28" height="200" fill="#5F8190"/><rect x="28" y="88" width="104" height="20" fill="#5F8190"/><rect x="132" y="0" width="28" height="200" fill="#5F8190"/><polygon points="160,0 182,0 212,120 201,120" fill="#5F8190"/><polygon points="242,0 264,0 223,120 212,120" fill="#5F8190"/><rect x="264" y="0" width="28" height="200" fill="#5F8190"/></svg>HIMARK</div><p class="ft-tag">Strategic Growth Consultancy</p><p class="ft-blurb">HIMARK (Pty) Ltd</p></div>
<div><p class="ft-col-t">[ 01 ] Engagement</p><ul class="ft-links"><li><a href="#" data-page="mandates">Mandates</a></li><li><a href="#" data-page="airass">AIRaaS</a></li><li><a href="#" data-page="method">Method</a></li></ul></div>
<div><p class="ft-col-t">[ 02 ] Firm</p><ul class="ft-links"><li><a href="#" data-page="doctrine">Doctrine</a></li><li><a href="#" data-page="principals">Principals</a></li><li><a href="#" data-page="press">Press &amp; Media</a></li><li><a href="#" data-page="home">Origin</a></li></ul></div>
<div><p class="ft-col-t">[ 03 ] Contact</p><ul class="ft-links"><li><a href="#" data-page="intake">Apply for Engagement</a></li><li><a href="#" data-page="signin">Client Portal</a></li><li><a href="#">info@himark.co.za</a></li></ul></div>
</div>
<div class="footer-bottom"><p class="ft-copy">© 2026  ·  HIMARK (PTY) LTD</p><div class="ft-legal"><a href="#" data-page="privacy">Privacy</a><a href="#" data-page="terms">Terms</a><a href="#" data-page="cookies">Cookies</a><a href="#" data-page="security">Security</a></div></div>
</footer>
</div></div>

<button id="mute-btn" class="muted"><div class="aw"><span></span><span></span><span></span><span></span><span></span></div></button>

<button class="chat-toggle-btn" id="chatTgl">
<svg class="ico-ch" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#F7F7F5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
<svg class="ico-cl" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F7F7F5" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
</button>

<div class="chat-win" id="chatWin">
<div class="ch-hdr">
<div class="ch-av"><svg width="9" height="13" viewBox="0 0 140 200" fill="none"><rect x="14" y="14" width="38" height="170" fill="#5F8190"/><rect x="88" y="14" width="38" height="170" fill="#5F8190"/><rect x="52" y="85" width="16" height="30" fill="#5F8190"/><rect x="72" y="85" width="16" height="30" fill="#5F8190"/><rect x="4" y="4" width="132" height="192" fill="none" stroke="#5F8190" stroke-width="10"/></svg></div>
<div><div class="ch-nm">ATLAS · HIMARK</div><div class="ch-st"><span class="ch-st-dot"></span>ONLINE · INSTANT REPLIES</div></div>
</div>
<div class="ch-tabs">
<button class="ch-tab active" id="tChat" onclick="swT('chat')"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>CHAT</button>
<button class="ch-tab" id="tVoice" onclick="swT('voice')"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>VOICE</button>
</div>
<div id="cpanel">
<div class="ch-msgs" id="chMsgs"></div>
<div class="qreps" id="qr">
<button class="qr" onclick="sQ(this)">Mandates</button>
<button class="qr" onclick="sQ(this)">AIRaaS</button>
<button class="qr" onclick="sQ(this)">Apply</button>
<button class="qr" onclick="sQ(this)">Method</button>
</div>
<div class="ch-inbar">
<input class="ch-inp" id="chIn" type="text" placeholder="Ask us anything…" autocomplete="off"/>
<button class="ch-send" onclick="sM()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
</div>
</div>
<div class="vp" id="vpanel">
<div class="v-orb" id="vOrb"><div class="v-ring"></div><div class="v-ring"></div><div class="v-ring"></div>
<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#5F8190" stroke-width="1.4" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></div>
<div class="v-wave" id="vWave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
<div class="v-stat" id="vStat">TAP TO SPEAK</div>
<p class="v-hint">Ask about engagement or how to apply.</p>
<button class="v-btn" id="vMic" onclick="tV()">START SPEAKING</button>
</div>
</div>

<!-- subscribe form handler — identical contract to the inline form
     on insights.html, just bound to different element ids. -->
<script>
(function(){
  'use strict';
  var ENDPOINT = '/api/subscribe';

  var form    = document.getElementById('sub-form');
  var success = document.getElementById('sub-success');
  if(!form) return;

  var tEl = form.querySelector('[data-nl-t]');
  if(tEl) tEl.value = String(Date.now());

  var msg      = form.querySelector('.sub-msg');
  var btn      = form.querySelector('.sub-submit');
  var btnLabel = form.querySelector('.sub-submit-label');

  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    if(btn.getAttribute('aria-busy') === 'true') return;
    msg.textContent = '';

    var fd = new FormData(form);
    var firstname = (fd.get('firstname') || '').toString().trim();
    var email     = (fd.get('email')     || '').toString().trim();

    if(!firstname){ msg.textContent = 'Add your first name and try again.'; return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      msg.textContent = "That doesn't look like an email address. Check the spelling and try again.";
      return;
    }

    btn.setAttribute('aria-busy','true');
    btn.disabled = true;
    btnLabel.textContent = 'Sending…';

    fetch(ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        email: email,
        firstname: firstname,
        _hp: (fd.get('_hp') || '').toString(),
        _t: Number(fd.get('_t')) || 0
      })
    }).then(function(r){ return r.json().catch(function(){ return {ok:false}; }); })
      .then(function(data){
        if(data && data.ok){
          form.hidden = true;
          success.hidden = false;
          success.scrollIntoView({behavior:'smooth', block:'start'});
          return;
        }
        var err = data && data.error || 'unknown';
        if(err === 'invalid-email'){
          msg.textContent = "That doesn't look like an email address. Check the spelling and try again.";
        } else if(err === 'missing-name'){
          msg.textContent = 'Add your first name and try again.';
        } else {
          msg.textContent = "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly.";
        }
      })
      .catch(function(){
        msg.textContent = "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly.";
      })
      .then(function(){
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btnLabel.textContent = 'Subscribe';
      });
  });
})();
</script>

<script src="main/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify**

Load `http://localhost:3000/subscribe.html`:

1. Page renders with brand mark, menu trigger, side panel, footer, cookies banner, chat widget.
2. Hero eyebrow reads `[ 07.C · SUBSCRIBE ]`. Headline reads "The bulletin, direct."
3. Submit empty → "Add your first name and try again."
4. Submit name "Ada", email "ada@example.com" → form is hidden, success card "You're in." is revealed, and the page smoothly scrolls to it.
5. Network tab: POST /api/subscribe returned `{ok:true}` (or `{ok:true,queued:true}`).
6. Tab order: firstname → email → submit. Honeypot skipped.
7. Console: no errors.

- [ ] **Step 4: Commit**

```bash
git add subscribe.html
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
add subscribe.html — dedicated journal subscribe surface

Standalone single-purpose page at /subscribe.html. Hero [ 07.C ·
SUBSCRIBE ], headline "The bulletin, direct." Posts to the same
/api/subscribe endpoint the insights inline form uses.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Press kit cross-link

**Files:**
- Modify: `press.html` (the press contact card — around line 1414)

- [ ] **Step 1: Define the verification**

After this task, the press contact card on `/press.html` shows a fifth row `[ 05 ]  Journal` pointing to `/subscribe.html`.

- [ ] **Step 2: Find the existing markup**

In `press.html`, locate the last row of the press contact card:

```html
<div class="prk-contact-row">
<span class="prk-contact-l-label">[ 04 ]  Hours</span>
<span class="prk-contact-l-value">Mon — Fri · 09:00–17:00 SAST</span>
<span class="prk-contact-l-sub">SAST · GMT+2. Out-of-hours email is monitored.</span>
</div>

</div>
</div>
</section>
```

- [ ] **Step 3: Insert the Journal row after Hours**

Replace the block above with:

```html
<div class="prk-contact-row">
<span class="prk-contact-l-label">[ 04 ]  Hours</span>
<span class="prk-contact-l-value">Mon — Fri · 09:00–17:00 SAST</span>
<span class="prk-contact-l-sub">SAST · GMT+2. Out-of-hours email is monitored.</span>
</div>

<div class="prk-contact-row">
<span class="prk-contact-l-label">[ 05 ]  Journal</span>
<span class="prk-contact-l-value"><a href="#" data-page="subscribe">Subscribe to The Journal</a></span>
<span class="prk-contact-l-sub">Irregular bulletin from the principal office.</span>
</div>

</div>
</div>
</section>
```

- [ ] **Step 4: Verify**

Open `http://localhost:3000/press.html`. Scroll to the bottom press contact section. Confirm:

1. The right-hand column now lists five rows in order: Email, General, Postal, Hours, Journal.
2. Clicking "Subscribe to The Journal" navigates to `/subscribe.html`.

- [ ] **Step 5: Commit**

```bash
git add press.html
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "press: link to subscribe.html from press contact card"
```

---

## Task 6 — Sitemap entry

**Files:**
- Modify: `sitemap.xml`

- [ ] **Step 1: Define the verification**

After this task, `sitemap.xml` contains a `<url>` entry for `https://www.himark.co.za/subscribe.html` at priority 0.6.

- [ ] **Step 2: Add the entry**

In `sitemap.xml`, find this block:

```xml
  <url>
    <loc>https://www.himark.co.za/press.html</loc>
    <lastmod>2026-05-25</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>

  <!-- Hidden from the main menu but still indexable
       (lower priority and longer change-freq). -->
```

Replace it with:

```xml
  <url>
    <loc>https://www.himark.co.za/press.html</loc>
    <lastmod>2026-05-25</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.himark.co.za/subscribe.html</loc>
    <lastmod>2026-05-25</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>

  <!-- Hidden from the main menu but still indexable
       (lower priority and longer change-freq). -->
```

- [ ] **Step 3: Verify**

Run:

```bash
grep -n "subscribe.html" sitemap.xml
```

Expected:

```
<loc>https://www.himark.co.za/subscribe.html</loc>
```

- [ ] **Step 4: Commit**

```bash
git add sitemap.xml
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "sitemap: add subscribe.html"
```

---

## Task 7 — End-to-end verification + push

- [ ] **Step 1: Final smoke test**

With `npx vercel dev` still running:

```bash
# 1. API still reachable
curl -s http://localhost:3000/api/subscribe | grep -o '"ok":true'
# Expected: "ok":true

# 2. Subscribe page reachable
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/subscribe.html
# Expected: 200

# 3. Insights page still parses
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/insights.html
# Expected: 200
```

Manually in the browser:

1. From `/insights.html`, submit the inline form with valid data → success card swaps in.
2. From `/subscribe.html`, submit with valid data → success card replaces the form.
3. From `/press.html`, click "Subscribe to The Journal" → navigate to `/subscribe.html`.
4. Check HubSpot CRM (if you have console access) — the test contact should appear as a new or updated contact with `himark_source = journal-subscribe`. If `HUBSPOT_ACCESS_TOKEN` is not set locally, instead check the `vercel dev` terminal output for the `[subscribe] HUBSPOT_ACCESS_TOKEN not set — captured but not forwarded: ada@example.com` log line.

- [ ] **Step 2: Review git log**

Run:

```bash
git log --oneline -8
```

Expected (most recent first):

```
sitemap: add subscribe.html
press: link to subscribe.html from press contact card
add subscribe.html — dedicated journal subscribe surface
insights: replace static subscribe sentence with inline form
router: register subscribe page in PAGE_URLS
api: add /api/subscribe — HubSpot newsletter signup
spec: newsletter wiring — design doc
images: optimization script + workflow guide
```

- [ ] **Step 3: Push (only when ready to deploy)**

```bash
git push origin main
```

Vercel will auto-deploy. After deploy:

```bash
# Production API check
curl -s https://www.himark.co.za/api/subscribe | grep -o '"hubspotConfigured":[^,]*'
# Expected: "hubspotConfigured":true
```

If `hubspotConfigured` is `false` in production, set `HUBSPOT_ACCESS_TOKEN` in the Vercel project's Environment Variables (Settings → Environment Variables) and redeploy.

---

## Rollback

If anything goes wrong post-deploy:

```bash
# Revert the entire newsletter feature in one go
git revert --no-edit 1079351..HEAD
git push origin main
```

(Adjust the commit range to point at the spec commit + everything after.)

Or, more surgically, revert just the API:

```bash
git revert <api/subscribe.js commit hash>
```

The frontend forms will continue to render but will show the "Couldn't reach the desk" error on submit — no broken visual state.
