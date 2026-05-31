/* HIMARK · WhatsApp Business webhook
   ─────────────────────────────────────────────────────────────────
   Vercel serverless function that receives incoming WhatsApp
   messages from Meta's WhatsApp Cloud API, runs each message through
   the same Atlas brain that powers the on-site chat widget
   (api/chat.js), and sends the reply back via the Cloud API. Net
   effect: HIMARK's WhatsApp Business number answers like Atlas does
   on the site — same knowledge, same LeadSense qualification, same
   HubSpot push.

   GET  = webhook verification handshake (Meta calls this once when
          you save the webhook URL in the Developer Console).
   POST = incoming message events from subscribed WhatsApp accounts.

   ── REQUIRED ENV VARS (Vercel → Settings → Environment Variables) ──
     GEMINI_API_KEY            — same key as api/chat.js
     WHATSAPP_VERIFY_TOKEN     — any string you choose; you'll paste
                                 the same string into the Meta
                                 Developer Console webhook settings
     WHATSAPP_ACCESS_TOKEN     — permanent System User token from
                                 Meta Business Suite (NOT the
                                 temporary 24-hour test token)
     WHATSAPP_PHONE_NUMBER_ID  — the Phone Number ID (NOT the phone
                                 number itself) from
                                 Meta App → WhatsApp → API Setup
   ── OPTIONAL ENV VARS ──
     HUBSPOT_ACCESS_TOKEN      — if set, qualified leads or session
                                 bookings emitted by Atlas are pushed
                                 to HubSpot the same way as the web
                                 chat (himark_source: 'atlas-whatsapp')

   ── ONE-TIME META SETUP CHECKLIST ──
     1. developers.facebook.com → Create App → Business → "Other"
        product → add "WhatsApp" product
     2. WhatsApp → API Setup → note the Phone Number ID, copy the
        test token (24h) for first probe, then create a permanent
        System User token (Meta Business Suite → Business Settings
        → Users → System Users → assign whatsapp_business_messaging
        + whatsapp_business_management permissions on your WABA)
     3. Add your real HIMARK Business number to the WABA (Add Phone
        Number → verify SMS / voice OTP)
     4. WhatsApp → Configuration → Webhook → Edit
          Callback URL:  https://www.himark.co.za/api/whatsapp
          Verify token:  <same string you set as WHATSAPP_VERIFY_TOKEN>
        Click "Verify and save" — Meta will GET this endpoint, we
        echo the challenge back, you'll see a green ✓.
     5. Webhook fields → subscribe to "messages"
     6. Test from any number — your test phone should receive an
        Atlas reply within ~2s.
*/

const SYSTEM_PROMPT = require('./atlas-knowledge');
const { scoreLead, BUCKET_CLOSING_LINES, DEFAULT_SUBSTITUTION_TARGET, BUCKET_STANDARD } = require('./scoring');

const GEMINI_MODEL = 'gemini-flash-lite-latest';
/* Audio turns need the FULL Flash variant — gemini-flash-lite-latest is
   text + image only and returns 500 on audio inline_data. We pay slightly
   more per audio turn but voice notes are the minority of traffic and the
   alternative is silently dropping them with a fallback message. */
const GEMINI_MODEL_AUDIO = 'gemini-flash-latest';
const WA_GRAPH_VERSION = 'v18.0';

/* ============================================================
   CHUNKING — paragraph breaks → separate WhatsApp messages
   Atlas inserts `\n\n` at natural pause points in his reply
   (see atlas-knowledge.js §1). We split on those and send each
   paragraph as its own Graph message, with a short pause between,
   so the rhythm feels like a real person texting rather than a
   wall-of-text reply.
   Cap at 3 chunks — protects against runaway / malformed output.
   Pause formula: 400ms base + 8ms per char of the NEXT chunk,
   capped at 1500ms. Short chunks land snappy; long chunks get
   a touch more breathing room before they appear.
   ============================================================ */
