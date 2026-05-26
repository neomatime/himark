# Forms wiring — Counsel + Apply — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Counsel session booking form (`sessions.html`) and the engagement intake form (`apply.html`) to HubSpot via two new Vercel serverless functions (`/api/session-booking`, `/api/apply`). Mirror the pattern set by `api/subscribe.js`.

**Architecture:** Two new endpoints, two frontend rewrites. Both endpoints validate, run honeypot + min-time bot defence, and POST/PATCH into HubSpot CRM v3 with the existing five custom properties (`himark_source`, `himark_tier`, `himark_brief`, `himark_timeline`, `himark_budget`). Frontends use the same `_hp` + `_t` pattern, same error slug → copy mapping, fail-closed success states.

**Tech stack:** Vanilla HTML/CSS/JS, Vercel CommonJS serverless functions, HubSpot CRM v3 REST API.

**Verification:** No automated test framework in this repo. Verification per task is file-level (file presence, syntax balance, grep counts) plus a runtime smoke test on the final task. The user does the actual end-to-end HubSpot check on production after push.

---

## File map

| Path | Action | Responsibility |
|---|---|---|
| `api/session-booking.js` | **Create** | Validate session booking body, push HubSpot contact tagged `session-form`. |
| `api/apply.js` | **Create** | Validate apply intake, generate reference, push HubSpot contact tagged `apply-form`. |
| `sessions.html` | Modify | Add honeypot + `_t` + msg slot to form; add scoped CSS; rewrite `submitBooking` for fail-closed POST. |
| `apply.html` | Modify | Add `name=` attrs to every field; explicit `value=` slugs on tier select; honeypot + `_t` + msg slot; new success card; new IIFE submit handler (defining `submitIntake`). |

No changes to `styles/styles.css`, `main/main.js`, `sitemap.xml`, or any other page. No new HubSpot properties.

---

## Task 1 — Backend: `/api/session-booking.js`

**Files:**
- Create: `api/session-booking.js`

- [ ] **Step 1: Define the verification**

Three behaviours must hold:
1. GET → 200 JSON `{ok:true, function:'api/session-booking', method:'GET', hubspotConfigured:<bool>, runtime:<string>}`
2. POST with valid body but missing `window` → 400 `{ok:false, error:'missing-window'}`
3. POST with honeypot non-empty → 400 `{ok:false, error:'honeypot'}`

Verify by reading the code; runtime curl is deferred to Task 5.

- [ ] **Step 2: Implement `api/session-booking.js`**

Create the file with this exact content:

```javascript
/* HIMARK · Counsel session booking endpoint
   Vercel serverless function (CommonJS).

   Receives POST { name, email, company, role, format, brief, window,
   _hp, _t } from the booking form on sessions.html. Validates,
   runs honeypot + min-time-on-form bot defence, then creates or
   updates a HubSpot CRM contact tagged with himark_source:
   'session-form' and himark_tier: 'session'.

   Env vars:
     - HUBSPOT_ACCESS_TOKEN  (optional)  — HubSpot Private App token
                              with crm.objects.contacts.write scope.
                              Without it, returns 200 (queued:true)
                              and logs the capture for manual recovery.

   Mirrors api/subscribe.js. Keep structurally in sync.
*/

'use strict';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FORM_MS = 2000;

function json(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function pushToHubSpot(properties){
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.log('[session-booking] HUBSPOT_ACCESS_TOKEN not set — captured but not forwarded:', properties.email);
    return { skipped: 'no-token' };
  }

  let res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties })
  });

  if (res.ok) {
    console.log('[session-booking] hubspot: contact created for', properties.email);
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
        console.log('[session-booking] hubspot: contact updated for', properties.email);
        return { updated: true };
      }
      const t = await patch.text().catch(() => '');
      console.error('[session-booking] hubspot patch failed', patch.status, t.slice(0, 300));
      return { error: 'patch-failed', status: patch.status };
    }
    console.error('[session-booking] hubspot 409 but no existing id parsed');
    return { error: 'conflict-no-id' };
  }

  const t = await res.text().catch(() => '');
  console.error('[session-booking] hubspot create failed', res.status, t.slice(0, 300));
  return { error: 'create-failed', status: res.status };
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      function: 'api/session-booking',
      method: 'GET',
      hubspotConfigured: !!process.env.HUBSPOT_ACCESS_TOKEN,
      runtime: process.version || 'unknown'
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method-not-allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') {
    return json(res, 400, { ok: false, error: 'invalid-body' });
  }

  const name    = String(body.name    || '').trim();
  const email   = String(body.email   || '').trim().toLowerCase();
  const company = String(body.company || '').trim();
  const role    = String(body.role    || '').trim();
  const format  = String(body.format  || '').trim().toLowerCase();
  const brief   = String(body.brief   || '').trim();
  const windowStr = String(body.window || '').trim();
  const hp      = String(body._hp     || '').trim();
  const t       = Number(body._t) || 0;

  if (hp !== '') {
    console.warn('[session-booking] honeypot triggered for', email);
    return json(res, 400, { ok: false, error: 'honeypot' });
  }
  if (t > 0 && (Date.now() - t) < MIN_FORM_MS) {
    console.warn('[session-booking] too-fast submission for', email);
    return json(res, 400, { ok: false, error: 'too-fast' });
  }

  if (!name || name.length > 200) return json(res, 400, { ok: false, error: 'missing-name' });
  if (!EMAIL_RX.test(email))      return json(res, 400, { ok: false, error: 'invalid-email' });
  if (!windowStr)                 return json(res, 400, { ok: false, error: 'missing-window' });
  if (format !== 'video' && format !== 'in-person') {
    return json(res, 400, { ok: false, error: 'missing-format' });
  }
  if (!brief || brief.length > 4000) return json(res, 400, { ok: false, error: 'missing-brief' });

  /* Split name on first whitespace */
  const parts = name.split(/\s+/);
  const firstname = parts[0] || '';
  const lastname  = parts.slice(1).join(' ');

  /* Fold format into timeline string */
  const fmtLabel = format === 'in-person' ? 'In person' : 'Video call';
  const timelineStr = `${windowStr} · ${fmtLabel}`;

  const properties = {
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
  };

  const result = await pushToHubSpot(properties);

  if (result.skipped === 'no-token') return json(res, 200, { ok: true, queued: true });
  if (result.created || result.updated) return json(res, 200, { ok: true });
  return json(res, 502, { ok: false, error: 'upstream-failed' });
};
```

