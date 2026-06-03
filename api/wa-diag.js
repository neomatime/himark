/* HIMARK · WhatsApp Flow diagnostic endpoint
   ==================================================================
   GET /api/wa-diag → returns JSON describing the current WhatsApp
                     Flow configuration: which env vars are set,
                     whether each Flow ID resolves through Meta's
                     Graph API, the publish status of each flow,
                     and a plain-English verdict on why Atlas might
                     be falling back to plain text instead of the
                     interactive form.

   The Flow fallback path (sendWhatsAppReply) is silent by design —
   if a Flow send fails or the env var isn't configured, Atlas asks
   for the data in prose so the conversation never breaks. That's
   correct for production but makes "the form isn't appearing" hard
   to triage from outside. This endpoint surfaces exactly which step
   is the blocker:
     - env var unset      → set it in Vercel
     - flow not published → click Publish in Meta Business Manager
     - flow archived      → unarchive it
     - flow id invalid    → wrong id pasted into env var
*/

const WA_GRAPH_VERSION = 'v18.0';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'GET only' }));
  }

  const result = {
    ok: true,
    function: 'api/wa-diag',
    timestamp: new Date().toISOString(),
    envConfig: {
      WHATSAPP_PHONE_NUMBER_ID: maskId(process.env.WHATSAPP_PHONE_NUMBER_ID),
      WHATSAPP_ACCESS_TOKEN:    maskKey(process.env.WHATSAPP_ACCESS_TOKEN),
      WHATSAPP_FLOW_IDENTITY_ID: maskId(process.env.WHATSAPP_FLOW_IDENTITY_ID),
      WHATSAPP_FLOW_SESSION_ID:  maskId(process.env.WHATSAPP_FLOW_SESSION_ID),
      WHATSAPP_WELCOME_IMAGE_URL: process.env.WHATSAPP_WELCOME_IMAGE_URL || '(unset — default: himark.co.za/images/whatsapp-welcome.png)'
    }
  };

  /* Without an access token nothing else is checkable. */
  if (!process.env.WHATSAPP_ACCESS_TOKEN) {
    result.verdict = 'WHATSAPP_ACCESS_TOKEN not set — fix that first, this is the bearer Meta needs for every Graph API call.';
    res.statusCode = 200;
    return res.end(JSON.stringify(result, null, 2));
  }

  /* --- Flow checks --- */
  result.flowChecks = {};

  /* Identity flow */
  const idFlow = process.env.WHATSAPP_FLOW_IDENTITY_ID;
  if (!idFlow) {
    result.flowChecks.identity = {
      configured: false,
      verdict: 'NOT CONFIGURED — Atlas will fall back to asking for name/email/phone in prose. To enable the form: publish the identity flow in Meta Business Manager, copy the Flow ID, set WHATSAPP_FLOW_IDENTITY_ID in Vercel, redeploy.'
    };
  } else {
    result.flowChecks.identity = await probeFlow(idFlow, 'identity');
  }

  /* Session flow */
  const sessFlow = process.env.WHATSAPP_FLOW_SESSION_ID;
  if (!sessFlow) {
    result.flowChecks.session = {
      configured: false,
      verdict: 'NOT CONFIGURED — Atlas will fall back to asking for session details in prose. Same fix as above with WHATSAPP_FLOW_SESSION_ID.'
    };
  } else {
    result.flowChecks.session = await probeFlow(sessFlow, 'session');
  }

  /* --- Optional test send: bypass Atlas, send Flow directly --- */
  /* /api/wa-diag?send=identity&to=27821234567   (your WhatsApp number)
     /api/wa-diag?send=session&to=27821234567
     Isolates the Flow send pipeline from Atlas's prompt fidelity. If
     this succeeds and the form lands on your phone, the wiring is
     correct and the missing-form symptom is purely Atlas not emitting
     the marker. If this fails, the failure body tells us exactly what
     Meta rejected. */
  const sendWhich = req.query && req.query.send;
  const sendTo    = req.query && req.query.to;
  if (sendWhich) {
    if (!sendTo) {
      result.testSend = {
        attempted: false,
        error: 'Missing ?to=... param. Provide your own WhatsApp number (country code + national number, no + or spaces). e.g. ?send=identity&to=27821234567'
      };
    } else if (sendWhich !== 'identity' && sendWhich !== 'session') {
      result.testSend = {
        attempted: false,
        error: 'send=? must be either identity or session. Got: ' + sendWhich
      };
    } else {
      const flowId = sendWhich === 'session'
        ? process.env.WHATSAPP_FLOW_SESSION_ID
        : process.env.WHATSAPP_FLOW_IDENTITY_ID;
      if (!flowId) {
        result.testSend = {
          attempted: false,
          error: 'Env var for that flow not set. See envConfig above.'
        };
      } else {
        result.testSend = await sendTestFlow(sendTo, sendWhich, flowId);
      }
    }
  } else {
    result.testSend = {
      attempted: false,
      note: 'Append ?send=identity&to=<your-whatsapp-number> (or ?send=session&to=...) to fire a test Flow directly to your phone. Bypasses Atlas — proves the send pipeline works.'
    };
  }

  /* Roll up to an overall verdict. */
  const idOk   = result.flowChecks.identity.publishedAndUsable;
  const sessOk = result.flowChecks.session.publishedAndUsable;
  result.verdict = (idOk && sessOk)
    ? 'BOTH FLOWS READY — Atlas should send interactive forms for identity capture (Step 8 of LeadSense) and session booking. If you\'re still seeing prose, check the Vercel runtime logs for [wa] flow send failed or [wa] flow marker present but no flow id env var configured.'
    : idOk
      ? 'IDENTITY READY · SESSION NOT — Step 8 form works; session booking falls back to prose.'
      : sessOk
        ? 'SESSION READY · IDENTITY NOT — session booking works; Step 8 falls back to prose.'
        : 'NEITHER READY — both flows fall back to prose. See individual flowChecks verdicts above.';

  res.statusCode = 200;
  return res.end(JSON.stringify(result, null, 2));
};