function splitIntoChunks(text){
  const parts = String(text || '')
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.slice(0, 3);
}
function chunkPauseMs(nextChunk){
  return Math.min(1500, 400 + (nextChunk || '').length * 8);
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/* ============================================================
   CONVERSATION HISTORY
   In-memory Map keyed by sender phone number. Survives within a
   warm Vercel instance for the life of that instance; clears on
   cold start. For long-lived conversation continuity across
   restarts, this is the slot to drop Upstash Redis / Vercel KV
   in front of (same interface — getHistory/appendHistory).
   ============================================================ */
const HISTORY = new Map();
const HISTORY_LIMIT = 20;     // keep last N turns per visitor
const HISTORY_TTL_MS = 30 * 60 * 1000; // 30 min idle → reset
const HISTORY_TS = new Map();

function pruneExpired(){
  const now = Date.now();
  for (const [phone, ts] of HISTORY_TS) {
    if (now - ts > HISTORY_TTL_MS) {
      HISTORY.delete(phone);
      HISTORY_TS.delete(phone);
    }
  }
}

function appendHistory(phone, role, content){
  pruneExpired();
  const arr = HISTORY.get(phone) || [];
  arr.push({ role, content });
  if (arr.length > HISTORY_LIMIT) arr.splice(0, arr.length - HISTORY_LIMIT);
  HISTORY.set(phone, arr);
  HISTORY_TS.set(phone, Date.now());
}

function getHistory(phone){
  pruneExpired();
  return HISTORY.get(phone) || [];
}

/* ============================================================
   LEAD + SESSION EXTRACTION  (mirrors api/chat.js)
   Atlas emits <lead>{...}</lead> or <session>{...}</session> when
   a visitor is qualified. We strip those blocks from the visitor-
   facing WhatsApp reply and push them into HubSpot.
   ============================================================ */
const LEAD_RE    = /<lead>\s*([\s\S]*?)\s*<\/lead>/i;
const SESSION_RE = /<session>\s*([\s\S]*?)\s*<\/session>/i;

function parseBlock(text, regex, fields){
  if (!text || typeof text !== 'string') return null;
  const m = text.match(regex);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && typeof parsed === 'object' && parsed.email) {
      const clean = {};
      for (const k of fields) {
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

function extractLead(text){
  return parseBlock(text, LEAD_RE,
    ['name', 'email', 'company', 'role', 'brief', 'tier', 'timeline', 'budget']);
}
function extractSession(text){
  return parseBlock(text, SESSION_RE,
    ['name', 'email', 'company', 'role', 'brief', 'window', 'format']);
}
function stripBlocks(text){
  if (!text || typeof text !== 'string') return text;
  return text.replace(LEAD_RE, '').replace(SESSION_RE, '').trim();
}

/* ============================================================
   HUBSPOT  (mirrors api/chat.js, tagged 'atlas-whatsapp')
   ============================================================ */
async function pushToHubSpot(record, kind, fromPhone){
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.log('[wa] HUBSPOT_ACCESS_TOKEN not set — ' + kind + ' captured but not forwarded:', record.email);
    return { skipped: 'no-token' };
  }

  const [firstname, ...rest] = (record.name || '').trim().split(/\s+/);
  const lastname = rest.join(' ');
  const isSession = kind === 'session';

  let timelineStr = record.timeline || record.window || '';
  if (isSession && record.format) {
    const fmt = String(record.format).toLowerCase().trim();
    const fmtLabel = fmt === 'in-person' ? 'In person' : 'Video call';
    timelineStr = timelineStr ? `${timelineStr} · ${fmtLabel}` : fmtLabel;
  }

  const properties = {
    email: record.email,
    firstname: firstname || '',
    lastname: lastname || '',
    company: record.company || '',
    jobtitle: record.role || '',
    /* Stamp the WhatsApp number on the contact so the team can
       reply on the same channel the visitor used. */
    phone: fromPhone ? ('+' + String(fromPhone).replace(/^\+/, '')) : '',
    hs_lead_status: 'NEW',
    lifecyclestage: 'lead',
    himark_brief:    record.brief    || '',
    himark_tier:     record.tier     || (isSession ? 'session' : 'unsure'),
    himark_timeline: timelineStr,
    himark_budget:   record.budget   || '',
    himark_source:   isSession ? 'atlas-whatsapp-session-booking' : 'atlas-whatsapp'
  };

  let res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties })
  });
  if (res.ok) {
    console.log('[wa] hubspot: contact created for ' + kind + ':', record.email);
    return { created: true };
  }
  if (res.status === 409) {
    let existingId = null;
    try {
      const err = await res.json();
      const m = (err && err.message || '').match(/Existing ID:\s*(\d+)/i);
      if (m) existingId = m[1];
    } catch (_) {}
    if (existingId) {
      const patch = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties })
      });
      if (patch.ok) {
        console.log('[wa] hubspot: contact updated for ' + kind + ':', record.email);
        return { updated: true };
      }
    }
    return { error: 'conflict-no-update' };
  }
  const t = await res.text().catch(() => '');
  console.error('[wa] hubspot create failed', res.status, t.slice(0, 300));
  return { error: 'create-failed', status: res.status };
}

