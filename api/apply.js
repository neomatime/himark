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