- [ ] **Step 3: Verify**

```bash
node -c api/session-booking.js
# Expected: no output

ls -la api/session-booking.js
# Expected: file present, ~5KB
```

Read the file and confirm by inspection:
- GET branch returns the correct diagnostic
- All seven validation slugs are present (`honeypot`, `too-fast`, `missing-name`, `invalid-email`, `missing-window`, `missing-format`, `missing-brief`)
- The 409→PATCH branch exists and mirrors `api/subscribe.js`

- [ ] **Step 4: Commit**

```bash
git add api/session-booking.js
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
api: add /api/session-booking — HubSpot Counsel session capture

Mirrors api/subscribe.js HubSpot pattern. POST { name, email, company,
role, format, brief, window, _hp, _t } creates or updates a contact
tagged himark_source: 'session-form', himark_tier: 'session', with
the date+time+format folded into himark_timeline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Frontend: wire sessions.html

**Files:**
- Modify: `sessions.html` (form markup, scoped CSS, `submitBooking` function)

- [ ] **Step 1: Verification expectations**

After this task:
1. Form contains hidden `_hp` and `_t` inputs.
2. Form contains a `<p class="bkc-msg" role="status" aria-live="polite">` after the submit button.
3. Scoped CSS for `.bkc-hp`, `.bkc-msg`, busy submit state is appended to the page `<style>` block.
4. `submitBooking` POSTs to `/api/session-booking` and gates the `#sx-success` overlay on a 2xx response.
5. Tag balance preserved.

- [ ] **Step 2: Add the hidden inputs to the form**

Open `sessions.html`. Find the existing form opening (around line 1028):

```html
<form class="bkc-form" id="bkc-form" onsubmit="return submitBooking(event)">
```

Just after that line, insert these two inputs:

```html
<input type="text" name="_hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" class="bkc-hp"/>
<input type="hidden" name="_t" value="0" data-bkc-t/>
```

- [ ] **Step 3: Add the msg slot below the submit button**

In the same file, find the submit button block. It's a `<button type="submit"` somewhere inside `<form id="bkc-form">`. Immediately after that button's closing tag (`</button>`), add:

```html
<p class="bkc-msg" role="status" aria-live="polite"></p>
```

If there's a wrapping container like `<div class="bkc-form-foot">`, place the `<p>` inside it, right after the button. If the button is bare, place the `<p>` as a direct sibling.

- [ ] **Step 4: Append scoped CSS**

Find the page's existing `<style>` block (the one that contains `.bkc-form` rules). Just before its closing `</style>`, append:

```css
/* ===== Counsel form network states ===== */
.bkc-hp{ position:absolute; left:-9999px; width:1px; height:1px; opacity:0; }
.bkc-msg{
  font-family:'Roboto',sans-serif;
  font-weight:300;
  font-size:13px;
  color:#E0A0A0;
  margin:12px 0 0;
  min-height:1em;
}
.bkc-msg:empty{ display:none; }
.bkc-submit[aria-busy="true"]{ opacity:.7; cursor:wait; }
@media (prefers-reduced-motion: reduce){
  .bkc-submit{ transition:none; }
}
```

