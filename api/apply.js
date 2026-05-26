/* HIMARK · Engagement intake — HubSpot Forms API proxy
   Vercel serverless function (CommonJS).

   ─── WHY THIS PROXY EXISTS ─────────────────────────────────
   The browser cannot POST directly to *.hsforms.com because
   uBlock Origin, AdBlock, Brave Shields, and Firefox's
   Enhanced Tracking Protection all block HubSpot endpoints
   on their default tracker lists. A meaningful fraction of
   real visitors silently fail to submit.

   This function sits same-origin at /api/apply and forwards
   the visitor's payload to HubSpot's public Forms API from
   the server, where no blocker can intercept. The browser
   only ever talks to its own domain.

   ─── REQUEST CONTRACT ──────────────────────────────────────
   POST /api/apply  Content-Type: application/json
   {
     "name":             "Ada Lovelace",
     "position_company": "Founder · Acme Corp",
     "email":            "ada@example.com",
     "phone":            "+27 ...",
     "tier":             "tier-02",
     "brief":            "<200–8000 chars>",
     "why":              "<optional>"
   }

   ─── HUBSPOT FORMS API ─────────────────────────────────────
   Region: eu1.  Portal: 148503009.
   Form:    7e1c1b56-5ef5-47ce-a491-d5a794fbe80c

   The form GUID determines which fields HubSpot persists.
   Extra fields are silently ignored upstream, so adding new
   fields to the HubSpot form does not require code changes.
*/

'use strict';

const PORTAL_ID  = '148503009';
const FORM_GUID  = '7e1c1b56-5ef5-47ce-a491-d5a794fbe80c';
const HUBSPOT_ENDPOINT =
  `https://api-eu1.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${FORM_GUID}`;

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function pad(n){ return String(n).padStart(2, '0'); }
function makeReference(){
  const d = new Date();
  return `APP-${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}` +
         `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      function: 'api/apply',
      method: 'GET',
      mode: 'hubspot-forms-proxy',
      portalId: PORTAL_ID,
      formGuid: FORM_GUID,
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
  const tier             = String(body.tier             || '').trim();
  const brief            = String(body.brief            || '').trim();
  const why              = String(body.why              || '').trim();

  /* Server-side validation — HubSpot will also validate per the
     form definition, but a quick gate here means we return clear
     error slugs instead of a passthrough of HubSpot's error shape. */
  if (!name || name.length > 200)             return json(res, 400, { ok: false, error: 'missing-name' });
  if (!positionCompany || positionCompany.length > 200) return json(res, 400, { ok: false, error: 'missing-position-company' });
  if (!EMAIL_RX.test(email))                  return json(res, 400, { ok: false, error: 'invalid-email' });
  if (!brief || brief.length < 200 || brief.length > 8000) return json(res, 400, { ok: false, error: 'brief-length' });
  if (why.length > 4000)                      return json(res, 400, { ok: false, error: 'why-too-long' });
  if (phone.length > 40)                      return json(res, 400, { ok: false, error: 'phone-too-long' });

  /* Split "Ada Lovelace" → firstname=Ada, lastname=Lovelace. */
  const nameParts = name.split(/\s+/);
  const firstname = nameParts[0] || '';
  const lastname  = nameParts.slice(1).join(' ');

  /* Split "CEO · Acme Corp" → jobtitle=CEO, company=Acme Corp. */
  let jobtitle = positionCompany;
  let company  = '';
  const sepIdx = positionCompany.indexOf(' · ');
  if (sepIdx !== -1) {
    jobtitle = positionCompany.slice(0, sepIdx).trim();
    company  = positionCompany.slice(sepIdx + 3).trim();
  }

  /* Fold optional "Why HIMARK" into the brief so HubSpot only
     needs one custom property. */
  const briefStr = why
    ? `${brief}\n\n--- Why HIMARK ---\n${why}`
    : brief;

  const reference = makeReference();

  const payload = {
    fields: [
      { objectTypeId: '0-1', name: 'email',        value: email     },
      { objectTypeId: '0-1', name: 'firstname',    value: firstname },
      { objectTypeId: '0-1', name: 'lastname',     value: lastname  },
      { objectTypeId: '0-1', name: 'phone',        value: phone     },
      { objectTypeId: '0-1', name: 'jobtitle',     value: jobtitle  },
      { objectTypeId: '0-1', name: 'company',      value: company   },
      { objectTypeId: '0-1', name: 'himark_tier',  value: tier      },
      { objectTypeId: '0-1', name: 'himark_brief', value: briefStr  }
    ],
    context: {
      pageUri:  String(body.pageUri  || 'https://www.himark.co.za/apply.html'),
      pageName: String(body.pageName || 'Apply for Engagement | HIMARK')
    }
  };

  try {
    const upstream = await fetch(HUBSPOT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (upstream.ok) {
      console.log('[apply] hubspot-forms accepted:', email, 'ref:', reference);
      return json(res, 200, { ok: true, reference });
    }

    const errText = await upstream.text().catch(() => '');
    console.error('[apply] hubspot-forms rejected', upstream.status, errText.slice(0, 500));

    /* HubSpot's v3 response shapes:
       400 → { status:'error', errors:[{errorType:'INVALID_EMAIL',...}] }
       404 → form GUID not found / not published
       Anything else → upstream failure */
    let errType = '';
    try {
      const parsed = JSON.parse(errText);
      errType = parsed && parsed.errors && parsed.errors[0] && parsed.errors[0].errorType || '';
    } catch (_) {}

    if (errType === 'INVALID_EMAIL')   return json(res, 400, { ok: false, error: 'invalid-email' });
    if (errType === 'REQUIRED_FIELD')  return json(res, 400, { ok: false, error: 'missing-required-field' });

    return json(res, 502, { ok: false, error: 'upstream-failed' });
  } catch (err) {
    console.error('[apply] network error reaching hubspot:', err);
    return json(res, 502, { ok: false, error: 'upstream-failed' });
  }
};
