/* HIMARK · LeadSense Application PDF generator
   ------------------------------------------------------------------
   Pure function that takes the lead record Atlas emitted, the
   LeadSense scoring result, and the source channel, and returns a
   PDF as a Uint8Array ready to attach to an email.

   No external services. No file I/O. Just buffer-out so the caller
   (lib/mail-application.js) can base64 it and POST to Resend.

   Design philosophy:
     - Single A4 page. Generation is fast; mail size is bounded.
     - Built-in Helvetica family only (no font embedding, no font
       file shipping). Keeps the function small and cold-starts
       quick.
     - Print-quality layout: HIMARK wordmark + rule, label/value
       row pattern, named sections, footer with brand line.
     - All text wrapped defensively — very long company names, role
       titles, briefs, etc. won't overflow off the page.

   Caller signature:
     const bytes = await buildApplicationPdf(record, scoring, source);
   where:
     record  — the lead JSON Atlas emitted (name, email, phone,
               company, role, brief, tier, timeline, budget)
     scoring — { score, bucket, breakdown } from api/scoring.js,
               or null if scoring failed
     source  — 'atlas-chat' or 'atlas-whatsapp'
*/

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/* HIMARK palette — colours mirror the website / dossier so the
   PDF reads as a piece of HIMARK collateral, not generic output. */
const C_OCEAN     = rgb(95/255,  129/255, 144/255);  // primary accent
const C_OCEAN_LT  = rgb(138/255, 173/255, 184/255);  // soft rules
const C_INK       = rgb(14/255,  24/255,  34/255);   // body text
const C_INK_SOFT  = rgb(82/255,  92/255,  102/255);  // meta text
const C_RULE      = rgb(0.86, 0.86, 0.86);           // hairlines

/* A4 portrait — 595.28 × 841.89 pt at 72 DPI. */
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 56;
const LABEL_COL_X = MARGIN;        // label column starts at left margin
const VALUE_COL_X = MARGIN + 96;   // value column offset for the row layout
const VALUE_MAX_W = A4_W - VALUE_COL_X - MARGIN;