/* Hit Meta Graph API for the given flow id. Returns structured
   info on whether the flow exists, is published, and is in the
   account this token belongs to. */
async function probeFlow(flowId, label){
  try {
    /* Graph endpoint for a Flow: returns id, name, status, categories. */
    const url = `https://graph.facebook.com/${WA_GRAPH_VERSION}/${flowId}?fields=id,name,status,categories,validation_errors,health_status`;
    const probe = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + process.env.WHATSAPP_ACCESS_TOKEN }
    });
    const text = await probe.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { parsed = null; }

    if (!probe.ok) {
      const errMsg = parsed && parsed.error && parsed.error.message;
      const errType = parsed && parsed.error && parsed.error.type;
      return {
        configured: true,
        flowIdPreview: maskId(flowId),
        httpStatus: probe.status,
        publishedAndUsable: false,
        errorMessage: errMsg || null,
        errorType: errType || null,
        rawExcerpt: text.slice(0, 400),
        verdict: probe.status === 404
          ? 'FLOW NOT FOUND — the Flow ID in WHATSAPP_FLOW_' + label.toUpperCase() + '_ID isn\'t recognised by Meta. Either the ID is wrong (typo), or the flow was deleted, or the access token belongs to a different WABA than the flow.'
          : probe.status === 401 || probe.status === 403
            ? 'ACCESS DENIED — the WHATSAPP_ACCESS_TOKEN doesn\'t have permission to read this flow. Check the token scopes and which WABA it belongs to.'
            : 'GRAPH API ERROR ' + probe.status + ' — see errorMessage / rawExcerpt below.'
      };
    }

    const status = parsed && parsed.status;
    const isPublished = status === 'PUBLISHED';
    return {
      configured: true,
      flowIdPreview: maskId(flowId),
      httpStatus: probe.status,
      publishedAndUsable: isPublished,
      flowName: parsed && parsed.name,
      flowStatus: status,
      categories: parsed && parsed.categories,
      healthStatus: parsed && parsed.health_status,
      validationErrors: parsed && parsed.validation_errors,
      verdict: isPublished
        ? 'READY — flow "' + (parsed && parsed.name) + '" is published. Atlas can send this.'
        : status === 'DRAFT'
          ? 'DRAFT — flow exists but is not published. Open it in Meta Business Manager and click Publish. Until then Atlas falls back to prose.'
          : status === 'DEPRECATED'
            ? 'DEPRECATED — Meta has deprecated this flow. Recreate from the JSON in docs/whatsapp-flow-' + label + '.json.'
            : 'STATUS: ' + status + ' — see flowStatus / validationErrors. Atlas falls back to prose until status === PUBLISHED.'
    };
  } catch (e) {
    return {
      configured: true,
      flowIdPreview: maskId(flowId),
      publishedAndUsable: false,
      fetchError: String(e && e.message || e),
      verdict: 'NETWORK ERROR — could not reach graph.facebook.com. Retry; usually transient.'
    };
  }
}