/* ============================================================
   WHATSAPP MEDIA DOWNLOAD
   Voice notes arrive as a media id on the webhook. To pass them to
   Gemini we need the raw bytes — Graph requires a two-step dance:
     1. GET /v18.0/{media_id} → returns a temporary signed URL
     2. GET that URL with the access token → returns the audio bytes
   Returns { base64, mimeType } or null on any failure.
   ============================================================ */
async function fetchWhatsAppMediaBase64(mediaId){
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!mediaId || !accessToken) return null;

  /* Step 1 — fetch the media metadata (gives us a signed download URL) */
  let urlRes;
  try {
    urlRes = await fetch(`https://graph.facebook.com/${WA_GRAPH_VERSION}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
  } catch (err) {
    console.error('[wa] media url fetch threw',
      err && err.message,
      'cause:', err && err.cause && (err.cause.message || err.cause.code || String(err.cause)));
    return null;
  }
  if (!urlRes.ok) {
    const t = await urlRes.text().catch(() => '');
    console.error('[wa] media url fetch failed', urlRes.status, t.slice(0, 300));
    return null;
  }
  const meta = await urlRes.json().catch(() => null);
  if (!meta || !meta.url) {
    console.error('[wa] media metadata missing url', meta);
    return null;
  }

  /* Step 2 — download the actual bytes from the signed URL.
     The signed URL still requires the bearer token; without it
     Graph returns 401 even though the URL itself looks complete. */
  let mediaRes;
  try {
    mediaRes = await fetch(meta.url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
  } catch (err) {
    console.error('[wa] media download threw',
      err && err.message,
      'cause:', err && err.cause && (err.cause.message || err.cause.code || String(err.cause)));
    return null;
  }
  if (!mediaRes.ok) {
    console.error('[wa] media download failed', mediaRes.status);
    return null;
  }
  const arr = await mediaRes.arrayBuffer();
  const buf = Buffer.from(arr);
  /* Gemini inline_data limit is ~20MB; WhatsApp voice notes are
     typically <500KB so we don't expect to hit this in practice.
     Bail early if we ever do, rather than silently truncating. */
  if (buf.byteLength > 18 * 1024 * 1024) {
    console.error('[wa] media too large for inline gemini call', buf.byteLength);
    return null;
  }
  return {
    base64: buf.toString('base64'),
    mimeType: (meta.mime_type || 'audio/ogg').split(';')[0].trim()
  };
}

/* ============================================================
   ATLAS BRAIN — Gemini call, same model/prompt as api/chat.js
   with a WhatsApp-specific tone overlay (short, plain text, no
   markdown, no "let's chat on WhatsApp" filler since we ARE on
   WhatsApp).
   ============================================================ */
async function askAtlas(history, extraParts){
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const isFirstTurn = history.length === 1;
  let systemForThisTurn = SYSTEM_PROMPT
    + '\n\n----------------------------------------\n'
    + 'THIS TURN: WHATSAPP MODE\n'
    + '----------------------------------------\n'
    + '- You are ON WhatsApp. The visitor opened a chat with HIMARK\'s WhatsApp Business number. Do NOT suggest moving to WhatsApp; you are already there.\n'
    + '- Mobile screen — keep replies short. 2–4 sentences per turn unless the visitor explicitly asks for detail. No walls of text.\n'
    + '- Plain text only. No markdown, no asterisks for emphasis, no bullet symbols, no URLs unless absolutely necessary (and then make them clickable plain — "https://...").\n'
    + '- Speak naturally as if you were a real principal\'s assistant typing on a phone. Sentence case. Don\'t shout.\n'
    + '- Pronunciation: the brand is "HIMARK" — write it normally.\n'
    + '- If the visitor wants to apply, walk them through LeadSense conversationally one question at a time. Don\'t dump a form.\n'
    + '- If the visitor sends a voice note, listen to it and respond to what they said as if they had typed it. Don\'t parrot a transcription back. Don\'t say "I heard you" — just answer naturally.';

  if (isFirstTurn) {
    systemForThisTurn += '\n\n----------------------------------------\n'
      + 'FIRST TURN — visitor\'s opening WhatsApp message\n'
      + '----------------------------------------\n'
      + '- Open with one short, warm self-introduction line ("Atlas here — HIMARK\'s in-house assistant.") and then either ask how you can help, or answer their question directly if they already asked one.\n'
      + '- Lean introduction. Don\'t recite the firm\'s history, tiers, or method unless asked.\n'
      + '- Do NOT mention that you\'re an AI / model. You are Atlas.';
  }

  /* Build the contents array. For the LAST user turn, if extraParts
     were passed (a voice note as inline_data), append them so Gemini
     receives the audio alongside the textual context of prior turns. */
  const window = history.slice(-HISTORY_LIMIT);
  const lastIdx = window.length - 1;
  const contents = window.map((m, i) => {
    const isLastUserTurn = i === lastIdx && m.role !== 'assistant';
    const textValue = String(m.content || '').slice(0, 4000);
    const baseParts = textValue ? [{ text: textValue }] : [];
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: (isLastUserTurn && Array.isArray(extraParts) && extraParts.length)
        ? [...baseParts, ...extraParts]
        : baseParts
    };
  });

  /* Pick model: text-only turns use the cheap Lite alias; audio
     inline_data parts must go to the full Flash variant because Lite
     500s on audio. We sniff extraParts for any audio/* mime type. */
  const hasAudio = Array.isArray(extraParts) && extraParts.some(p =>
    p && p.inline_data && String(p.inline_data.mime_type || '').startsWith('audio/'));
  const model = hasAudio ? GEMINI_MODEL_AUDIO : GEMINI_MODEL;

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemForThisTurn }] },
          contents,
          generationConfig: {
            temperature: 0.65,
            topP: 0.9,
            maxOutputTokens: 350
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
          ]
        })
      }
    );
  } catch (err) {
    console.error('[wa] gemini fetch threw',
      err && err.message,
      'cause:', err && err.cause && (err.cause.message || err.cause.code || String(err.cause)));
    return null;
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[wa] gemini error', res.status, t.slice(0, 300));
    return null;
  }
  const data = await res.json();
  return (data && data.candidates && data.candidates[0]
          && data.candidates[0].content && data.candidates[0].content.parts
          && data.candidates[0].content.parts[0]
          && data.candidates[0].content.parts[0].text || '').trim();
}

/* ============================================================
   WHATSAPP CLOUD API — send a text reply.
   WhatsApp accepts up to 4096 chars per text message; we cap at
   that to avoid silent send failures.
   ============================================================ */
async function sendWhatsAppText(to, body){
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.error('[wa] missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { error: 'env-missing' };
  }
  const text = String(body || '').slice(0, 4000);
  if (!text) return { error: 'empty-body' };

  let res;
  try {
    res = await fetch(`https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text }
      })
    });
  } catch (err) {
    console.error('[wa] send fetch threw',
      err && err.message,
      'cause:', err && err.cause && (err.cause.message || err.cause.code || String(err.cause)));
    return { error: 'fetch-threw' };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[wa] send failed', res.status, t.slice(0, 400));
    return { error: 'send-failed', status: res.status };
  }
  return { sent: true };
}