async function buildApplicationPdf(record, scoring, source){
  if (!record || typeof record !== 'object') {
    throw new Error('buildApplicationPdf: record is required');
  }
  const pdf = await PDFDocument.create();
  pdf.setTitle('HIMARK · LeadSense Application');
  pdf.setAuthor('HIMARK · Atlas');
  pdf.setSubject('Application summary');
  pdf.setProducer('HIMARK Atlas');
  pdf.setCreator('HIMARK Atlas');
  pdf.setCreationDate(new Date());

  const page = pdf.addPage([A4_W, A4_H]);
  const helv     = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB    = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helvI    = await pdf.embedFont(StandardFonts.HelveticaOblique);

  /* Cursor state — y decreases as we draw down the page. */
  let y = A4_H - MARGIN;

  /* ----- Drawing primitives ----- */
  function text(str, opts){
    const o = opts || {};
    const font = o.bold ? helvB : (o.italic ? helvI : helv);
    page.drawText(String(str || ''), {
      x: (o.x !== undefined) ? o.x : MARGIN,
      y: (o.y !== undefined) ? o.y : y,
      size: o.size || 10,
      font,
      color: o.color || C_INK
    });
  }

  function rule(thickness, color, padTop){
    if (padTop) y -= padTop;
    page.drawLine({
      start: { x: MARGIN, y },
      end:   { x: A4_W - MARGIN, y },
      thickness: thickness || 0.5,
      color: color || C_RULE
    });
  }

  /* Word-wrap a string so it fits within `maxWidth` at `size` pt.
     Returns an array of lines. Splits on whitespace only — long
     unbroken tokens (URLs etc.) won't be broken mid-character. */
  function wrapText(str, font, size, maxWidth){
    const words = String(str || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words){
      const candidate = line ? line + ' ' + word : word;
      const w = font.widthOfTextAtSize(candidate, size);
      if (w > maxWidth && line){
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /* Multi-line paragraph drawer. Advances `y` for each line. */
  function paragraph(str, opts){
    const o = opts || {};
    const font = o.italic ? helvI : helv;
    const size = o.size || 10;
    const lineH = o.lineHeight || 14;
    const xStart = (o.x !== undefined) ? o.x : MARGIN;
    const maxW = o.maxWidth || (A4_W - 2 * MARGIN);
    const color = o.color || C_INK;
    const lines = wrapText(str, font, size, maxW);
    for (const ln of lines){
      page.drawText(ln, { x: xStart, y, size, font, color });
      y -= lineH;
    }
    return lines.length;
  }

  /* Two-column row: small uppercase ocean label on the left, value
     on the right (word-wrapped). Advances y by 18 + extra per wrap. */
  function row(label, value){
    const labelY = y;
    page.drawText(String(label || '').toUpperCase(), {
      x: LABEL_COL_X,
      y: labelY,
      size: 7.5,
      font: helvB,
      color: C_OCEAN
    });
    const raw = (value === null || value === undefined || value === '') ? '—' : String(value);
    const lines = wrapText(raw, helv, 10.5, VALUE_MAX_W);
    if (!lines.length){
      page.drawText('—', { x: VALUE_COL_X, y: labelY, size: 10.5, font: helv, color: C_INK });
      y -= 20;
      return;
    }
    for (let i = 0; i < lines.length; i++){
      page.drawText(lines[i], {
        x: VALUE_COL_X,
        y: labelY - (i * 14),
        size: 10.5,
        font: helv,
        color: C_INK
      });
    }
    y -= Math.max(20, 6 + lines.length * 14);
  }

  /* Section heading: uppercase ocean label + ocean-lt hairline. */
  function sectionHeader(title){
    y -= 8;
    text(String(title || '').toUpperCase(), {
      x: MARGIN, y, size: 9, bold: true, color: C_OCEAN
    });
    y -= 6;
    rule(0.7, C_OCEAN_LT);
    y -= 14;
  }

  /* ----- Header ----- */
  text('HIMARK', { size: 24, bold: true, color: C_OCEAN });
  y -= 22;
  text('Strategic Growth Consultancy · Randburg, South Africa', {
    size: 8.5, italic: true, color: C_INK_SOFT
  });
  y -= 18;
  rule(1.4, C_INK);
  y -= 22;
  text('LEADSENSE APPLICATION', { size: 13, bold: true, color: C_INK });
  y -= 26;

  /* ----- Submission meta ----- */
  row('Submitted', formatTimestampSAST(new Date()));
  row('Source',    humanSource(source));

  /* ----- Client ----- */
  sectionHeader('Client');
  row('Name',  record.name);
  row('Email', record.email);
  row('Phone', record.phone || 'Not provided');

  /* ----- Company ----- */
  sectionHeader('Company');
  row('Company', record.company);
  row('Role',    record.role);

  /* ----- Application ----- */
  sectionHeader('Application');
  row('Tier',     titleCase(record.tier));
  row('Timeline', record.timeline);
  row('Budget',   record.budget);

  /* ----- Brief ----- */
  sectionHeader('Brief');
  const briefText = (record.brief && String(record.brief).trim()) ? record.brief : '';
  if (briefText){
    paragraph(briefText, { x: MARGIN, maxWidth: A4_W - 2 * MARGIN, size: 10.5, lineHeight: 15 });
  } else {
    text('Not provided.', { x: MARGIN, size: 10, italic: true, color: C_INK_SOFT });
    y -= 18;
  }

  /* ----- LeadSense Score ----- */
  if (scoring && typeof scoring === 'object'){
    sectionHeader('LeadSense Score');
    row('Bucket',   String(scoring.bucket || '').toUpperCase());
    row('Score',    (scoring.score !== undefined ? scoring.score : '—') + ' / 100');
    row('Response', responseSla(scoring.bucket));
  }

  /* ----- Footer ----- */
  const footerY = 36;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 14 },
    end:   { x: A4_W - MARGIN, y: footerY + 14 },
    thickness: 0.5,
    color: C_RULE
  });
  page.drawText('himark.co.za  ·  info@himark.co.za  ·  Captured by Atlas', {
    x: MARGIN, y: footerY, size: 8, font: helv, color: C_INK_SOFT
  });
  page.drawText('Confidential', {
    x: A4_W - MARGIN - helvI.widthOfTextAtSize('Confidential', 8),
    y: footerY, size: 8, font: helvI, color: C_INK_SOFT
  });

  return await pdf.save();
}

/* ----- Helpers ----- */
function titleCase(s){
  if (!s) return '';
  const str = String(s).trim().toLowerCase();
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function humanSource(s){
  if (s === 'atlas-chat')     return 'Website chat (Atlas)';
  if (s === 'atlas-whatsapp') return 'WhatsApp (Atlas)';
  return s || 'Atlas';
}

function responseSla(bucket){
  switch (String(bucket || '').toLowerCase()){
    case 'priority': return '24-hour response from a principal';
    case 'standard': return '5-working-day response from a principal';
    case 'watch':    return '7-working-day soft warm-up';
    case 'decline':  return 'Manual triage before reply';
    default:         return 'Standard 5-working-day SLA';
  }
}

/* SAST formatter — YYYY-MM-DD HH:MM SAST. We construct it from
   parts rather than rely on toLocaleString because Vercel's
   serverless containers can have flaky ICU data and inconsistent
   timezone formatting across regions. */
function formatTimestampSAST(date){
  /* SAST is fixed UTC+2 (no DST). Add 2h to UTC. */
  const utc = date.getTime();
  const sast = new Date(utc + 2 * 60 * 60 * 1000);
  const yyyy = sast.getUTCFullYear();
  const mm = String(sast.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(sast.getUTCDate()).padStart(2, '0');
  const hh = String(sast.getUTCHours()).padStart(2, '0');
  const mi = String(sast.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} SAST`;
}

module.exports = { buildApplicationPdf, formatTimestampSAST };
