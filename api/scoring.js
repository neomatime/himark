/* HIMARK · LeadSense scoring engine
   ============================================================
   Pure-function rubric. Given a captured lead and the source it
   came from, returns:

     { score: 0-100 integer, bucket: string, breakdown: object }

   Where bucket is one of:
     BUCKET_PRIORITY  ("Priority")  — score 75-100, 24h SLA
     BUCKET_STANDARD  ("Standard")  — score 40-74,  5 working day SLA (default)
     BUCKET_WATCH     ("Watch")     — score 15-39,  10 working day SLA
     BUCKET_DECLINE   ("Decline")   — score 0-14,   no principal time

   The bucket also drives Atlas's adapted closing line via
   BUCKET_CLOSING_LINES, exported below.

   Newsletter signups short-circuit: source === 'newsletter' always
   returns { score: 10, bucket: BUCKET_WATCH }. They have no qualifying
   data so the rubric would produce a misleading score otherwise.

   Spec: docs/superpowers/specs/2026-05-29-monday-scoring-leadsense-design.md
   Verification: scripts/verify-scoring.js
   ============================================================ */

const BUCKET_PRIORITY = 'Priority';
const BUCKET_STANDARD = 'Standard';
const BUCKET_WATCH    = 'Watch';
const BUCKET_DECLINE  = 'Decline';

const BUCKET_CLOSING_LINES = {
  [BUCKET_PRIORITY]: 'Thank you. A principal will reach out directly within 24 hours.',
  [BUCKET_STANDARD]: 'Thank you. A principal will follow up directly within five working days.',
  [BUCKET_WATCH]:    'Thank you. We will review and come back to you within five to ten working days. In the meantime, our Insights page has the latest from our desk.',
  [BUCKET_DECLINE]:  'Thank you for the detail. Based on fit, we do not think we are the right partners for this brief right now — we focus on mandates above R50,000 monthly for founder-led businesses pursuing premium positioning. If your circumstances shift, our door is open.'
};

const DEFAULT_SUBSTITUTION_TARGET =
  'A principal will follow up directly within five working days.';

/* ── Tier match ────────────────────────────────────────────── */
function scoreTier(tier){
  const t = String(tier || '').trim().toLowerCase();
  if (t === 'private')   return 25;
  if (t === 'growth')    return 20;
  if (t === 'signature') return 12;
  if (t === 'session')   return 8;
  return 0;
}

/* ── Budget alignment ──────────────────────────────────────── */
/* Parse the visitor's budget into a numeric rand value (or null
   if unparseable). Common WhatsApp / chat phrasings:
     "R50,000", "50k", "R150 000", "between 80 and 120K",
     "around 200k", "open", "tbd", "not sure". */
function parseBudgetRand(budget){
  if (!budget) return null;
  const s = String(budget).toLowerCase();
  if (/\b(open|tbd|flexible|not sure|undisclosed)\b/.test(s)) return null;
  const nums = s.match(/\d[\d\s,]*\.?\d*/g);
  if (!nums || !nums.length) return null;
  const ks = /k|thousand/i.test(s) ? 1000 : 1;
  const vals = nums.map(n => parseFloat(n.replace(/[\s,]/g, '')) * ks);
  /* If "between X and Y" pattern, take the midpoint. Otherwise
     take the first number. */
  if (vals.length >= 2 && /between|to|-/.test(s)) {
    return (vals[0] + vals[1]) / 2;
  }
  return vals[0];
}

function scoreBudget(budget, tier){
  const r = parseBudgetRand(budget);
  if (r === null) return 5;   /* undisclosed but plausible */
  const t = String(tier || '').toLowerCase();
  /* Tier floors: Signature R50k, Growth R80k, Private R150k.
     "Within range" means at or above floor for that tier. */
  let floor;
  if (t === 'private')        floor = 150000;
  else if (t === 'growth')    floor = 80000;
  else if (t === 'signature') floor = 50000;
  else                        floor = 50000;
  if (r < 50000)              return -10;
  if (r >= floor)             return 15;
  if (r >= floor * 0.8)       return 10;
  return 5;
}