- [ ] **Step 5: Rewrite `submitBooking`**

Find the existing function (around line 1535). It starts with `// Form submission — placeholder; wires to /api/session-booking once approved` followed by `window.submitBooking = function(e){ ... }`.

Replace the entire `window.submitBooking = function(e){ ... };` declaration (including the TODO comment block above it) with:

```javascript
  // Stamp the _t timestamp on render (used server-side to filter
  // sub-2-second auto-submits).
  (function(){
    var tEl = document.querySelector('#bkc-form [data-bkc-t]');
    if(tEl) tEl.value = String(Date.now());
  })();

  // Form submission — POSTs to /api/session-booking. Fail-closed:
  // the visual success overlay only appears after a 2xx response.
  window.submitBooking = function(e){
    e.preventDefault();
    if(!selectedDate || !selectedTime){
      alert('Please select a date and time first.');
      return false;
    }

    var f = e.target;
    var fd = new FormData(f);
    var dateObj = new Date(selectedDate.y, selectedDate.m, selectedDate.d);
    var whenStr = WEEKDAYS[dateObj.getDay()] + ', ' +
      selectedDate.d + ' ' + MONTHS[selectedDate.m] + ' ' + selectedDate.y +
      ' · ' + selectedTime + ' SAST';
    var format    = fd.get('format') || 'video';
    var formatStr = format === 'in-person' ? 'In Person · By appointment' : 'Video · SAST';

    var msg    = f.querySelector('.bkc-msg');
    var btn    = f.querySelector('.bkc-submit');
    var btnTxt = btn ? btn.textContent : '';
    if(msg) msg.textContent = '';
    if(btn){
      btn.disabled = true;
      btn.setAttribute('aria-busy','true');
      btn.textContent = 'Sending…';
    }

    fetch('/api/session-booking', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        name:    (fd.get('name')    || '').toString().trim(),
        email:   (fd.get('email')   || '').toString().trim(),
        company: (fd.get('company') || '').toString().trim(),
        role:    (fd.get('role')    || '').toString().trim(),
        format:  format,
        brief:   (fd.get('brief')   || '').toString().trim(),
        window:  whenStr,
        _hp:     (fd.get('_hp')     || '').toString(),
        _t:      Number(fd.get('_t')) || 0
      })
    }).then(function(r){ return r.json().catch(function(){ return {ok:false}; }); })
      .then(function(data){
        if(data && data.ok){
          document.getElementById('sx-success-when').textContent   = whenStr;
          document.getElementById('sx-success-format').textContent = formatStr;
          document.getElementById('sx-success-email').textContent  = fd.get('email') || '—';
          document.getElementById('sx-success').classList.add('show');
          return;
        }
        var err = data && data.error || 'unknown';
        if(msg){
          if(err === 'invalid-email')         msg.textContent = "That doesn't look like an email address. Check the spelling and try again.";
          else if(err === 'missing-name')     msg.textContent = 'Add your name and try again.';
          else if(err === 'missing-brief')    msg.textContent = 'Add the brief so the principal can prepare.';
          else if(err === 'missing-window' ||
                  err === 'missing-format')   msg.textContent = 'Pick a date, time and format first.';
          else                                msg.textContent = "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly.";
        }
      })
      .catch(function(){
        if(msg) msg.textContent = "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly.";
      })
      .then(function(){
        if(btn){
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
          btn.textContent = btnTxt || 'Confirm Booking';
        }
      });

    return false;
  };
```

If the existing button text is something other than "Confirm Booking", that's fine — the code saves it (`btnTxt`) and restores it after the POST. The `'Confirm Booking'` is only a fallback if `btnTxt` is empty for some reason.

- [ ] **Step 6: Verify**

```bash
# Honeypot input present
grep -c 'name="_hp"' sessions.html
# Expected: 1

# _t input present
grep -c 'data-bkc-t' sessions.html
# Expected: 2 (one in markup, one in JS query selector)

# Msg slot present
grep -c 'class="bkc-msg"' sessions.html
# Expected: at least 2 (one in markup, multiple in CSS)

# New endpoint reference
grep -c '/api/session-booking' sessions.html
# Expected: 1

# Old TODO comment removed
grep -c 'TODO (post-approval): POST to /api/session-booking' sessions.html
# Expected: 0

# Tag balance
node -e "const s=require('fs').readFileSync('sessions.html','utf8');console.log('div',(s.match(/<div\b/gi)||[]).length,'/',(s.match(/<\/div>/gi)||[]).length,'form',(s.match(/<form\b/gi)||[]).length,'/',(s.match(/<\/form>/gi)||[]).length,'script',(s.match(/<script\b/gi)||[]).length,'/',(s.match(/<\/script>/gi)||[]).length,'style',(s.match(/<style\b/gi)||[]).length,'/',(s.match(/<\/style>/gi)||[]).length);"
# Expected: every pair balanced
```