/* Chunked variant — splits the body on `\n\n` and sends each piece
   as a separate WhatsApp message, with a short pause between, so
   the rhythm feels like real texting. Single-chunk replies fall
   through to a regular single send so there is zero extra latency
   when Atlas didn't choose to split.
   Returns { chunks, results } where results is an array of the
   individual sendWhatsAppText return values, in send order. If the
   first send fails we abort the rest to avoid posting partial junk. */
async function sendWhatsAppTextChunks(to, body){
  const chunks = splitIntoChunks(body);
  if (chunks.length === 0) {
    return { chunks: 0, error: 'empty-body' };
  }
  if (chunks.length === 1) {
    const result = await sendWhatsAppText(to, chunks[0]);
    return { chunks: 1, results: [result] };
  }
  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    const result = await sendWhatsAppText(to, chunks[i]);
    results.push(result);
    if (result && result.error && i === 0) {
      console.error('[wa] first chunk failed, aborting remaining', chunks.length - 1);
      return { chunks: chunks.length, results, aborted: true };
    }
    if (result && result.error && i > 0) {
      console.warn('[wa] chunk', i, 'failed (chunks 0..' + (i - 1) + ' already sent)', result.error);
    }
    if (i < chunks.length - 1) {
      await sleep(chunkPauseMs(chunks[i + 1]));
    }
  }
  return { chunks: chunks.length, results };
}

