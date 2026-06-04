/* HIMARK · Application email dispatcher
   ------------------------------------------------------------------
   Generates the LeadSense application PDF and sends it via Resend
   to apply@himark.co.za with an HTML body summary so the team can
   triage from the inbox preview without opening the attachment.

   Triggered fire-and-forget from api/chat.js and api/whatsapp.js
   the moment Atlas emits a <lead> block. Failure here never blocks
   the visitor-facing reply.

   Env vars (set in Vercel project settings):
     RESEND_API_KEY      (REQUIRED)  Bearer token from
                                     resend.com → API Keys.
                                     Without it, this module logs
                                     and returns — no email sent,
                                     no error surfaced to caller.
     MAIL_FROM           (optional)  Defaults to
                                     'Atlas <atlas@himark.co.za>'.
                                     Must be on a domain you have
                                     verified in Resend.
     MAIL_TO_APPLICATIONS (optional) Defaults to 'apply@himark.co.za'.
*/

const { buildApplicationPdf, formatTimestampSAST } = require('./pdf-application');

const DEFAULT_FROM = 'Atlas <atlas@himark.co.za>';
const DEFAULT_TO   = 'apply@himark.co.za';

async function emailApplication(record, scoring, source){
  const key = process.env.RESEND_API_KEY;
  if (!key){
    console.log('[mail] RESEND_API_KEY not set — application email skipped for', record && record.email);
    return { skipped: 'no-key' };
  }
  if (!record || typeof record !== 'object' || !record.email){
    console.warn('[mail] emailApplication called with missing record/email');
    return { skipped: 'no-record' };
  }

  const from = process.env.MAIL_FROM || DEFAULT_FROM;
  const to   = process.env.MAIL_TO_APPLICATIONS || DEFAULT_TO;

  /* Build the PDF first. If it fails we still send a text-only
     email so the team gets the lead — better degraded than silent. */
  let pdfBase64 = null;
  let pdfFilename = pdfFilenameFor(record);
  try {
    const bytes = await buildApplicationPdf(record, scoring, source);
    pdfBase64 = Buffer.from(bytes).toString('base64');
  } catch (e){
    console.error('[mail] pdf generation failed', e && e.message);
  }

  const subject = subjectFor(record, scoring);
  const html    = htmlBody(record, scoring, source);
  const textAlt = textBody(record, scoring, source);

  const payload = {
    from,
    to: [to],
    subject,
    html,
    text: textAlt
  };
  if (pdfBase64){
    payload.attachments = [{ filename: pdfFilename, content: pdfBase64 }];
  }
  /* reply_to → applicant's email so a team member can hit Reply
     and respond directly without lifting the address out of the
     body. Resend's API uses reply_to (snake) per their docs. */
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)){
    payload.reply_to = record.email;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (res.ok){
      const data = await res.json().catch(() => null);
      console.log('[mail] sent application email', {
        id: data && data.id,
        to,
        applicant: record.email,
        pdfAttached: !!pdfBase64
      });
      return { sent: true, id: data && data.id };
    }
    const errText = await res.text().catch(() => '');
    console.error('[mail] resend error', res.status, errText.slice(0, 400));
    return { error: 'resend-failed', status: res.status };
  } catch (e){
    console.error('[mail] resend threw', e && e.message);
    return { error: 'exception' };
  }
}

/* ---------- Subject ---------- */
function subjectFor(record, scoring){
  const bucket = (scoring && scoring.bucket) ? String(scoring.bucket) : 'Standard';
  const who = record.name || record.email || 'Applicant';
  const where = record.company || '';
  const tag = where ? `${who} · ${where}` : who;
  return `LeadSense · ${tag} · ${capWord(bucket)}`;
}