- [ ] **Step 7: Commit**

```bash
git add sessions.html
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
sessions: wire Counsel form to /api/session-booking

Booking form now POSTs and only shows the existing visual success
overlay on 2xx. Adds honeypot, _t timestamp, error message slot,
and scoped CSS for busy-state submit + error legibility on midnight.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Backend: `/api/apply.js`

**Files:**
- Create: `api/apply.js`

- [ ] **Step 1: Define the verification**

Three behaviours must hold:
1. GET → 200 JSON with `function:'api/apply'`.
2. POST with valid body returns a reference matching `/^APP-\d{8}-\d{6}$/` in the response.
3. POST with brief shorter than 200 chars → 400 `{ok:false, error:'brief-too-short'}`.

- [ ] **Step 2: Implement `api/apply.js`**

Create the file with this exact content:

```javascript
/* HIMARK · Engagement intake endpoint
   Vercel serverless function (CommonJS).

   Receives POST { name, position_company, email, phone, tier,
   brief, why, _hp, _t } from the form on apply.html. Validates,
   runs honeypot + min-time-on-form bot defence, then creates or
   updates a HubSpot CRM contact tagged with himark_source:
   'apply-form'. Returns a reference string of the form
   APP-YYYYMMDD-HHMMSS so the visitor can quote it if they email
   the team. The reference is not stored in HubSpot — the contact's
   createdate plus email is sufficient lookup.

   Env vars:
     - HUBSPOT_ACCESS_TOKEN  (optional)

   Mirrors api/subscribe.js and api/session-booking.js.
*/

'use strict';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FORM_MS = 2000;
const TIER_SLUGS = new Set(['tier-01', 'tier-02', 'tier-03', 'airass', 'discovery']);