/* Mark the inbound message as read — purely a UX nicety so the
   visitor sees the blue ticks while we compute the reply. */
async function markRead(messageId){
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken || !messageId) return;
  try {
    await fetch(`https://graph.facebook.com/${WA_GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      })
    });
  } catch (_) { /* not critical */ }
}

/* ============================================================
   PROCESS A SINGLE INCOMING MESSAGE
   Pulls text out, drives Atlas, captures any LeadSense block,
   sends the visitor-facing reply.
   ============================================================ */
async function handleMessage(message){
  if (!message || !message.from) return;
  const from = message.from;            // e.g. "27821234567"

  /* Resolve the user turn:
       - text       → plain user text
       - audio (VN) → download bytes, pass to Gemini as inline_data
       - anything else (image / doc / sticker / etc.) → polite decline
     We always log what we saw so it's visible in Vercel even if
     a turn ends without reaching Gemini. */
  let userText = '';
  let mediaParts = null;

  if (message.type === 'text') {
    userText = (message.text && message.text.body) || '';
    if (!userText) return;
  } else if (message.type === 'audio' && message.audio && message.audio.id) {
    console.log('[wa] audio inbound', { from, mediaId: message.audio.id, mimeHint: message.audio.mime_type });
    const media = await fetchWhatsAppMediaBase64(message.audio.id);
    if (!media) {
      await sendWhatsAppText(from,
        "I had trouble loading that voice note — could you resend it, or type the message instead?");
      return;
    }
    /* Placeholder text stored in history so future turns see that a
       voice note happened; the actual audio bytes are only attached
       to THIS turn via mediaParts (we don't re-upload past audio). */
    userText = '[voice note]';
    mediaParts = [{ inline_data: { mime_type: media.mimeType, data: media.base64 } }];
  } else {
    await sendWhatsAppText(from,
      "I can read text and listen to voice notes here. For images, documents or other formats, just describe what you'd like in a message — or reach the team at info@himark.co.za.");
    return;
  }

  console.log('[wa] handleMessage start', { from, type: message.type, preview: userText.slice(0, 80) });

  markRead(message.id).catch(() => {});

  appendHistory(from, 'user', userText);
  const history = getHistory(from);

  const raw = await askAtlas(history, mediaParts);
  console.log('[wa] askAtlas done', { rawLen: raw ? raw.length : 0, rawPreview: raw && raw.slice(0, 120) });
  if (!raw) {
    const fb = await sendWhatsAppText(from,
      "Atlas is having a brief connectivity issue — please try again in a moment, or reach us at info@himark.co.za.");
    console.log('[wa] fallback send result', fb);
    return;
  }

  /* Extract lead/session blocks for scoring + downstream CRM push */
  const lead    = extractLead(raw);
  const session = extractSession(raw);

  /* Score the lead and adapt the closing line if bucket ≠ Standard.
     Same mechanism as api/chat.js — see that file for the rationale. */
  let scoring = null;
  if (lead) {
    try { scoring = scoreLead(lead, 'atlas-whatsapp'); }
    catch (e) { console.error('[wa] scoreLead threw (lead)', e && e.message); }
  } else if (session) {
    try { scoring = scoreLead({ ...session, tier: 'Session' }, 'atlas-whatsapp'); }
    catch (e) { console.error('[wa] scoreLead threw (session)', e && e.message); }
  }

  let visible = stripBlocks(raw) || "I'm not able to respond to that just now. Please reach us at info@himark.co.za.";
  if (scoring && scoring.bucket !== BUCKET_STANDARD) {
    const adapted = BUCKET_CLOSING_LINES[scoring.bucket];
    if (adapted) {
      visible = visible.replace(DEFAULT_SUBSTITUTION_TARGET, adapted);
    }
    console.log('[wa] lead scored', { bucket: scoring.bucket, score: scoring.score });
  }

  /* HubSpot push (fire-and-forget) — unchanged in Phase A */
  if (lead)    pushToHubSpot(lead,    'lead',    from).catch(e => console.error('[wa] hubspot lead', e && e.message));
  if (session) pushToHubSpot(session, 'session', from).catch(e => console.error('[wa] hubspot session', e && e.message));
  appendHistory(from, 'assistant', visible);
  const sendResult = await sendWhatsAppTextChunks(from, visible);
  console.log('[wa] reply send result', { chunks: sendResult.chunks, aborted: sendResult.aborted || false }, 'replyPreview:', visible.slice(0, 100));
}

/* ============================================================
   HANDLER
   ============================================================ */
module.exports = async (req, res) => {
  /* ─── WEBHOOK VERIFICATION (GET) ─────────────────────────
     Meta sends GET ?hub.mode=subscribe&hub.verify_token=<ours>
     &hub.challenge=<random>. If the token matches, we echo
     back the challenge verbatim and Meta marks the webhook
     as verified. */
  if (req.method === 'GET') {
    const mode      = (req.query && req.query['hub.mode'])         || '';
    const token     = (req.query && req.query['hub.verify_token']) || '';
    const challenge = (req.query && req.query['hub.challenge'])    || '';
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    /* Diagnostic GET — visit /api/whatsapp in a browser (without
       the verify params) to confirm env is wired up. Does NOT
       leak secrets. */
    if (!mode && !token) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      return res.end(JSON.stringify({
        ok: true,
        function: 'api/whatsapp',
        verifyTokenSet:     !!verifyToken,
        accessTokenSet:     !!process.env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberIdSet:   !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        geminiKeySet:       !!process.env.GEMINI_API_KEY,
        hubspotConfigured:  !!process.env.HUBSPOT_ACCESS_TOKEN,
        graphVersion:       WA_GRAPH_VERSION
      }));
    }

    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      res.statusCode = 200;
      return res.end(String(challenge || ''));
    }
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  /* ─── INCOMING MESSAGES (POST) ─────────────────────────── */
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    if (!body || typeof body !== 'object') body = {};

    /* NOTE: We do NOT ACK Meta early any more.
       On Vercel serverless, calling res.end() terminates the function —
       any awaited work after that (Gemini call, Graph send) gets killed
       mid-flight before fetches can leave the box. So we process the
       message synchronously, send the reply via Graph, THEN 200 Meta.
       Atlas typically completes a turn in 3–5s; Meta's webhook timeout
       is 20s, so we have comfortable headroom. */
    try {
      const entry   = body.entry && body.entry[0];
      const change  = entry && entry.changes && entry.changes[0];
      const value   = change && change.value;
      const messages = (value && value.messages) || [];
      const statuses = (value && value.statuses) || [];
      console.log('[wa] POST received', {
        hasEntry: !!entry,
        field: change && change.field,
        messagesCount: messages.length,
        statusesCount: statuses.length,
        firstMessageType: messages[0] && messages[0].type,
        firstMessageFrom: messages[0] && messages[0].from,
        firstMessagePreview: messages[0] && messages[0].text && messages[0].text.body && messages[0].text.body.slice(0, 80)
      });
      for (const m of messages) {
        /* Await each one sequentially so HubSpot writes and reply
           ordering stay clean within a single visitor's burst. */
        await handleMessage(m);
      }
    } catch (err) {
      console.error('[wa] handler exception',
        err && err.message,
        'cause:', err && err.cause && (err.cause.message || err.cause.code || String(err.cause)),
        'stack:', err && err.stack && err.stack.split('\n').slice(0, 4).join(' | '));
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.statusCode = 405;
  res.setHeader('Allow', 'GET, POST');
  res.end('Method not allowed');
};
