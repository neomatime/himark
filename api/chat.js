/* HIMARK · Atlas chat endpoint
   Vercel serverless function (CommonJS, no package.json needed).

   Receives  POST { messages: [{role, content}, ...] }  from the
   Atlas widget in main.js, proxies to Gemini, and additionally:
     - extracts any qualified-lead block Atlas chose to emit
     - pushes that lead to HubSpot CRM as a new contact
     - strips the lead block out of the visitor-facing reply

   Env vars:
     - GEMINI_API_KEY        (required)  — Google AI Studio key
     - HUBSPOT_ACCESS_TOKEN  (optional)  — HubSpot Private App
                              token with crm.objects.contacts.write
                              scope. Without it, leads are logged
                              to the function output but not sent
                              anywhere. */

/* Model rotation history:
   - gemini-1.5-flash: deprecated, returns 404 on v1beta
   - gemini-2.0-flash: 404-free but free-tier quota was 0 for this
     project
   - gemini-2.5-flash: worked, but free-tier quota for this project
     is only 20 requests/day — exhausted under normal testing load
   - gemini-flash-lite-latest: Google's always-latest lite alias.
     Lite models have a separate, larger free-tier pool (typically
     1,500 RPD) and are fast + perfectly capable for a chat widget
     answering FAQs and running LeadSense. */
const GEMINI_MODEL = 'gemini-flash-lite-latest';

/* ATLAS SYSTEM PROMPT — extracted to its own file so you can edit
   the knowledge base, voice rules, and qualification flow without
   touching this function. See api/atlas-knowledge.js for the
   content. */
const SYSTEM_PROMPT = require('./atlas-knowledge');

/* ============================================================
   LEAD EXTRACTION
   Atlas may append `<lead>{...json...}</lead>` to its reply when a
   visitor is qualified. We pull the JSON, strip the marker from
   the user-facing reply, and forward the data to HubSpot.
   ============================================================ */
const LEAD_RE = /<lead>\s*([\s\S]*?)\s*<\/lead>/i;

function extractLead(text){
  if (!text || typeof text !== 'string') return null;
  const m = text.match(LEAD_RE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && typeof parsed === 'object' && parsed.email) {
      /* Defensive: trim everything, drop nulls. New LeadSense flow
         emits two extra fields — timeline and budget — captured at
         Steps 5 and 6 of the mandatory eight-step flow. */
      const clean = {};
      for (const k of ['name', 'email', 'company', 'role', 'brief', 'tier', 'timeline', 'budget']) {
        const v = parsed[k];
        if (typeof v === 'string') clean[k] = v.trim();
      }
      if (clean.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
        return clean;
      }
    }
  } catch (_) { /* malformed JSON — ignore */ }
  return null;
}

function stripLeadBlock(text){
  if (!text || typeof text !== 'string') return text;
  return text.replace(LEAD_RE, '').trim();
}

/* ============================================================
   HUBSPOT — create-or-update contact via the v3 CRM API.
   Uses HubSpot Private App access token. If the token isn't set,
   we just log and return; the chat still works without it.

   Approach: try POST /crm/v3/objects/contacts. If HubSpot returns
   409 (contact already exists), parse the existing-contact id from
   the error body and issue a PATCH to update the record instead.
   ============================================================ */
