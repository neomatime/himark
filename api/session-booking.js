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