function json(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function makeReference(){
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `APP-${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

async function pushToHubSpot(properties){
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.log('[apply] HUBSPOT_ACCESS_TOKEN not set — captured but not forwarded:', properties.email);
    return { skipped: 'no-token' };
  }

  let res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties })
  });

  if (res.ok) {
    console.log('[apply] hubspot: contact created for', properties.email);
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
        console.log('[apply] hubspot: contact updated for', properties.email);
        return { updated: true };
      }
      const t = await patch.text().catch(() => '');
      console.error('[apply] hubspot patch failed', patch.status, t.slice(0, 300));
      return { error: 'patch-failed', status: patch.status };
    }
    console.error('[apply] hubspot 409 but no existing id parsed');
    return { error: 'conflict-no-id' };
  }

  const t = await res.text().catch(() => '');
  console.error('[apply] hubspot create failed', res.status, t.slice(0, 300));
  return { error: 'create-failed', status: res.status };
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      function: 'api/apply',
      method: 'GET',
      hubspotConfigured: !!process.env.HUBSPOT_ACCESS_TOKEN,
      runtime: process.version || 'unknown'
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method-not-allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') {
    return json(res, 400, { ok: false, error: 'invalid-body' });
  }

  const name             = String(body.name             || '').trim();
  const positionCompany  = String(body.position_company || '').trim();
  const email            = String(body.email            || '').trim().toLowerCase();
  const phone            = String(body.phone            || '').trim();
  const tierRaw          = String(body.tier             || '').trim();
  const brief            = String(body.brief            || '').trim();
  const why              = String(body.why              || '').trim();
  const hp               = String(body._hp              || '').trim();
  const t                = Number(body._t) || 0;

  if (hp !== '') {
    console.warn('[apply] honeypot triggered for', email);
    return json(res, 400, { ok: false, error: 'honeypot' });
  }
  if (t > 0 && (Date.now() - t) < MIN_FORM_MS) {
    console.warn('[apply] too-fast submission for', email);
    return json(res, 400, { ok: false, error: 'too-fast' });
  }

  if (!name || name.length > 200)             return json(res, 400, { ok: false, error: 'missing-name' });
  if (!positionCompany || positionCompany.length > 200) return json(res, 400, { ok: false, error: 'missing-position-company' });
  if (!EMAIL_RX.test(email))                  return json(res, 400, { ok: false, error: 'invalid-email' });
  if (!brief || brief.length < 200)           return json(res, 400, { ok: false, error: 'brief-too-short' });

  const tier = TIER_SLUGS.has(tierRaw) ? tierRaw : '';

  /* Split name on first whitespace */
  const nameParts = name.split(/\s+/);
  const firstname = nameParts[0] || '';
  const lastname  = nameParts.slice(1).join(' ');

  /* Split position_company on " · " (space-middledot-space) */
  let jobtitle = positionCompany;
  let company  = '';
  const sepIdx = positionCompany.indexOf(' · ');
  if (sepIdx !== -1) {
    jobtitle = positionCompany.slice(0, sepIdx).trim();
    company  = positionCompany.slice(sepIdx + 3).trim();
  }

  /* Fold brief + why into himark_brief */
  const briefStr = why
    ? `${brief}\n\n--- Why HIMARK ---\n${why}`
    : brief;

  const reference = makeReference();

  const properties = {
    email, firstname, lastname,
    company, jobtitle,
    phone: phone || '',
    hs_lead_status: 'NEW',
    lifecyclestage: 'lead',
    himark_source: 'apply-form',
    himark_tier: tier,
    himark_brief: briefStr,
    himark_timeline: '',
    himark_budget: ''
  };

  const result = await pushToHubSpot(properties);

  if (result.skipped === 'no-token') return json(res, 200, { ok: true, queued: true, reference });
  if (result.created || result.updated) return json(res, 200, { ok: true, reference });
  return json(res, 502, { ok: false, error: 'upstream-failed' });
};
```

- [ ] **Step 3: Verify**

```bash
node -c api/apply.js
# Expected: no output

ls -la api/apply.js
# Expected: file present, ~6KB
```

Read the file and confirm by inspection:
- The GET branch returns `function:'api/apply'`
- The `makeReference()` function produces `APP-YYYYMMDD-HHMMSS` based on UTC time
- The brief min-length check is 200 (`brief.length < 200`)
- The tier validation only accepts the 5 known slugs (else stores empty string)
- The position_company split uses `' · '` (space + U+00B7 + space) with `slice(sepIdx + 3)` for the right side

- [ ] **Step 4: Commit**

```bash
git add api/apply.js
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
api: add /api/apply — HubSpot engagement intake capture

Mirrors api/subscribe.js HubSpot pattern. POST { name,
position_company, email, phone, tier, brief, why, _hp, _t } creates
or updates a contact tagged himark_source: 'apply-form'.

Splits 'Full name' on first whitespace; splits 'Role · Organisation'
on " · " (space-middledot-space) into jobtitle + company. Folds the
optional 'Why HIMARK' answer into himark_brief with a separator.

Returns reference APP-YYYYMMDD-HHMMSS in success responses (UTC,
not stored in HubSpot — createdate + email is enough for lookup).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Frontend: wire apply.html

**Files:**
- Modify: `apply.html` (form field markup, tier option slugs, honeypot/`_t`/msg slot, success card, scoped CSS, new IIFE submit handler defining `submitIntake`)

- [ ] **Step 1: Verification expectations**

After this task:
1. Every form input/textarea/select has a `name=` attribute.
2. The tier `<select>` options have explicit `value=` slugs (`tier-01`, `tier-02`, `tier-03`, `airass`, `discovery`).
3. Form contains hidden `_hp` and `_t` inputs.
4. Form contains a `<p class="itk-msg" role="status" aria-live="polite">` inside the form-foot.
5. A `<div class="itk-success" hidden>` block sits immediately after `</form>`.
6. Scoped CSS for `.itk-hp`, `.itk-msg`, `.itk-success*`, busy submit state is appended to the page `<style>`.
7. A new `<script>` block at the bottom of `<body>` defines the global `submitIntake(event)` function.

- [ ] **Step 2: Add `name=` attributes to every form field**

In `apply.html`, find the seven existing field markups (around lines 367–400) and update each input/textarea/select to include the matching `name`:

Replace:
```html
<input class="itk-input" type="text" placeholder="Full name" required/>
```
with:
```html
<input class="itk-input" type="text" name="name" placeholder="Full name" required/>
```

Replace:
```html
<input class="itk-input" type="text" placeholder="Role · Organisation" required/>
```
with:
```html
<input class="itk-input" type="text" name="position_company" placeholder="Role · Organisation" required/>
```

Replace:
```html
<input class="itk-input" type="email" placeholder="name@company.co.za" required/>
```
with:
```html
<input class="itk-input" type="email" name="email" placeholder="name@company.co.za" required/>
```

Replace:
```html
<input class="itk-input" type="tel" placeholder="+27 XX XXX XXXX"/>
```
with:
```html
<input class="itk-input" type="tel" name="phone" placeholder="+27 XX XXX XXXX"/>
```

Replace:
```html
<select class="itk-select">
```
with:
```html
<select class="itk-select" name="tier">
```

Replace the two textareas similarly. The brief is the one with the long `Describe the strategic objective…` placeholder:
```html
<textarea class="itk-textarea" placeholder="Describe the strategic objective, the constraint you are encountering, and the timeframe in which it must be resolved." required></textarea>
```
becomes:
```html
<textarea class="itk-textarea" name="brief" placeholder="Describe the strategic objective, the constraint you are encountering, and the timeframe in which it must be resolved." required></textarea>
```

And the optional "Why HIMARK":
```html
<textarea class="itk-textarea" placeholder="Optional. What about HIMARK's positioning suggests this is the right firm for the work?"></textarea>
```
becomes:
```html
<textarea class="itk-textarea" name="why" placeholder="Optional. What about HIMARK's positioning suggests this is the right firm for the work?"></textarea>
```

- [ ] **Step 3: Add explicit `value=` slugs to the tier dropdown**

Find the `<select class="itk-select" name="tier">` block (you just added the name). It contains five option lines. Replace the whole `<option>` set with:

```html
<option value="">Select a mandate</option>
<option value="tier-01">Tier 01 — Signature Partner</option>
<option value="tier-02">Tier 02 — Growth Partner</option>
<option value="tier-03">Tier 03 — Private Partner</option>
<option value="airass">AIRaaS — Receptionist Product</option>
<option value="discovery">Discovery / Not yet decided</option>
```

- [ ] **Step 4: Add honeypot + `_t` to the form**

Find the form opening (around line 359):
```html
<form class="itk-form r3d d1" onsubmit="return submitIntake(event)">
```

Immediately after that line, insert:

```html
<input type="text" name="_hp" value="" tabindex="-1" autocomplete="off" aria-hidden="true" class="itk-hp"/>
<input type="hidden" name="_t" value="0" data-itk-t/>
```

- [ ] **Step 5: Add the msg slot inside the form-foot**

Find the existing `<div class="itk-form-foot">` block. It currently looks like (around lines 401–404):

```html
<div class="itk-form-foot">
<p class="itk-disclaimer"><strong>Engagements are accepted by invitation.</strong> Submission of this form does not constitute admission. Review takes place within five working days.</p>
<button type="submit" class="itk-submit">Submit for Review</button>
</div>
```

Replace with:

```html
<div class="itk-form-foot">
<p class="itk-disclaimer"><strong>Engagements are accepted by invitation.</strong> Submission of this form does not constitute admission. Review takes place within five working days.</p>
<button type="submit" class="itk-submit">Submit for Review</button>
<p class="itk-msg" role="status" aria-live="polite"></p>
</div>
```

- [ ] **Step 6: Insert the success card after `</form>`**

Find the `</form>` line (around line 407). Immediately after it, insert this success-card markup:

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

- [ ] **Step 7: Append scoped CSS**

Find the page's existing `<style>` block (search for `#page-intake .itk-form`). Just before its closing `</style>`, append:

```css
/* ===== Apply form network states + success ===== */
#page-intake .itk-hp{ position:absolute; left:-9999px; width:1px; height:1px; opacity:0; }
#page-intake .itk-msg{
  font-family:'Roboto',sans-serif;
  font-weight:300;
  font-size:13px;
  color:#E0A0A0;
  margin:12px 0 0;
  min-height:1em;
}
#page-intake .itk-msg:empty{ display:none; }
#page-intake .itk-submit[aria-busy="true"]{ opacity:.7; cursor:wait; }

#page-intake .itk-success{
  background:var(--midnight);
  border:1px solid rgba(138,173,184,.22);
  padding:64px 56px;
  color:var(--off);
  box-shadow:0 30px 60px -30px rgba(28,43,58,.35);
}
#page-intake .itk-success-coord{
  display:block;
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  letter-spacing:.22em;
  color:var(--ocean-lt);
  text-transform:uppercase;
  margin-bottom:18px;
}
#page-intake .itk-success-hl{
  font-family:'Source Sans 3',sans-serif;
  font-weight:300;
  font-size:clamp(42px,4.4vw,64px);
  line-height:1;
  letter-spacing:-.02em;
  margin:0 0 22px;
  color:var(--off);
}
#page-intake .itk-success-body{
  font-family:'Roboto',sans-serif;
  font-weight:300;
  font-size:16px;
  line-height:1.6;
  color:rgba(226,240,240,.78);
  margin:0 0 30px;
  max-width:540px;
}
#page-intake .itk-success-ref{
  display:flex;
  flex-direction:column;
  gap:6px;
  padding-top:24px;
  border-top:1px solid rgba(138,173,184,.18);
  max-width:340px;
}
#page-intake .itk-success-ref-l{
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  letter-spacing:.2em;
  color:var(--ocean-lt);
  text-transform:uppercase;
}
#page-intake .itk-success-ref-v{
  font-family:'JetBrains Mono',monospace;
  font-size:16px;
  color:var(--off);
  letter-spacing:.08em;
}
@media (max-width:680px){
  #page-intake .itk-success{ padding:44px 28px; }
}
@media (prefers-reduced-motion: reduce){
  #page-intake .itk-submit, #page-intake .itk-input{ transition:none; }
}
```

- [ ] **Step 8: Add the new IIFE submit handler**

Scroll to the bottom of `apply.html`. Find `<script src="main/main.js"></script>` (just before `</body>`).

Immediately BEFORE that `<script src="main/main.js"></script>` line, insert this new script block:

```html
<script>
(function(){
  'use strict';
  var ENDPOINT = '/api/apply';

  var form    = document.querySelector('form.itk-form');
  var success = document.querySelector('.itk-success');
  if(!form) return;

  /* Stamp render time onto the _t input. */
  var tEl = form.querySelector('[data-itk-t]');
  if(tEl) tEl.value = String(Date.now());

  /* Define the global submitIntake so the form's inline
     onsubmit="return submitIntake(event)" resolves. */
  window.submitIntake = function(ev){
    ev.preventDefault();

    var msg = form.querySelector('.itk-msg');
    var btn = form.querySelector('.itk-submit');
    var btnTxt = btn ? btn.textContent : '';
    if(msg) msg.textContent = '';
    if(btn && btn.getAttribute('aria-busy') === 'true') return false;

    var fd = new FormData(form);
    var name             = (fd.get('name')             || '').toString().trim();
    var positionCompany  = (fd.get('position_company') || '').toString().trim();
    var email            = (fd.get('email')            || '').toString().trim();
    var brief            = (fd.get('brief')            || '').toString().trim();

    /* Client-side validation matching the server. */
    if(!name){
      if(msg) msg.textContent = 'Add your name and try again.';
      return false;
    }
    if(!positionCompany){
      if(msg) msg.textContent = 'Add your role and company.';
      return false;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      if(msg) msg.textContent = "That doesn't look like an email address. Check the spelling and try again.";
      return false;
    }
    if(brief.length < 200){
      if(msg) msg.textContent = 'The brief needs to be at least 200 characters.';
      return false;
    }

    if(btn){
      btn.disabled = true;
      btn.setAttribute('aria-busy','true');
      btn.textContent = 'Filing…';
    }

    fetch(ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        name:             name,
        position_company: positionCompany,
        email:            email,
        phone:            (fd.get('phone') || '').toString().trim(),
        tier:             (fd.get('tier')  || '').toString().trim(),
        brief:            brief,
        why:              (fd.get('why')   || '').toString().trim(),
        _hp:              (fd.get('_hp')   || '').toString(),
        _t:               Number(fd.get('_t')) || 0
      })
    }).then(function(r){ return r.json().catch(function(){ return {ok:false}; }); })
      .then(function(data){
        if(data && data.ok){
          if(success){
            var refEl = success.querySelector('[data-ref]');
            if(refEl) refEl.textContent = data.reference || '—';
            form.hidden = true;
            success.hidden = false;
            success.scrollIntoView({behavior:'smooth', block:'start'});
          }
          return;
        }
        var err = data && data.error || 'unknown';
        if(msg){
          if(err === 'invalid-email')              msg.textContent = "That doesn't look like an email address. Check the spelling and try again.";
          else if(err === 'missing-name')          msg.textContent = 'Add your name and try again.';
          else if(err === 'missing-position-company') msg.textContent = 'Add your role and company.';
          else if(err === 'brief-too-short')       msg.textContent = 'The brief needs to be at least 200 characters.';
          else                                     msg.textContent = "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly.";
        }
      })
      .catch(function(){
        if(msg) msg.textContent = "Couldn't reach the desk. Try again in a moment, or email info@himark.co.za directly.";
      })
      .then(function(){
        if(btn){
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
          btn.textContent = btnTxt || 'Submit for Review';
        }
      });

    return false;
  };
})();
</script>
```

- [ ] **Step 9: Verify**

```bash
# Name attributes present on all 7 fields
grep -c 'name="name"' apply.html
grep -c 'name="position_company"' apply.html
grep -c 'name="email"' apply.html
grep -c 'name="phone"' apply.html
grep -c 'name="tier"' apply.html
grep -c 'name="brief"' apply.html
grep -c 'name="why"' apply.html
# Expected: each prints 1

# Tier slugs present
grep -c 'value="tier-01"' apply.html
grep -c 'value="airass"' apply.html
grep -c 'value="discovery"' apply.html
# Expected: each prints 1

# Honeypot + _t inputs
grep -c 'name="_hp"' apply.html
# Expected: 1
grep -c 'data-itk-t' apply.html
# Expected: 2 (one in markup, one in JS)

# Msg slot + success markup
grep -c 'class="itk-msg"' apply.html
# Expected: at least 2 (markup + CSS)
grep -c 'itk-success-coord' apply.html
# Expected: at least 2 (markup + CSS)

# Endpoint reference + submitIntake definition
grep -c '/api/apply' apply.html
# Expected: 1
grep -c 'window.submitIntake = function' apply.html
# Expected: 1

# Tag balance
node -e "const s=require('fs').readFileSync('apply.html','utf8');console.log('div',(s.match(/<div\b/gi)||[]).length,'/',(s.match(/<\/div>/gi)||[]).length,'form',(s.match(/<form\b/gi)||[]).length,'/',(s.match(/<\/form>/gi)||[]).length,'script',(s.match(/<script\b/gi)||[]).length,'/',(s.match(/<\/script>/gi)||[]).length,'style',(s.match(/<style\b/gi)||[]).length,'/',(s.match(/<\/style>/gi)||[]).length);"
# Expected: every pair balanced
```

- [ ] **Step 10: Commit**

```bash
git add apply.html
git -c user.email="matimeneo95@gmail.com" -c user.name="Neo Matime" commit -m "$(cat <<'EOF'
apply: wire intake form to /api/apply

Form now defines window.submitIntake and POSTs to /api/apply. Adds
name= attrs to every field, explicit tier slugs (tier-01/02/03/airass/
discovery), honeypot + _t, error message slot, and a midnight success
card with the server-returned reference number.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — End-to-end verification + push

- [ ] **Step 1: File-level smoke test**

```bash
# All 6 task commits present
git log --oneline -7
# Expected (most recent first):
#   apply: wire intake form to /api/apply
#   api: add /api/apply — HubSpot engagement intake capture
#   sessions: wire Counsel form to /api/session-booking
#   api: add /api/session-booking — HubSpot Counsel session capture
#   spec: forms wiring — Counsel session + Apply intake
#   docs: fix misleading HubSpot property comment
#   (earlier: subscribe Journal footer link)

# Each new endpoint file is parseable
node -c api/session-booking.js
node -c api/apply.js
# Expected: no output from either

# Each frontend file's tag balance still holds
node -e "['sessions.html','apply.html'].forEach(f=>{const s=require('fs').readFileSync(f,'utf8');console.log(f,'div',(s.match(/<div\b/gi)||[]).length+'/'+(s.match(/<\/div>/gi)||[]).length,'form',(s.match(/<form\b/gi)||[]).length+'/'+(s.match(/<\/form>/gi)||[]).length,'script',(s.match(/<script\b/gi)||[]).length+'/'+(s.match(/<\/script>/gi)||[]).length,'style',(s.match(/<style\b/gi)||[]).length+'/'+(s.match(/<\/style>/gi)||[]).length);});"
# Expected: balanced on both

# Working tree clean
git status
# Expected: nothing to commit, ahead of origin/main by N commits
```

- [ ] **Step 2: Push to origin**

```bash
git push origin main
```

Vercel will auto-deploy. Wait ~1 minute.

- [ ] **Step 3: Production smoke test**

```bash
# Diagnostic GETs — both should return hubspotConfigured:true
curl -s https://www.himark.co.za/api/session-booking
curl -s https://www.himark.co.za/api/apply
# Expected: { ok:true, ..., hubspotConfigured:true, ... } for each
```

Then in a browser:

1. Go to https://www.himark.co.za/sessions.html — pick a date and time, fill name/email/company/role/format/brief, submit. Confirm the visual success overlay only appears AFTER the network round-trip (button briefly says "Sending…"). Check HubSpot for the new contact tagged `himark_source = session-form`, `himark_tier = session`, with `himark_timeline` containing the full date+time+format string.

2. Go to https://www.himark.co.za/apply.html — fill name (e.g. "Test Applicant"), position_company (e.g. "CEO · Acme Corp"), email, phone (optional), tier (pick any), brief (≥200 chars — paste a paragraph), why (optional). Submit. Confirm the form swaps to the dark success card with a populated `APP-YYYYMMDD-HHMMSS` reference. Check HubSpot for the contact tagged `himark_source = apply-form`, with the brief in `himark_brief` and (if you filled it) the Why HIMARK text appended with the `--- Why HIMARK ---` separator.

3. **Idempotency test**: resubmit the same email from either form. Should succeed with 200 (HubSpot 409 → PATCH flow).

4. **Validation test**: on apply, submit with a brief shorter than 200 characters. Should see "The brief needs to be at least 200 characters." inline, form stays editable, no POST sent.

---

## Rollback

If a critical bug appears after push:

```bash
# Revert just the two endpoints (frontends gracefully degrade —
# they'll show "Couldn't reach the desk" on submit but no broken UI)
git revert <api/apply.js commit hash> <api/session-booking.js commit hash>
git push origin main

# Or revert the whole feature set
git revert --no-edit <forms wiring spec commit>..HEAD
git push origin main
```