async function pushToHubSpot(lead){
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.log('[atlas] HUBSPOT_ACCESS_TOKEN not set — lead captured but not forwarded:', lead.email);
    return { skipped: 'no-token' };
  }

  const [firstname, ...rest] = (lead.name || '').trim().split(/\s+/);
  const lastname = rest.join(' ');
  const properties = {
    email: lead.email,
    firstname: firstname || '',
    lastname: lastname || '',
    company: lead.company || '',
    jobtitle: lead.role || '',
    hs_lead_status: 'NEW',
    lifecyclestage: 'lead',
    /* HIMARK custom properties — create these in HubSpot if you
       want them populated (Settings → Properties → Contacts).
       If they don't exist HubSpot will ignore them silently. */
    himark_brief:    lead.brief    || '',
    himark_tier:     lead.tier     || 'unsure',
    himark_timeline: lead.timeline || '',
    himark_budget:   lead.budget   || '',
    himark_source:   'atlas-chat'
  };

  /* Create. */
  let res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties })
  });

  if (res.ok) {
    console.log('[atlas] hubspot: contact created for', lead.email);
    return { created: true };
  }

  /* Already exists → 409 Conflict, body contains the existing id. */
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
        console.log('[atlas] hubspot: contact updated for', lead.email);
        return { updated: true };
      }
      const t = await patch.text().catch(() => '');
      console.error('[atlas] hubspot patch failed', patch.status, t.slice(0, 300));
      return { error: 'patch-failed', status: patch.status };
    }
    console.error('[atlas] hubspot 409 but no existing id parsed');
    return { error: 'conflict-no-id' };
  }

  /* Any other error — log and move on. The chat reply still gets
     delivered; the visitor is not blocked by a CRM failure. */
  const t = await res.text().catch(() => '');
  console.error('[atlas] hubspot create failed', res.status, t.slice(0, 300));
  return { error: 'create-failed', status: res.status };
}