/* sendTestFlow — fires an interactive Flow message directly to the
   given phone number, bypassing the orchestrator + Atlas prompt.
   Returns the Graph API response (status code + body) so we can see
   exactly what Meta said. */
async function sendTestFlow(toRaw, flowName, flowId){
  /* WhatsApp expects the phone number with country code, no + or
     spaces, e.g. 27821234567 for SA. Sanitize whatever the caller
     passed. */
  const to = String(toRaw || '').replace(/[^0-9]/g, '');
  if (!to) return { attempted: false, error: 'Phone number had no digits after sanitisation.' };

  const screen = flowName === 'session' ? 'SESSION_BOOKING_SCREEN' : 'IDENTITY_SCREEN';
  const cta    = flowName === 'session' ? 'Book session' : 'Share details';
  const body   = flowName === 'session'
    ? 'Diagnostic test send for the session booking flow. Tap to open.'
    : 'Diagnostic test send for the identity capture flow. Tap to open.';

  try {
    const res = await fetch(`https://graph.facebook.com/${WA_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.WHATSAPP_ACCESS_TOKEN,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: { text: body },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: 'diag-' + Date.now(),
              flow_id: flowId,
              flow_cta: cta,
              flow_action: 'navigate',
              flow_action_payload: { screen, data: {} }
            }
          }
        }
      })
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
    return {
      attempted: true,
      to,
      flowName,
      flowIdPreview: maskId(flowId),
      httpStatus: res.status,
      ok: res.ok,
      response: parsed || text.slice(0, 600),
      verdict: res.ok
        ? 'SUCCESS — Meta accepted the send. Check your WhatsApp app, you should see the interactive Flow card with the "' + cta + '" button. If you don\'t see it, the visitor on this WhatsApp number may have a 24h customer-service window issue (you need to message HIMARK first).'
        : 'FAILED — Meta rejected the send. See response.error for the reason. Common causes: visitor hasn\'t messaged within 24h (customer-service window closed); rate limit; WABA verification missing for marketing template.'
    };
  } catch (e) {
    return {
      attempted: true,
      to,
      threw: String(e && e.message || e),
      verdict: 'EXCEPTION — network error during Graph API call.'
    };
  }
}

function maskKey(key){
  if (!key) return '(unset)';
  if (key.length < 8) return '(set, length ' + key.length + ')';
  return key.slice(0, 4) + '…' + key.slice(-4) + ' (length ' + key.length + ')';
}

function maskId(id){
  if (!id) return '(unset)';
  /* Phone Number IDs and Flow IDs are numeric ~15-16 chars; show
     enough to spot a typo but not the whole thing in case logs leak. */
  if (id.length < 10) return id;
  return id.slice(0, 4) + '…' + id.slice(-4) + ' (length ' + id.length + ')';
}
