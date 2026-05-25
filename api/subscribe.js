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