/* ============================================================
   HANDLER
   ============================================================ */
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  /* DIAGNOSTIC GET — see api/chat in a browser to verify health. */
  if (req.method === 'GET') {
    const k = process.env.GEMINI_API_KEY || '';
    const base = {
      ok: true,
      function: 'api/chat',
      method: 'GET',
      keyPresent: k.length > 0,
      keyLength: k.length,
      keyStartsWith: k ? k.slice(0, 4) + '…' : null,
      hubspotConfigured: !!process.env.HUBSPOT_ACCESS_TOKEN,
      ttsConfigured: !!process.env.ELEVENLABS_API_KEY,
      ttsVoiceId: process.env.ELEVENLABS_VOICE_ID || 'sLfduly0sixkh8riDzed (Atlas — code default)',
      runtime: process.version || 'unknown'
    };
    if (!k) {
      res.statusCode = 200;
      return res.end(JSON.stringify(base));
    }
    try {
      const listRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}&pageSize=200`
      );
      if (listRes.ok) {
        const listData = await listRes.json().catch(() => null);
        const models = (listData && listData.models) || [];
        base.availableModels = models
          .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => (m.name || '').replace(/^models\//, ''))
          .sort();
      }
    } catch (_) {}
    try {
      const probe = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(k)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
            generationConfig: { maxOutputTokens: 20 }
          })
        }
      );
      const text = await probe.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
      base.geminiTest = {
        model: GEMINI_MODEL,
        status: probe.status,
        ok: probe.ok,
        errorMessage: parsed && parsed.error ? parsed.error.message : null,
        errorStatus: parsed && parsed.error ? parsed.error.status : null
      };
    } catch (e) {
      base.geminiTest = { model: GEMINI_MODEL, fetchError: String(e && e.message || e) };
    }

    /* Probe ElevenLabs with the configured voice ID. Returns the
       voice metadata if accessible; otherwise the exact error so
       we can see why the frontend keeps falling back to browser
       TTS. Costs no characters — just metadata, no audio. */
    const elKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'sLfduly0sixkh8riDzed';
    if (elKey) {
      try {
        const probe = await fetch(
          `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
          { headers: { 'xi-api-key': elKey } }
        );
        const text = await probe.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
        base.ttsTest = {
          voiceId,
          status: probe.status,
          ok: probe.ok,
          voiceName: parsed && parsed.name ? parsed.name : null,
          voiceCategory: parsed && parsed.category ? parsed.category : null,
          errorDetail: parsed && parsed.detail ? (parsed.detail.message || parsed.detail.status || JSON.stringify(parsed.detail).slice(0,200)) : null,
          rawExcerpt: text.slice(0, 280)
        };
      } catch (e) {
        base.ttsTest = { voiceId, fetchError: String(e && e.message || e) };
      }
    }
    res.statusCode = 200;
    return res.end(JSON.stringify(base));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: "Atlas is being configured. In the meantime you can reach us directly at info@himark.co.za or via the Intake form at /apply.html."
    }));
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'messages array required' }));
  }

  /* Per-turn mode signal. Frontend sends 'voice' when the visitor
     is on the voice tab; we append a focused hint to the system
     prompt so this specific reply comes back voice-friendly:
     spoken-natural, short, no URLs, no formatting. */
  const mode = (body && body.mode === 'voice') ? 'voice' : 'text';
  const systemForThisTurn = mode === 'voice'
    ? SYSTEM_PROMPT + '\n\n----------------------------------------\nTHIS TURN: VOICE MODE — live phone-call-style conversation\n----------------------------------------\n- This is a LIVE voice call. The visitor speaks, you speak back, the mic re-opens automatically, they speak again. Behave like you would on a real call.\n- Keep replies to 1–2 short sentences. No more. Brevity is the whole point.\n- Write the way you would SPEAK: no URLs, no markdown, no asterisks, no parentheses, no quoted dialogue, no labels like "Q:" or "A:".\n- End with a question or a natural beat that hands the turn back to the visitor. Never end with a monologue.\n- Never refer the visitor to text ("see the chat", "check the text response", "as I wrote above"). They cannot see while in voice mode. Just answer them.\n- If you need to ask for an email or company name, ask once, briefly, the way a person would on a call.\n- Pronunciation hint: the brand "HIMARK" is spoken as "Highmark" — the front-end substitutes it automatically, so write "HIMARK" normally and it will sound right.'
    : SYSTEM_PROMPT;

  /* Voice turns: keep less history so the prompt is smaller and
     Gemini's first-token latency is lower. Text turns: full 20
     because reads + LeadSense often benefit from longer memory. */
  const histLimit = mode === 'voice' ? 10 : 20;
  const contents = incoming.slice(-histLimit).map(m => ({
    role: m && m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String((m && m.content) || '').slice(0, 4000) }]
  }));

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemForThisTurn }] },
          contents,
          generationConfig: {
            temperature: 0.65,
            topP: 0.9,
            /* Voice replies must be SHORT — both for naturalness and
               for latency. 110 tokens is roughly 2 short sentences,
               which is the target the system prompt enforces. */
            maxOutputTokens: mode === 'voice' ? 110 : 500
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',      threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',threshold: 'BLOCK_ONLY_HIGH' }
          ]
        })
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('[atlas] gemini error', upstream.status, errText.slice(0, 500));
      res.statusCode = 200;
      return res.end(JSON.stringify({
        reply: "Atlas is having a brief connectivity issue. Please try again in a moment, or reach us at info@himark.co.za."
      }));
    }

    const data = await upstream.json();
    const rawReply = (data && data.candidates && data.candidates[0]
                      && data.candidates[0].content
                      && data.candidates[0].content.parts
                      && data.candidates[0].content.parts[0]
                      && data.candidates[0].content.parts[0].text || '').trim();

    /* Extract any lead block Atlas chose to emit. Fire-and-forget
       the HubSpot push so we don't block the visitor on it. The
       visitor sees the lead-block stripped reply either way. */
    const lead = extractLead(rawReply);
    const visibleReply = stripLeadBlock(rawReply);

    if (lead) {
      pushToHubSpot(lead).catch(e => console.error('[atlas] hubspot push exception', e && e.message));
    }

    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: visibleReply || "I'm not able to respond on that just now. Please reach us at info@himark.co.za or via the Intake form at /apply.html.",
      leadCaptured: !!lead
    }));
  } catch (err) {
    console.error('[atlas] handler error', err && err.message);
    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: "Atlas is offline for a moment. Please reach us at info@himark.co.za or via the Intake form."
    }));
  }
};
