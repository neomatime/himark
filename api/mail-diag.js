/* HIMARK · Mail diagnostic endpoint
   ==================================================================
   GET /api/mail-diag           → returns JSON describing the current
                                  Resend configuration: which env vars
                                  are set, whether the API key is
                                  valid (calls Resend GET /domains),
                                  which domains Resend knows about
                                  for this account, the verification
                                  status of himark.co.za, and what
                                  MAIL_FROM / MAIL_TO_APPLICATIONS
                                  will resolve to.

   GET /api/mail-diag?send=1    → in addition to the diagnostic, fires
                                  a real PDF-attached email to
                                  apply@himark.co.za with a fake but
                                  well-formed lead record. The send
                                  result (Resend's response, including
                                  error body if any) is folded into
                                  the JSON response. Use this once
                                  you think the env config is right
                                  and you want to confirm end-to-end
                                  delivery without going through a
                                  full LeadSense conversation.

   The point: a single browser hit on the production URL surfaces
   every failure mode the email pipeline could hit, with the actual
   Resend response body for any that are non-OK. Visiting it is the
   fastest way to triage "I added the key but email isn't arriving".
*/

const { emailApplication } = require('../lib/mail-application');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'GET only' }));
  }

  const result = {
    ok: true,
    function: 'api/mail-diag',
    timestamp: new Date().toISOString(),
    envConfig: {
      RESEND_API_KEY: maskKey(process.env.RESEND_API_KEY),
      MAIL_FROM: process.env.MAIL_FROM || '(unset — default: Atlas <atlas@himark.co.za>)',
      MAIL_TO_APPLICATIONS: process.env.MAIL_TO_APPLICATIONS || '(unset — default: apply@himark.co.za)'
    }
  };

  /* --- 1. Resend key validity + domains list --- */
  if (!process.env.RESEND_API_KEY) {
    result.resendCheck = {
      keyPresent: false,
      verdict: 'NOT CONFIGURED — set RESEND_API_KEY in Vercel env vars and redeploy.'
    };
  } else {
    try {
      const probe = await fetch('https://api.resend.com/domains', {
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY }
      });
      const text = await probe.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
      if (probe.ok && parsed && Array.isArray(parsed.data)) {
        const domains = parsed.data.map(d => ({
          id: d.id,
          name: d.name,
          status: d.status,
          region: d.region,
          createdAt: d.created_at
        }));
        const himark = domains.find(d => d.name === 'himark.co.za');
        result.resendCheck = {
          keyPresent: true,
          keyValid: true,
          httpStatus: probe.status,
          domainsKnown: domains,
          himarkDomain: himark || null,
          himarkVerified: !!(himark && himark.status === 'verified'),
          verdict: himark
            ? (himark.status === 'verified'
                ? 'READY — domain verified, key works. Sends should arrive.'
                : 'DOMAIN NOT VERIFIED — Resend status: ' + himark.status + '. Add the DNS records Resend shows on the domain page.')
            : 'DOMAIN NOT ADDED — himark.co.za isn\'t in this account\'s Domains list. Add it via Resend dashboard → Domains → Add Domain.'
        };
      } else {
        result.resendCheck = {
          keyPresent: true,
          keyValid: false,
          httpStatus: probe.status,
          errorMessage: parsed && (parsed.message || parsed.name) || null,
          rawExcerpt: text.slice(0, 400),
          verdict: probe.status === 401
            ? 'KEY INVALID — Resend returned 401. Regenerate the key in Resend dashboard and paste fresh into Vercel.'
            : 'RESEND ERROR — status ' + probe.status + '. See errorMessage / rawExcerpt below.'
        };
      }
    } catch (e) {
      result.resendCheck = {
        keyPresent: true,
        keyValid: null,
        fetchError: String(e && e.message || e),
        verdict: 'NETWORK ERROR — could not reach api.resend.com. Try again, or check Vercel function outbound network.'
      };
    }
  }

  /* --- 2. Optional test send --- */
  if (req.query && req.query.send) {
    const testRecord = {
      name: 'Diagnostic Test',
      email: 'diagnostic-test@himark.co.za',
      phone: '+27 11 555 0000',
      company: 'HIMARK · Self-test',
      role: 'Diagnostic',
      brief: 'This is an automated diagnostic send triggered from /api/mail-diag?send=1. If you see this in apply@himark.co.za, the email pipeline is fully wired and delivering. If you do NOT see this in the inbox, check the testSend.result below for the error from Resend.',
      tier: 'growth',
      timeline: 'diagnostic',
      budget: 'diagnostic'
    };
    const testScoring = { score: 50, bucket: 'Standard' };

    try {
      const sendResult = await emailApplication(testRecord, testScoring, 'atlas-chat');
      result.testSend = {
        attempted: true,
        result: sendResult,
        verdict: sendResult && sendResult.sent
          ? 'SENT — Resend accepted the email (id: ' + sendResult.id + '). Check apply@himark.co.za inbox AND spam folder.'
          : sendResult && sendResult.skipped
            ? 'SKIPPED — ' + sendResult.skipped + '. Fix the env config first.'
            : 'FAILED — see result.error above. Most common: domain not verified (Resend rejects). Status: ' + (sendResult && sendResult.status)
      };
    } catch (e) {
      result.testSend = {
        attempted: true,
        threw: String(e && e.message || e),
        verdict: 'EXCEPTION during emailApplication() — see threw above.'
      };
    }
  } else {
    result.testSend = {
      attempted: false,
      note: 'Append ?send=1 to this URL to fire a real test email to apply@himark.co.za. (e.g. /api/mail-diag?send=1)'
    };
  }

  res.statusCode = 200;
  return res.end(JSON.stringify(result, null, 2));
};

function maskKey(key){
  if (!key) return '(unset)';
  if (key.length < 8) return '(set, length ' + key.length + ')';
  return key.slice(0, 4) + '…' + key.slice(-4) + ' (length ' + key.length + ')';
}