/* ---------- Filename ---------- */
function pdfFilenameFor(record){
  const slug = String(record.name || record.email || 'applicant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'applicant';
  const ymd = new Date().toISOString().slice(0, 10);
  return `himark-application-${slug}-${ymd}.pdf`;
}

/* ---------- HTML body ---------- */
function htmlBody(record, scoring, source){
  const bucket = (scoring && scoring.bucket) ? String(scoring.bucket).toUpperCase() : 'STANDARD';
  const score  = (scoring && scoring.score !== undefined) ? scoring.score : '—';
  const rows = [
    ['Name',     record.name],
    ['Email',    record.email],
    ['Phone',    record.phone || 'Not provided'],
    ['Company',  record.company || '—'],
    ['Role',     record.role || '—'],
    ['Tier',     record.tier ? capWord(record.tier) : '—'],
    ['Timeline', record.timeline || '—'],
    ['Budget',   record.budget || '—'],
    ['Score',    `${score} / 100`],
    ['Bucket',   bucket],
    ['Source',   humanSource(source)],
    ['Submitted', formatTimestampSAST(new Date())]
  ];
  const rowsHtml = rows.map(([k, v]) =>
    `<tr>
       <td style="padding:6px 14px 6px 0; color:#5F8190; font-size:11px; letter-spacing:.08em; text-transform:uppercase; vertical-align:top; white-space:nowrap; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(k)}</td>
       <td style="padding:6px 0; color:#0E1822; font-size:14px; vertical-align:top; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(v)}</td>
     </tr>`).join('');
  const briefHtml = (record.brief && String(record.brief).trim())
    ? escapeHtml(record.brief)
    : '<em style="color:#888;">Not provided.</em>';
  const introWho = escapeHtml(record.name || 'A new applicant');
  const introCo  = record.company ? ' at ' + escapeHtml(record.company) : '';

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>LeadSense application</title></head>
<body style="margin:0; padding:32px 16px; background:#F7F7F5; font-family:Helvetica,Arial,sans-serif; color:#0E1822;">
  <table role="presentation" style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #E2E0DC; border-radius:6px;" cellpadding="0" cellspacing="0">
    <tr><td style="padding:36px 36px 8px;">
      <div style="font-size:24px; font-weight:bold; color:#5F8190; letter-spacing:.02em;">HIMARK</div>
      <div style="font-size:11px; color:#5F8190; letter-spacing:.14em; text-transform:uppercase; margin-top:6px;">LeadSense application</div>
    </td></tr>
    <tr><td style="padding:0 36px;">
      <hr style="border:none; border-top:1px solid #E2E0DC; margin:20px 0;" />
    </td></tr>
    <tr><td style="padding:0 36px;">
      <p style="font-size:14px; line-height:1.6; color:#0E1822; margin:0 0 20px;">
        <strong>${introWho}</strong>${introCo} just completed an Atlas-led application via ${escapeHtml(humanSource(source))}.
      </p>
      <table role="presentation" style="width:100%; border-collapse:collapse;" cellpadding="0" cellspacing="0">
        ${rowsHtml}
      </table>
      <div style="margin-top:24px;">
        <div style="font-size:11px; color:#5F8190; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px; font-family:Helvetica,Arial,sans-serif;">Brief</div>
        <div style="font-size:14px; line-height:1.6; color:#0E1822; font-family:Helvetica,Arial,sans-serif;">${briefHtml}</div>
      </div>
    </td></tr>
    <tr><td style="padding:28px 36px 32px;">
      <hr style="border:none; border-top:1px solid #E2E0DC; margin:0 0 16px;" />
      <p style="font-size:12px; line-height:1.6; color:#5F8190; margin:0; font-family:Helvetica,Arial,sans-serif;">
        Full application summary attached as PDF. Replying to this email goes directly to the applicant.
      </p>
    </td></tr>
  </table>
  <p style="text-align:center; font-size:11px; color:#888; margin:18px 0 0; font-family:Helvetica,Arial,sans-serif;">
    himark.co.za &middot; info@himark.co.za
  </p>
</body>
</html>`;
}

/* Plain-text alternative — older mail clients + accessibility. */
function textBody(record, scoring, source){
  const bucket = (scoring && scoring.bucket) ? String(scoring.bucket).toUpperCase() : 'STANDARD';
  const score  = (scoring && scoring.score !== undefined) ? scoring.score : '—';
  const lines = [
    'HIMARK · LEADSENSE APPLICATION',
    '',
    `${record.name || 'A new applicant'}${record.company ? ' at ' + record.company : ''} just completed an Atlas-led application via ${humanSource(source)}.`,
    '',
    `Name:      ${record.name || '—'}`,
    `Email:     ${record.email || '—'}`,
    `Phone:     ${record.phone || 'Not provided'}`,
    `Company:   ${record.company || '—'}`,
    `Role:      ${record.role || '—'}`,
    `Tier:      ${record.tier ? capWord(record.tier) : '—'}`,
    `Timeline:  ${record.timeline || '—'}`,
    `Budget:    ${record.budget || '—'}`,
    `Score:     ${score} / 100`,
    `Bucket:    ${bucket}`,
    `Source:    ${humanSource(source)}`,
    `Submitted: ${formatTimestampSAST(new Date())}`,
    '',
    'Brief:',
    (record.brief && String(record.brief).trim()) ? record.brief : 'Not provided.',
    '',
    '— Full summary attached as PDF.'
  ];
  return lines.join('\n');
}

/* ---------- Small helpers ---------- */
function capWord(s){
  if (!s) return '';
  const str = String(s).trim().toLowerCase();
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function humanSource(s){
  if (s === 'atlas-chat')     return 'Website chat (Atlas)';
  if (s === 'atlas-whatsapp') return 'WhatsApp (Atlas)';
  return s || 'Atlas';
}

function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ====================================================================
   MANUAL-REVIEW FALLBACK
   ====================================================================
   When Atlas closes a conversation (visible closing line) but drops
   the hidden <lead> JSON block (Gemini Flash Lite occasionally strips
   structural emissions), the normal pipeline can't capture the
   application — HubSpot push and PDF email both require a parsed
   record. Without recovery, the application is silently lost.

   This function sends a "MANUAL REVIEW REQUIRED" email to
   apply@himark.co.za with the full conversation transcript. The team
   reads the transcript, manually enters the contact into HubSpot,
   and the visitor's data is never lost.

   Triggered from api/chat.js and api/whatsapp.js when:
     - Atlas's reply contains the closing phrase (or any of the
       bucket-adapted variants)
     - AND extractLead returned null

   The visitor sees the closing line as normal — they have no idea
   anything went wrong on the server side. From their perspective the
   application is in. */
async function emailManualReview(conversationHistory, source){
  const key = process.env.RESEND_API_KEY;
  if (!key){
    console.log('[mail] RESEND_API_KEY not set — manual review email skipped');
    return { skipped: 'no-key' };
  }
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0){
    console.warn('[mail] emailManualReview called with empty history');
    return { skipped: 'no-history' };
  }

  const from = process.env.MAIL_FROM || DEFAULT_FROM;
  const to   = process.env.MAIL_TO_APPLICATIONS || DEFAULT_TO;

  /* Try to extract the visitor's email + name from the conversation
     so the subject line and reply-to are useful. Best-effort: scan
     the user-role turns for an email pattern; the first match wins. */
  let visitorEmail = '';
  let visitorName  = '';
  const emailRe = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  for (const turn of conversationHistory){
    if (turn && turn.role === 'user' && typeof turn.content === 'string'){
      const m = turn.content.match(emailRe);
      if (m && !visitorEmail){
        visitorEmail = m[0].replace(/[.,;:!?)]+$/, '');
      }
    }
  }
  /* Name heuristic: the last visitor message before Atlas's closing
     often contains the name + email at Step 8. Grab the first 60 chars
     of the LAST user turn as a name proxy. */
  for (let i = conversationHistory.length - 1; i >= 0; i--){
    const turn = conversationHistory[i];
    if (turn && turn.role === 'user' && typeof turn.content === 'string'){
      visitorName = String(turn.content).split(/[\n,]/)[0].slice(0, 60).trim();
      break;
    }
  }

  const subject = 'LeadSense · MANUAL REVIEW REQUIRED' +
    (visitorEmail ? ' · ' + visitorEmail : '') +
    ' · ' + humanSource(source);

  const transcript = conversationHistory.map(t => {
    const speaker = (t && t.role === 'assistant') ? 'ATLAS' : 'VISITOR';
    const content = (t && t.content) || '';
    return speaker + ':\n' + content;
  }).join('\n\n---\n\n');

  const html = manualReviewHtml(transcript, visitorEmail, visitorName, source);
  const text = manualReviewText(transcript, visitorEmail, visitorName, source);

  const payload = {
    from,
    to: [to],
    subject,
    html,
    text
  };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorEmail)){
    payload.reply_to = visitorEmail;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (res.ok){
      const data = await res.json().catch(() => null);
      console.log('[mail] sent MANUAL REVIEW email', {
        id: data && data.id,
        to,
        visitorEmail
      });
      return { sent: true, id: data && data.id, manualReview: true };
    }
    const errText = await res.text().catch(() => '');
    console.error('[mail] manual review resend error', res.status, errText.slice(0, 400));
    return { error: 'resend-failed', status: res.status };
  } catch (e) {
    console.error('[mail] manual review resend threw', e && e.message);
    return { error: 'exception' };
  }
}

function manualReviewHtml(transcript, visitorEmail, visitorName, source){
  const escapedTranscript = escapeHtml(transcript).replace(/\n/g, '<br>');
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>LeadSense · Manual review required</title></head>
<body style="margin:0; padding:32px 16px; background:#F7F7F5; font-family:Helvetica,Arial,sans-serif; color:#0E1822;">
  <table role="presentation" style="max-width:660px; margin:0 auto; background:#ffffff; border:1px solid #E2E0DC; border-radius:6px;" cellpadding="0" cellspacing="0">
    <tr><td style="padding:36px 36px 8px;">
      <div style="font-size:24px; font-weight:bold; color:#5F8190; letter-spacing:.02em;">HIMARK</div>
      <div style="font-size:11px; color:#C84A4A; letter-spacing:.14em; text-transform:uppercase; margin-top:6px;">LeadSense · Manual review required</div>
    </td></tr>
    <tr><td style="padding:0 36px;">
      <hr style="border:none; border-top:1px solid #E2E0DC; margin:20px 0;" />
    </td></tr>
    <tr><td style="padding:0 36px;">
      <p style="font-size:14px; line-height:1.6; color:#0E1822; margin:0 0 16px;">
        Atlas closed an application but did not emit the structured lead block. The visitor saw the normal closing line ("a principal will follow up...") and from their perspective the application is submitted. <strong>Manual review is required to capture this lead in HubSpot.</strong>
      </p>
      <table role="presentation" style="width:100%; border-collapse:collapse;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 14px 6px 0; color:#5F8190; font-size:11px; letter-spacing:.08em; text-transform:uppercase; vertical-align:top; white-space:nowrap; font-family:Helvetica,Arial,sans-serif;">Detected email</td>
          <td style="padding:6px 0; color:#0E1822; font-size:14px; vertical-align:top; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(visitorEmail) || '<em style="color:#888;">Not found in transcript</em>'}</td>
        </tr>
        <tr>
          <td style="padding:6px 14px 6px 0; color:#5F8190; font-size:11px; letter-spacing:.08em; text-transform:uppercase; vertical-align:top; white-space:nowrap; font-family:Helvetica,Arial,sans-serif;">Last visitor turn</td>
          <td style="padding:6px 0; color:#0E1822; font-size:14px; vertical-align:top; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(visitorName) || '<em style="color:#888;">—</em>'}</td>
        </tr>
        <tr>
          <td style="padding:6px 14px 6px 0; color:#5F8190; font-size:11px; letter-spacing:.08em; text-transform:uppercase; vertical-align:top; white-space:nowrap; font-family:Helvetica,Arial,sans-serif;">Source</td>
          <td style="padding:6px 0; color:#0E1822; font-size:14px; vertical-align:top; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(humanSource(source))}</td>
        </tr>
        <tr>
          <td style="padding:6px 14px 6px 0; color:#5F8190; font-size:11px; letter-spacing:.08em; text-transform:uppercase; vertical-align:top; white-space:nowrap; font-family:Helvetica,Arial,sans-serif;">Captured</td>
          <td style="padding:6px 0; color:#0E1822; font-size:14px; vertical-align:top; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(formatTimestampSAST(new Date()))}</td>
        </tr>
      </table>
      <div style="margin-top:28px;">
        <div style="font-size:11px; color:#5F8190; letter-spacing:.08em; text-transform:uppercase; margin-bottom:10px; font-family:Helvetica,Arial,sans-serif;">Conversation transcript</div>
        <div style="font-size:13px; line-height:1.6; color:#0E1822; font-family:'Courier New', Courier, monospace; background:#F7F7F5; border:1px solid #E2E0DC; padding:16px; border-radius:4px; white-space:pre-wrap; word-break:break-word;">${escapedTranscript}</div>
      </div>
    </td></tr>
    <tr><td style="padding:28px 36px 32px;">
      <hr style="border:none; border-top:1px solid #E2E0DC; margin:0 0 16px;" />
      <p style="font-size:12px; line-height:1.6; color:#5F8190; margin:0; font-family:Helvetica,Arial,sans-serif;">
        Manually enter this contact in HubSpot. If the detected email is correct, replying to this email goes directly to the applicant.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function manualReviewText(transcript, visitorEmail, visitorName, source){
  return [
    'HIMARK · LEADSENSE · MANUAL REVIEW REQUIRED',
    '',
    'Atlas closed an application but did not emit the structured lead block. The visitor saw the normal closing line and from their perspective the application is submitted. Manual review is required.',
    '',
    'Detected email: ' + (visitorEmail || '(not found)'),
    'Last visitor turn: ' + (visitorName || '—'),
    'Source: ' + humanSource(source),
    'Captured: ' + formatTimestampSAST(new Date()),
    '',
    '=== CONVERSATION TRANSCRIPT ===',
    '',
    transcript,
    '',
    '=== END ==='
  ].join('\n');
}

module.exports = { emailApplication, emailManualReview };