/* ── Timeline urgency ──────────────────────────────────────── */
function scoreTimeline(timeline){
  const t = String(timeline || '').toLowerCase();
  if (/this quarter|this q|q[1-4]|next 30|next month|asap|urgent/.test(t)) return 15;
  if (/next quarter|next q|next 60|next 90|3 month/.test(t))                return 8;
  return 0;
}

/* ── Role seniority ────────────────────────────────────────── */
function scoreRole(role){
  const r = String(role || '').toLowerCase();
  if (/founder|ceo|co[- ]?founder|owner|managing director/.test(r))  return 15;
  if (/cmo|coo|cfo|cto|cpo|cro|chief/.test(r))                       return 12;
  if (/director|vp|vice president|head of/.test(r))                  return 10;
  if (/manager/.test(r))                                             return 5;
  return 0;
}

/* ── Brief specificity ─────────────────────────────────────── */
const COMMERCIAL_KEYWORDS = /\b(revenue|growth|pipeline|arr|mrr|churn|retention|positioning|demand|conversion|scale|expansion|m&a|capital|raise|exit|leadership|restructure)\b/i;
function scoreBrief(brief){
  const b = String(brief || '').trim();
  if (b.length > 150 && COMMERCIAL_KEYWORDS.test(b)) return 10;
  if (b.length >= 50)                                return 5;
  return 0;
}

/* ── Source quality bonus ──────────────────────────────────── */
function scoreSource(source){
  switch (source) {
    case 'apply':           return 10;
    case 'atlas-whatsapp':  return 8;
    case 'atlas-chat':      return 8;
    case 'session':         return 5;
    case 'newsletter':      return 0;
    default:                return 0;
  }
}

/* ── Negative signals ──────────────────────────────────────── */
function scoreNegatives(record){
  const brief = String(record && record.brief || '').toLowerCase();
  const email = String(record && record.email || '').toLowerCase();
  const tier  = String(record && record.tier  || '').toLowerCase();
  let neg = 0;
  if (/send (me )?(a )?proposal|\brfp\b|quotation|please quote/.test(brief)) neg -= 15;
  if (/we need help|interested|can you help|tell me more/.test(brief) && brief.length < 80) neg -= 10;
  if (/discount|cheaper|reduce(d)? (fee|price|rate)|negotiate/.test(brief)) neg -= 10;
  if (tier === 'private' && /@(gmail|yahoo|hotmail|outlook|live|icloud)\./.test(email)) neg -= 5;
  return neg;
}

/* ── Bucket assignment ─────────────────────────────────────── */
function bucketFromScore(score){
  if (score >= 75) return BUCKET_PRIORITY;
  if (score >= 40) return BUCKET_STANDARD;
  if (score >= 15) return BUCKET_WATCH;
  return BUCKET_DECLINE;
}

/* ── Public entry point ────────────────────────────────────── */
function scoreLead(record, source){
  /* Newsletter short-circuit. No qualifying data, no scoring. */
  if (source === 'newsletter') {
    return {
      score: 10,
      bucket: BUCKET_WATCH,
      breakdown: { newsletter: true, source: source }
    };
  }
  const r = record || {};
  const tier      = scoreTier(r.tier);
  const budget    = scoreBudget(r.budget, r.tier);
  const timeline  = scoreTimeline(r.timeline);
  const role      = scoreRole(r.role);
  const brief     = scoreBrief(r.brief);
  const src       = scoreSource(source);
  const negatives = scoreNegatives(r);
  const raw = tier + budget + timeline + role + brief + src + negatives;
  const score = Math.max(0, Math.min(100, raw));
  return {
    score: score,
    bucket: bucketFromScore(score),
    breakdown: {
      tier: tier,
      budget: budget,
      timeline: timeline,
      role: role,
      brief: brief,
      source: src,
      negatives: negatives,
      raw: raw,
      clamped: score
    }
  };
}

module.exports = {
  scoreLead: scoreLead,
  BUCKET_CLOSING_LINES: BUCKET_CLOSING_LINES,
  DEFAULT_SUBSTITUTION_TARGET: DEFAULT_SUBSTITUTION_TARGET,
  BUCKET_PRIORITY: BUCKET_PRIORITY,
  BUCKET_STANDARD: BUCKET_STANDARD,
  BUCKET_WATCH: BUCKET_WATCH,
  BUCKET_DECLINE: BUCKET_DECLINE
};
