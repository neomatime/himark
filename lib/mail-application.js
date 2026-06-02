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

module.exports = { emailApplication };
