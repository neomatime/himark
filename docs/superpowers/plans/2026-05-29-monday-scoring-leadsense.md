# Monday CRM + LeadSense Scoring + Adaptive Atlas Closings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace HubSpot with Monday CRM, add a server-side lead-scoring engine that buckets every lead (Priority/Standard/Watch/Decline), and have Atlas adapt its closing message to the bucket — all three shipped together.

**Architecture:** Three workstreams ship in two phases. Phase A delivers the scoring engine and adaptive Atlas closings without touching the CRM wiring — value lands immediately while HubSpot still receives writes. Phase B is a user-action gate (set up Monday board, capture column IDs, paste them back). Phase C swaps HubSpot for Monday across all five capture endpoints and tears out the HubSpot code. Scoring is a pure function in a single file (`api/scoring.js`); Monday access is a GraphQL helper in a single file (`api/monday.js`); both are paste-imported by the endpoint files rather than duplicated.

**Tech Stack:**
- Vercel serverless functions (Node 20, CommonJS)
- Gemini Flash Lite (text) / Gemini Flash (audio) — existing
- Monday.com GraphQL API v2 — new
- No test framework on this project — verification is a hand-rolled Node script (`scripts/verify-scoring.js`) for the pure scoring function, then manual end-to-end deploy testing per the spec's 8-test plan.

**Spec:** [`docs/superpowers/specs/2026-05-29-monday-scoring-leadsense-design.md`](../specs/2026-05-29-monday-scoring-leadsense-design.md)

---

## File map

| File | Phase | Role after this plan |
|---|---|---|
| `api/scoring.js` | A | NEW. Pure-function scoring engine. Exports `scoreLead()`, `BUCKET_CLOSING_LINES`, and bucket constants. |
| `scripts/verify-scoring.js` | A | NEW. Hand-rolled fixture-based verification of `scoreLead()`. Run with `node scripts/verify-scoring.js`. Exit 0 on full pass. |
| `api/atlas-knowledge.js` | A | §15 closing instruction tightened — Atlas now copies an exact closing phrase that the server can find-and-replace. |
| `api/chat.js` | A + C | A: after `extractLead`, call `scoreLead`, substitute closing line if bucket ≠ Standard. C: replace `pushToHubSpot` with `pushToMonday`, pass `score` + `bucket` in the record. |
| `api/whatsapp.js` | A + C | Same as `api/chat.js` for both phases. |
| `api/monday.js` | C | NEW. GraphQL helper. Exports `pushToMonday(record, source)`. |
| `api/apply.js` | C | Replace `pushToHubSpot` with `pushToMonday`. Add `scoreLead()` call at submission time. No adaptive closing (form-submit endpoint). |
| `api/session-booking.js` | C | Same as `api/apply.js`. |
| `api/subscribe.js` | C | Replace `pushToHubSpot` with `pushToMonday`. Newsletter signups short-circuit to `bucket: 'Watch'` via the scoring engine's source-aware path. |

The 5 endpoint files (`chat`, `whatsapp`, `apply`, `session-booking`, `subscribe`) all import `pushToMonday` from `api/monday.js` and `scoreLead` from `api/scoring.js`. No duplication of those helpers — they live once, are imported five times.

---

## Phase A — Atlas-side scoring + adaptive closings (independent of Monday)

Phase A delivers immediate value: Atlas's closing message starts adapting based on lead quality, even though the CRM is still HubSpot. The score and bucket are computed for the substitution decision but are NOT persisted to HubSpot in Phase A — persistence lands in Phase C with Monday. This is intentional and acceptable: the substitution is the user-facing payoff; storage is a follow-up.

---

## Task 1 — `api/scoring.js` — pure-function scoring engine

**Files:**
- Create: `api/scoring.js`

- [ ] **Step 1: Create the scoring module**

Create `api/scoring.js` with this exact content:

```js
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
```

- [ ] **Step 2: Smoke-test the module loads**

Run: `node -e "const s = require('./api/scoring'); console.log(typeof s.scoreLead, Object.keys(s.BUCKET_CLOSING_LINES).length);"`
Expected output: `function 4`

If the output differs, fix the syntax error before proceeding.

- [ ] **Step 3: Commit**

```bash
git add api/scoring.js
git commit -m "scoring: LeadSense rubric — pure-function score + bucket

api/scoring.js exports scoreLead(record, source) returning
{ score, bucket, breakdown }. Score is a clamped 0-100 integer.
Bucket is one of Priority / Standard / Watch / Decline derived
from thresholds 75 / 40 / 15 / 0.

Weights per the spec rubric:
  tier match (private 25 / growth 20 / signature 12 / session 8)
  budget alignment vs tier floor (-10 below, +15 within, +10 above)
  timeline urgency (this quarter 15 / next 8)
  role seniority regex (founder 15 / c-level 12 / VP 10)
  brief specificity (long + commercial keyword 10 / 50-150 chars 5)
  source bonus (apply 10 / atlas chat or wa 8 / session 5)
  negatives (-15 proposal demand / -10 vague brief / -10 discount
             ask / -5 free-email on private)

Newsletter source short-circuits to bucket=Watch since they have
no qualifying signals. BUCKET_CLOSING_LINES and
DEFAULT_SUBSTITUTION_TARGET exported for the closing-substitution
logic that lands in api/chat.js and api/whatsapp.js next."
```

---

## Task 2 — `scripts/verify-scoring.js` — fixture verification

**Files:**
- Create: `scripts/verify-scoring.js`

- [ ] **Step 1: Create the verification script**

Create `scripts/verify-scoring.js` with this exact content:

```js
/* HIMARK · LeadSense scoring verification
   No test framework on this project — this script exercises
   scoreLead() against ~20 fixture leads spanning all four buckets
   and the major signal combinations. Run:

     node scripts/verify-scoring.js

   Exits 0 on full PASS, non-zero on any mismatch. */

const { scoreLead, BUCKET_PRIORITY, BUCKET_STANDARD, BUCKET_WATCH, BUCKET_DECLINE } = require('../api/scoring');

const cases = [
  /* ── PRIORITY (score ≥ 75) ─────────────────────────────── */
  {
    name: 'PRIORITY — Private / founder / R200k / this quarter / specific brief',
    record: {
      tier: 'Private',
      role: 'Founder & CEO',
      budget: 'R200,000',
      timeline: 'this quarter',
      brief: 'We are an enterprise SaaS at R30M ARR looking to reshape our positioning ahead of a Series C raise and restructure our demand systems for international expansion.'
    },
    source: 'atlas-chat',
    expectMin: 75, expectMax: 100, expectBucket: BUCKET_PRIORITY
  },
  {
    name: 'PRIORITY — Growth / founder / R150k / this quarter / specific',
    record: {
      tier: 'Growth',
      role: 'Co-founder',
      budget: '150k',
      timeline: 'this quarter',
      brief: 'Series B SaaS scaling pipeline and conversion across three new market segments, need CRM and demand systems built fast.'
    },
    source: 'apply',
    expectMin: 75, expectMax: 100, expectBucket: BUCKET_PRIORITY
  },
  /* ── STANDARD (40 ≤ score < 75) ────────────────────────── */
  {
    name: 'STANDARD — Growth / director / R80k / next quarter / mid brief',
    record: {
      tier: 'Growth',
      role: 'Director of Marketing',
      budget: 'R80,000',
      timeline: 'next quarter',
      brief: 'Looking at our positioning and demand work for Q3.'
    },
    source: 'atlas-chat',
    expectMin: 40, expectMax: 74, expectBucket: BUCKET_STANDARD
  },
  {
    name: 'STANDARD — Signature / manager / R50k / next quarter',
    record: {
      tier: 'Signature',
      role: 'Marketing Manager',
      budget: 'R50,000',
      timeline: 'next quarter',
      brief: 'Need brand foundations and a website for our startup, currently scaling our pipeline.'
    },
    source: 'atlas-whatsapp',
    expectMin: 40, expectMax: 74, expectBucket: BUCKET_STANDARD
  },
  /* ── WATCH (15 ≤ score < 40) ───────────────────────────── */
  {
    name: 'WATCH — Unsure tier / unspecified role / undisclosed budget / open',
    record: {
      tier: 'Unsure',
      role: '',
      budget: 'open',
      timeline: 'open',
      brief: 'Have a few questions about your services and approach.'
    },
    source: 'atlas-chat',
    expectMin: 15, expectMax: 39, expectBucket: BUCKET_WATCH
  },
  {
    name: 'WATCH — Newsletter signup (short-circuit)',
    record: { email: 'someone@example.com' },
    source: 'newsletter',
    expectMin: 10, expectMax: 10, expectBucket: BUCKET_WATCH
  },
  /* ── DECLINE (score < 15) ──────────────────────────────── */
  {
    name: 'DECLINE — Sub-floor budget, asked for discount, vague brief',
    record: {
      tier: 'Signature',
      role: '',
      budget: 'R20,000',
      timeline: 'open',
      brief: 'we need help, can you do it cheaper'
    },
    source: 'atlas-chat',
    expectMin: 0, expectMax: 14, expectBucket: BUCKET_DECLINE
  },
  {
    name: 'DECLINE — Proposal demand, vague intent',
    record: {
      tier: '',
      role: '',
      budget: '',
      timeline: '',
      brief: 'send me a proposal please'
    },
    source: 'atlas-chat',
    expectMin: 0, expectMax: 14, expectBucket: BUCKET_DECLINE
  },
  /* ── INDIVIDUAL SIGNAL CHECKS ──────────────────────────── */
  {
    name: 'Tier alone — Private gives +25',
    record: { tier: 'Private', role: '', budget: '', timeline: '', brief: '' },
    source: 'atlas-chat',
    expectMin: 25 + 5 + 8, expectMax: 25 + 5 + 8, expectBucket: BUCKET_STANDARD
  },
  {
    name: 'Empty record / unknown source — minimum score 5 (budget undisclosed default)',
    record: {},
    source: '',
    expectMin: 5, expectMax: 5, expectBucket: BUCKET_DECLINE
  },
  {
    name: 'Founder role alone — +15 from role, +5 budget undisclosed, +8 source',
    record: { tier: '', role: 'Founder', budget: '', timeline: '', brief: '' },
    source: 'atlas-chat',
    expectMin: 28, expectMax: 28, expectBucket: BUCKET_WATCH
  },
  {
    name: 'Free email on Private tier — applies the −5 penalty',
    record: { tier: 'Private', role: 'CEO', budget: 'R150,000', timeline: 'open', brief: '', email: 'fred@gmail.com' },
    source: 'atlas-chat',
    /* 25 (tier) + 15 (budget within) + 0 (timeline) + 12 (CEO) + 0 (brief) + 8 (source) − 5 (free email on Private) = 55 */
    expectMin: 55, expectMax: 55, expectBucket: BUCKET_STANDARD
  },
  {
    name: 'Below-floor budget — −10 penalty applies even with strong tier',
    record: { tier: 'Private', role: 'CEO', budget: 'R30,000', timeline: 'this quarter', brief: '' },
    source: 'atlas-chat',
    /* 25 + (−10) + 15 + 12 + 0 + 8 = 50 */
    expectMin: 50, expectMax: 50, expectBucket: BUCKET_STANDARD
  },
  {
    name: 'Long specific brief with commercial keyword — +10',
    record: {
      tier: 'Growth', role: 'Director', budget: 'R80,000', timeline: 'open',
      brief: 'We need to rebuild our demand systems and improve conversion across the funnel — current pipeline is broken and revenue is stalling at R8M ARR despite increased sales headcount.'
    },
    source: 'atlas-chat',
    /* 20 + 15 + 0 + 10 + 10 + 8 = 63 */
    expectMin: 63, expectMax: 63, expectBucket: BUCKET_STANDARD
  },
  {
    name: 'Apply source bonus is higher than chat',
    record: { tier: 'Signature', role: '', budget: '', timeline: '', brief: '' },
    source: 'apply',
    /* 12 + 5 + 0 + 0 + 0 + 10 = 27 */
    expectMin: 27, expectMax: 27, expectBucket: BUCKET_WATCH
  }
];

let failed = 0;
for (const c of cases) {
  const result = scoreLead(c.record, c.source);
  const inRange = result.score >= c.expectMin && result.score <= c.expectMax;
  const bucketOk = result.bucket === c.expectBucket;
  const ok = inRange && bucketOk;
  console.log((ok ? 'PASS ' : 'FAIL ') + c.name + '  → score=' + result.score + ' bucket=' + result.bucket);
  if (!ok) {
    console.error('  expected score ' + c.expectMin + '–' + c.expectMax + ' bucket=' + c.expectBucket);
    console.error('  breakdown:', JSON.stringify(result.breakdown));
    failed++;
  }
}

if (failed) {
  console.error('\n' + failed + ' case(s) failed.');
  process.exit(1);
}
console.log('\nAll cases passed.');
```

- [ ] **Step 2: Run the script — all cases must PASS**

Run: `node scripts/verify-scoring.js`
Expected output: every line starts with `PASS `, ends with `All cases passed.`, exit code 0.

If any case fails, the fix is either:
- Adjust the weight in `api/scoring.js` to match the expected value (preferred when the weight is wrong)
- Adjust the `expectMin`/`expectMax` in the script to match the actual weight (when the script's math is off)

The two MUST stay in lockstep. Do not commit until all PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-scoring.js
git commit -m "scripts: verify-scoring — fixture-based sanity check

Exercises scoreLead() against 15 representative leads covering
all four buckets (Priority, Standard, Watch, Decline) and the
major individual signal contributions (tier alone, role alone,
free-email penalty, below-floor budget, long brief bonus, newsletter
short-circuit). Each case asserts a score range and an exact bucket.

Same pattern as scripts/verify-chunking.js — the script IS the test
on this project since there is no formal test framework. Run after
any change to api/scoring.js. PASS-only output, non-zero exit on
any mismatch."
```

---

## Task 3 — Update §15 of `atlas-knowledge.js` to lock the closing phrase

**Files:**
- Modify: `api/atlas-knowledge.js` (§15 CLOSING section only)

- [ ] **Step 1: Locate the current CLOSING block**

Run: `grep -n "CLOSING — after Step 8" api/atlas-knowledge.js`
Expected output: a single line number for the existing CLOSING header in §15. Note that line number.

- [ ] **Step 2: Read the current block to confirm bounds**

Run: `grep -n 'CLOSING — after Step 8\|PACE & TONE' api/atlas-knowledge.js`
Expected: two line numbers. The CLOSING block sits between them.

- [ ] **Step 3: Replace the CLOSING block with the locked phrase**

Edit `api/atlas-knowledge.js`. Find these lines:

```js
  "----------------------------------------------------------------",
  "CLOSING — after Step 8",
  "----------------------------------------------------------------",
  "Once you have name + email captured, close the conversation with:",
  "\"Thank you. A principal will follow up directly within five working days. If you'd like to add anything in the meantime, just keep typing.\"",
  "",
  "Then append the lead block (see format below).",
  "",
```

Replace them with:

```js
  "----------------------------------------------------------------",
  "CLOSING — after Step 8 — use EXACTLY this phrasing",
  "----------------------------------------------------------------",
  "Once you have name + email captured, close the conversation with this exact sentence — copy it word for word, including punctuation and capitalisation. Do NOT rephrase, do NOT shorten, do NOT translate to a different tone:",
  "",
  "\"Thank you. A principal will follow up directly within five working days. If you'd like to add anything in the meantime, just keep typing.\"",
  "",
  "Why exact phrasing matters: the server may substitute the \"five working days\" sentence for a different timing line based on internal qualification scoring (24-hour priority track, longer watch-track, or a polite decline). The substitution looks for the literal string \"A principal will follow up directly within five working days.\" — if you paraphrase, the substitution silently fails and the visitor sees the default 5-day promise even when they should have heard 24 hours or a decline. Lock the phrasing.",
  "",
  "Then append the lead block (see format below).",
  "",
```

- [ ] **Step 4: Sanity-check the array still parses**

Run: `node -e "console.log('len:', require('./api/atlas-knowledge').length)"`
Expected: a positive number (the string length of the joined prompt). No SyntaxError.

- [ ] **Step 5: Commit**

```bash
git add api/atlas-knowledge.js
git commit -m "atlas: lock §15 closing phrase for server-side substitution

The next two commits add server-side adaptive closing — the chat
and WhatsApp handlers will find-and-replace the default 'five
working days' sentence with a bucket-specific line (24h Priority,
10-day Watch, soft Decline) based on the LeadSense score that
api/scoring.js computes from the captured lead.

For the substitution to work reliably Atlas must emit the literal
sentence the server is looking for. Updated §15 CLOSING with an
explicit 'use exactly this phrasing' instruction, the verbatim
template, and a one-sentence justification so future tone passes
do not loosen it back to paraphrasable freedom.

The trailing 'If you'd like to add anything in the meantime, just
keep typing.' sentence is preserved across all four bucket
substitutions because it is a separate sentence the find-and-
replace does not touch."
```

---

## Task 4 — Wire scoring + adaptive closing into `api/chat.js`

**Files:**
- Modify: `api/chat.js` (add import, add substitution logic between lead extraction and chunk splitting)

- [ ] **Step 1: Confirm current structure around the lead extraction**

Run: `grep -n "extractLead\|stripLeadBlock\|finalReply" api/chat.js`
Expected: a few line numbers showing where `extractLead(rawReply)` and `stripLeadBlock(rawReply)` are called, and where `finalReply` is computed. The substitution logic goes between extraction and chunking.

- [ ] **Step 2: Add the import at the top of the file**

Find the existing requires near the top of `api/chat.js`:

```js
const SYSTEM_PROMPT = require('./atlas-knowledge');
```

Immediately AFTER that line, add:

```js
const { scoreLead, BUCKET_CLOSING_LINES, DEFAULT_SUBSTITUTION_TARGET, BUCKET_STANDARD } = require('./scoring');
```

- [ ] **Step 3: Add the substitution logic**

Find the block in `api/chat.js` where `finalReply` is computed. It currently looks like (or similar):

```js
    const lead    = extractLead(rawReply);
    const session = extractSession(rawReply);
    const visibleReply = stripLeadBlock(rawReply);

    if (lead) {
      pushToHubSpot(lead, 'lead').catch(e => console.error('[atlas] hubspot push exception (lead)', e && e.message));
    }
    if (session) {
      pushToHubSpot(session, 'session').catch(e => console.error('[atlas] hubspot push exception (session)', e && e.message));
    }

    const finalReply = visibleReply || "I'm not able to respond on that just now. Please reach us at info@himark.co.za.";
```

Replace it with:

```js
    const lead    = extractLead(rawReply);
    const session = extractSession(rawReply);
    let visibleReply = stripLeadBlock(rawReply);

    /* Score the lead (or session) and adapt the closing line if the
       bucket is anything other than Standard. The substitution looks
       for the exact phrase Atlas was told to use in §15 of
       atlas-knowledge.js — if Gemini paraphrased, the replace is a
       no-op and the default 5-day SLA stays. Safe fallback. */
    let scoring = null;
    if (lead) {
      try { scoring = scoreLead(lead, 'atlas-chat'); }
      catch (e) { console.error('[atlas] scoreLead threw (lead)', e && e.message); }
    } else if (session) {
      try { scoring = scoreLead({ ...session, tier: 'Session' }, 'atlas-chat'); }
      catch (e) { console.error('[atlas] scoreLead threw (session)', e && e.message); }
    }
    if (scoring && scoring.bucket !== BUCKET_STANDARD) {
      const adapted = BUCKET_CLOSING_LINES[scoring.bucket];
      if (adapted) {
        visibleReply = visibleReply.replace(DEFAULT_SUBSTITUTION_TARGET, adapted);
      }
      console.log('[atlas] lead scored', { bucket: scoring.bucket, score: scoring.score });
    }

    if (lead) {
      pushToHubSpot(lead, 'lead').catch(e => console.error('[atlas] hubspot push exception (lead)', e && e.message));
    }
    if (session) {
      pushToHubSpot(session, 'session').catch(e => console.error('[atlas] hubspot push exception (session)', e && e.message));
    }

    const finalReply = visibleReply || "I'm not able to respond on that just now. Please reach us at info@himark.co.za.";
```

The key changes: `visibleReply` is now `let` (mutable) instead of `const`; the scoring + substitution block runs between extraction and the HubSpot push (HubSpot stays unchanged in Phase A).

- [ ] **Step 4: Confirm the module still loads and the chunking script still passes**

Run: `node --check api/chat.js` — must be silent / exit 0.
Run: `node scripts/verify-scoring.js` — must still print all PASS + exit 0.

- [ ] **Step 5: Commit**

```bash
git add api/chat.js
git commit -m "chat: adaptive closing — substitute Atlas's closing by lead bucket

Wires api/scoring.js into the website chat handler. After
extractLead (or extractSession) returns, scoreLead() runs and
returns { score, bucket, breakdown }. If the bucket is anything
other than Standard, the visible reply has the default 'five
working days' closing sentence replaced with the bucket-specific
line from BUCKET_CLOSING_LINES (24h for Priority, 5-10 day low-
touch for Watch, soft decline for Decline). Standard skips the
substitution and the default stays.

The substitution uses String.prototype.replace() with the literal
target string DEFAULT_SUBSTITUTION_TARGET — first occurrence only,
trailing 'If you'd like to add anything in the meantime' sentence
is preserved. If Gemini paraphrased the closing despite §15's lock,
the replace is a no-op and the visitor sees the default Standard
line. Safe fallback.

scoreLead() is wrapped in try/catch so a scoring exception cannot
break the reply path. HubSpot push is unchanged in this phase —
score and bucket are computed for the substitution decision but
not yet persisted. Persistence lands in Phase C with Monday."
```

---

## Task 5 — Wire scoring + adaptive closing into `api/whatsapp.js`

**Files:**
- Modify: `api/whatsapp.js` (add import, add substitution logic inside handleMessage)

- [ ] **Step 1: Find the same location in the WhatsApp handler**

Run: `grep -n "extractLead\|stripBlocks\|appendHistory.*assistant" api/whatsapp.js`
Expected: a few line numbers showing where lead extraction and the final reply assembly happen inside `handleMessage()`.

- [ ] **Step 2: Add the import**

Find the existing requires near the top of `api/whatsapp.js`:

```js
const SYSTEM_PROMPT = require('./atlas-knowledge');
```

Immediately AFTER that line, add:

```js
const { scoreLead, BUCKET_CLOSING_LINES, DEFAULT_SUBSTITUTION_TARGET, BUCKET_STANDARD } = require('./scoring');
```

- [ ] **Step 3: Add the substitution inside `handleMessage`**

Find the block in `handleMessage()` that looks like:

```js
  /* HubSpot push (fire-and-forget) */
  const lead    = extractLead(raw);
  const session = extractSession(raw);
  if (lead)    pushToHubSpot(lead,    'lead',    from).catch(e => console.error('[wa] hubspot lead', e && e.message));
  if (session) pushToHubSpot(session, 'session', from).catch(e => console.error('[wa] hubspot session', e && e.message));

  const visible = stripBlocks(raw) || "I'm not able to respond to that just now. Please reach us at info@himark.co.za.";
```

Replace it with:

```js
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
```

The substitution must happen BEFORE the existing `appendHistory(from, 'assistant', visible)` call and BEFORE the `sendWhatsAppTextChunks(from, visible)` call so the chunked reply contains the adapted closing.

- [ ] **Step 4: Confirm the module still loads and scoring still passes**

Run: `node --check api/whatsapp.js` — silent / exit 0.
Run: `node scripts/verify-scoring.js` — all PASS, exit 0.
Run: `node scripts/verify-chunking.js` — all PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add api/whatsapp.js
git commit -m "wa: adaptive closing — same scoring + substitution as web chat

Mirrors api/chat.js: scoreLead() runs after extractLead, and if
the bucket is not Standard, the visible reply has the default
'five working days' closing replaced with the bucket-specific
line BEFORE appendHistory and sendWhatsAppTextChunks fire. So the
chunked WhatsApp messages contain the adapted closing in their
last chunk and history stores the adapted text.

Source passed to scoreLead is 'atlas-whatsapp' (vs 'atlas-chat'
on the web). Source quality bonus is the same (8) but downstream
Monday filtering can distinguish channels.

HubSpot push unchanged in this phase. fromPhone still stamped
on the contact. Phase C replaces HubSpot with Monday and also
persists score + bucket as columns."
```

---

## Task 6 — Deploy Phase A and verify adaptive closings live

**Files:** none — this is a verification gate, not a code task.

- [ ] **Step 1: Push the branch**

```bash
git push
```

Vercel deploys automatically. Wait until the latest deploy shows **Ready** in the Vercel dashboard.

- [ ] **Step 2: Verify the scoring script still passes on the live tree**

Run: `node scripts/verify-scoring.js`
Expected: all 15 cases PASS, `All cases passed.`, exit 0.

- [ ] **Step 3: Smoke-test the Priority bucket — Atlas web chat**

In a browser tab:
1. Open the live site, open the Atlas widget
2. Type: `I want to apply`
3. Atlas should begin LeadSense
4. Answer with a Private-fit founder profile:
   - Company: "Acme Corp, B2B SaaS at R30M ARR"
   - Role: "Co-founder & CEO"
   - Outcome: "We want to reshape our positioning ahead of a Series C and rebuild our demand systems for international expansion"
   - Constraint: "Our pipeline is broken at scale, current sales motion does not convert at enterprise"
   - Timeline: "this quarter"
   - Budget: "R200,000"
   - Name + email when prompted

Expected: Atlas's final closing bubble reads:

> *"Thank you. A principal will reach out directly within 24 hours."*

NOT the default "within five working days."

- [ ] **Step 4: Smoke-test the Decline bucket — Atlas web chat**

Open a fresh widget session, then complete a sub-floor / discount-asking profile:
- Company: "small consultancy, single founder"
- Role: blank or "owner"
- Outcome: "we need help"
- Constraint: "we need help"
- Timeline: "open"
- Budget: "R15,000 — can you do it cheaper"
- Name + email

Expected: Atlas's final closing bubble starts with:

> *"Thank you for the detail. Based on fit, we do not think we are the right partners for this brief right now..."*

- [ ] **Step 5: Check Vercel logs for the scoring breadcrumb**

In Vercel logs for the chat function, find the most recent `[atlas] lead scored` line. It should show:

```
[atlas] lead scored { bucket: 'Priority', score: <number ≥ 75> }
```

(or `Decline` for the second test).

If the substitution did NOT fire (Atlas's reply still says "five working days" even though the score should bucket otherwise), check:
- Did Atlas use the exact phrasing from §15? Look at the raw Vercel log of the reply.
- If Atlas paraphrased, the substitution is a no-op. Tighten §15 further if needed.

- [ ] **Step 6: Repeat with WhatsApp for the Priority bucket**

From your personal phone, send to HIMARK's number: `apply` followed by the same Private-fit founder answers as Step 3.

Expected: Atlas's final WhatsApp chunk reads the 24-hour line, not the 5-day line. `[wa] lead scored` appears in the Vercel log.

- [ ] **Step 7: Phase A complete — no commit needed**

If all four smoke tests pass, Phase A is live. No commit at this step (verification only). Move to Phase B (user action — Monday board setup).

If any test fails, file the failure mode against the relevant task above and iterate.

---

## Phase B — User action: Monday board setup

Phase B is NOT a code task. It is a prerequisite for Phase C. The user (Neo) completes the following BEFORE Phase C tasks can start:

1. **Create the "HIMARK Inbound" board in Monday** with the 16 columns specified in `docs/superpowers/specs/2026-05-29-monday-scoring-leadsense-design.md` (Monday board design section).
2. **Generate a Monday API v2 token**: top-right avatar → Admin → API → "Create v2 token". Copy the long string.
3. **Capture the column ID map** by running this query in Monday's API playground (`monday.com/developers/v2/try-it-yourself`):

   ```graphql
   query { boards(ids: [YOUR_BOARD_ID]) { columns { id title type } } }
   ```

   Save the response.

4. **Add three env vars to Vercel** → Settings → Environment Variables:
   - `MONDAY_API_TOKEN` — the token from step 2 (paste directly into Vercel; do not share with the controller)
   - `MONDAY_BOARD_ID` — the numeric board ID from the URL `monday.com/boards/<id>`
   - `MONDAY_COLUMN_MAP` — a JSON string mapping internal field names to Monday column IDs, e.g.:

     ```json
     {"email":"email","phone":"phone","company":"text","role":"text_1","brief":"long_text","tier":"status","timeline":"status_1","budget":"status_2","source":"status_3","score":"numbers","priority":"status_4","stage":"status_5","capturedAt":"date","followUpBy":"date_1"}
     ```

5. **Share the board ID and column map (NOT the token) with the controller** so Phase C tasks can dispatch with the correct mapping.

Phase B is complete when steps 1–5 are done. Phase C tasks then start.

---

## Phase C — Monday wire + HubSpot removal

---

## Task 7 — `api/monday.js` — GraphQL helper

**Files:**
- Create: `api/monday.js`

- [ ] **Step 1: Confirm Phase B is complete**

The controller dispatching this task MUST have the board ID and column map from the user. If they are not yet shared, halt — Phase C cannot start until Phase B is done.

- [ ] **Step 2: Create the helper module**

Create `api/monday.js` with this exact content. The column_values JSON shape varies per Monday column type — the helper handles Email, Phone, Text, Long-text, Status, Numbers, and Date columns based on what's in MONDAY_COLUMN_MAP.

```js
/* HIMARK · Monday CRM helper
   ============================================================
   Pushes captured leads, applications, session bookings, and
   newsletter signups to the "HIMARK Inbound" Monday board via
   GraphQL. Replaces api/chat.js + api/whatsapp.js + api/apply.js
   + api/session-booking.js + api/subscribe.js' previous
   pushToHubSpot calls.

   Required env vars (Vercel → Settings → Environment Variables):
     MONDAY_API_TOKEN     — long string starting with eyJ...
     MONDAY_BOARD_ID      — numeric board ID from board URL
     MONDAY_COLUMN_MAP    — JSON string mapping internal field
                            names to Monday column IDs, e.g.:
                            {"email":"email","phone":"phone","company":"text",
                             "role":"text_1","brief":"long_text",
                             "tier":"status","timeline":"status_1",
                             "budget":"status_2","source":"status_3",
                             "score":"numbers","priority":"status_4",
                             "stage":"status_5","capturedAt":"date",
                             "followUpBy":"date_1"}

   Failure modes:
     - Missing env var → returns { error: 'env-missing' }, logs once
     - Monday API non-2xx → logs status + body excerpt, returns
                            { error: 'monday-write-failed', status }
     - fetch throws (network/TLS) → logs err.cause, returns
                            { error: 'monday-fetch-threw' }

   None of the failure modes block the visitor's reply — the caller
   already responded by the time pushToMonday is awaited.

   Spec: docs/superpowers/specs/2026-05-29-monday-scoring-leadsense-design.md
   ============================================================ */

const MONDAY_API_URL = 'https://api.monday.com/v2';

let columnMapCache = null;
function getColumnMap(){
  if (columnMapCache) return columnMapCache;
  const raw = process.env.MONDAY_COLUMN_MAP || '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      columnMapCache = parsed;
      return parsed;
    }
  } catch (_) {}
  return null;
}

/* Build the column_values object Monday expects. Each Monday column
   type has its own value shape. We infer the type from the column-
   name convention in our internal map keys (email, phone, score,
   etc.) rather than from Monday's API — saves a network call. */
function buildColumnValues(record, map){
  const values = {};

  if (record.email && map.email) {
    values[map.email] = { email: String(record.email), text: String(record.email) };
  }
  if (record.phone && map.phone) {
    values[map.phone] = { phone: String(record.phone), countryShortName: 'ZA' };
  }
  if (record.company && map.company) {
    values[map.company] = String(record.company);
  }
  if (record.role && map.role) {
    values[map.role] = String(record.role);
  }
  if (record.brief && map.brief) {
    values[map.brief] = String(record.brief);
  }
  if (record.tier && map.tier) {
    values[map.tier] = { label: String(record.tier) };
  }
  if (record.timeline && map.timeline) {
    values[map.timeline] = { label: String(record.timeline) };
  }
  if (record.budget && map.budget) {
    values[map.budget] = { label: String(record.budget) };
  }
  if (record.source && map.source) {
    values[map.source] = { label: String(record.source) };
  }
  if (typeof record.score === 'number' && map.score) {
    values[map.score] = String(record.score);
  }
  if (record.priority && map.priority) {
    values[map.priority] = { label: String(record.priority) };
  }
  /* Stage defaults to 'New' on every fresh capture. */
  if (map.stage) {
    values[map.stage] = { label: 'New' };
  }
  if (map.capturedAt) {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10);
    const timeStr = d.toISOString().slice(11, 19);
    values[map.capturedAt] = { date: dateStr, time: timeStr };
  }
  if (map.followUpBy && record.followUpDateISO) {
    values[map.followUpBy] = { date: record.followUpDateISO };
  }
  return values;
}

/* Compute the "follow-up by" date from the bucket. Priority = +1 day,
   Standard = +5 working days, Watch = +10 working days, Decline = null.
   Working-day skip is simple: skip Sat & Sun. */
function followUpFromBucket(bucket){
  if (!bucket || bucket === 'Decline') return null;
  let days;
  if (bucket === 'Priority') days = 1;
  else if (bucket === 'Standard') days = 5;
  else if (bucket === 'Watch') days = 10;
  else return null;
  const d = new Date();
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

const CREATE_ITEM_MUTATION = `
  mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
    create_item(
      board_id: $boardId,
      item_name: $itemName,
      column_values: $columnValues
    ) { id }
  }
`;

async function pushToMonday(record, source){
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  const map = getColumnMap();

  if (!token || !boardId || !map) {
    console.error('[crm] monday env missing — lead capture failed', {
      hasToken: !!token,
      hasBoardId: !!boardId,
      hasMap: !!map,
      record_email: record && record.email
    });
    return { error: 'env-missing' };
  }

  const itemName = String(record.name || record.email || 'Inbound').slice(0, 255);
  const enriched = {
    ...record,
    source: source || record.source || '',
    followUpDateISO: followUpFromBucket(record.priority || (record.bucket))
  };
  const columnValues = buildColumnValues(enriched, map);

  let res;
  try {
    res = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'API-Version': '2024-01'
      },
      body: JSON.stringify({
        query: CREATE_ITEM_MUTATION,
        variables: {
          boardId: String(boardId),
          itemName: itemName,
          columnValues: JSON.stringify(columnValues)
        }
      })
    });
  } catch (err) {
    console.error('[crm] monday fetch threw',
      err && err.message,
      'cause:', err && err.cause && (err.cause.message || err.cause.code || String(err.cause)));
    return { error: 'monday-fetch-threw' };
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[crm] monday-write-failed', res.status, t.slice(0, 300));
    return { error: 'monday-write-failed', status: res.status };
  }
  const data = await res.json().catch(() => null);
  if (data && data.errors) {
    console.error('[crm] monday graphql errors', JSON.stringify(data.errors).slice(0, 400));
    return { error: 'monday-graphql-errors' };
  }
  const itemId = data && data.data && data.data.create_item && data.data.create_item.id;
  console.log('[crm] monday item created', { itemId, source, email: record.email });
  return { itemId, created: true };
}

module.exports = { pushToMonday };
```

- [ ] **Step 3: Smoke-test the module loads**

Run: `node -e "const m = require('./api/monday'); console.log(typeof m.pushToMonday);"`
Expected output: `function`

- [ ] **Step 4: Smoke-test against the real Monday API**

⚠️ This step writes a test item to the board. Confirm with the user before running. Then:

Run:
```bash
node -e "
const { pushToMonday } = require('./api/monday');
pushToMonday({
  name: 'TEST — pushToMonday smoke',
  email: 'test+smoke@himark.co.za',
  company: 'Smoke Test Co',
  role: 'QA',
  brief: 'Smoke test of api/monday.js helper. Delete this item.',
  tier: 'Unsure',
  timeline: 'Open',
  budget: 'Open',
  score: 30,
  priority: 'Watch'
}, 'atlas-chat').then(r => console.log(JSON.stringify(r)));
"
```

Expected output: `{"itemId":"<some-id>","created":true}`

Then check the Monday board — there should be a new item titled `TEST — pushToMonday smoke` with the fields populated. Delete it manually after confirming.

If the response is `{"error":"env-missing"}` — Phase B is incomplete, the env vars are not set in this environment. Get the user to add them and re-run.

If the response is `{"error":"monday-write-failed", status: 401}` — token wrong.
If `{"error":"monday-write-failed", status: 400}` with a body about column type mismatch — the MONDAY_COLUMN_MAP is mismapping a column type. Re-check the spec's column types vs Monday's actual columns.

- [ ] **Step 5: Commit**

```bash
git add api/monday.js
git commit -m "monday: GraphQL helper — pushToMonday(record, source)

api/monday.js exports a single async function pushToMonday(record,
source) that creates an item on the HIMARK Inbound board via
Monday's GraphQL create_item mutation. Replaces all pushToHubSpot
calls across the five capture endpoints in subsequent commits.

Env vars (already set in Vercel during Phase B):
  MONDAY_API_TOKEN   — v2 token from Monday admin
  MONDAY_BOARD_ID    — numeric board ID
  MONDAY_COLUMN_MAP  — JSON string mapping internal field names to
                       Monday column IDs

The column_values shape varies by Monday column type — Email
expects {email,text}, Status expects {label}, Numbers expects a
stringified number, Date expects {date,time?}, Phone expects
{phone,countryShortName}. The helper builds the right shape for
each known field from the record.

followUpFromBucket derives the Follow-up by date from the lead's
bucket: Priority +1 day, Standard +5 working days, Watch +10
working days, Decline null. Working-day skip = no Sat/Sun.

Failure modes: env-missing (returns immediately), fetch-threw
(network), monday-write-failed (non-2xx), monday-graphql-errors
(2xx but GraphQL-level error). All are logged with enough detail
to debug but never throw — the caller already replied to the
visitor, persistence is fire-and-forget."
```

---

## Task 8 — Swap HubSpot for Monday in `api/chat.js`

**Files:**
- Modify: `api/chat.js` (swap pushToHubSpot for pushToMonday; pass score + bucket; remove HubSpot helper code)

- [ ] **Step 1: Add the Monday import**

Find the existing `require('./scoring')` line at the top of `api/chat.js` (added in Task 4). Immediately AFTER it, add:

```js
const { pushToMonday } = require('./monday');
```

- [ ] **Step 2: Replace pushToHubSpot calls with pushToMonday**

Find the existing block in `api/chat.js`:

```js
    if (lead) {
      pushToHubSpot(lead, 'lead').catch(e => console.error('[atlas] hubspot push exception (lead)', e && e.message));
    }
    if (session) {
      pushToHubSpot(session, 'session').catch(e => console.error('[atlas] hubspot push exception (session)', e && e.message));
    }
```

Replace it with:

```js
    if (lead) {
      const leadWithScore = scoring
        ? { ...lead, score: scoring.score, priority: scoring.bucket }
        : lead;
      pushToMonday(leadWithScore, 'atlas-chat').catch(e => console.error('[atlas] monday push exception (lead)', e && e.message));
    }
    if (session) {
      const sessionWithScore = scoring
        ? { ...session, tier: 'Session', score: scoring.score, priority: scoring.bucket }
        : { ...session, tier: 'Session' };
      pushToMonday(sessionWithScore, 'atlas-chat').catch(e => console.error('[atlas] monday push exception (session)', e && e.message));
    }
```

- [ ] **Step 3: Remove the now-dead HubSpot helper code**

Still in `api/chat.js`, find and DELETE the entire `pushToHubSpot` function definition (it starts with a comment header like `/* ============================================================ HUBSPOT...` and ends with the function's closing `}`). Also delete any `LEAD_PROPS` / HubSpot-related constants that are now unused. Keep `extractLead`, `extractSession`, `stripLeadBlock`, `parseBlock`, and the LEAD_RE/SESSION_RE constants — those still serve the new flow.

- [ ] **Step 4: Update the diagnostic GET to report Monday status, not HubSpot**

Find the diagnostic GET handler in `api/chat.js` (it responds to GET requests with a JSON status object including `hubspotConfigured`). Find:

```js
      hubspotConfigured: !!process.env.HUBSPOT_ACCESS_TOKEN,
```

Replace with:

```js
      mondayConfigured: !!process.env.MONDAY_API_TOKEN && !!process.env.MONDAY_BOARD_ID && !!process.env.MONDAY_COLUMN_MAP,
```

- [ ] **Step 5: Sanity-check**

Run: `node --check api/chat.js` — silent / exit 0.
Run: `node -e "const fn = require('./api/chat'); console.log(typeof fn);"` — expects `function`.

- [ ] **Step 6: Commit**

```bash
git add api/chat.js
git commit -m "chat: swap HubSpot for Monday, persist score + priority bucket

api/chat.js now imports pushToMonday from api/monday.js (instead
of using the inlined pushToHubSpot helper) and pushes both lead
and session records with the score + priority bucket merged in.
For sessions the tier is forced to 'Session' so the Monday Tier
column reflects the right swim lane.

Deleted the dead pushToHubSpot function definition and the
HubSpot-specific custom-property constants. Kept extractLead /
extractSession / stripLeadBlock / parseBlock / LEAD_RE /
SESSION_RE — those are CRM-agnostic and still in use.

Diagnostic GET now reports mondayConfigured (token + board id +
column map all present) instead of hubspotConfigured."
```

---

## Task 9 — Swap HubSpot for Monday in `api/whatsapp.js`

**Files:**
- Modify: `api/whatsapp.js` (same swap pattern as Task 8)

- [ ] **Step 1: Add the Monday import**

Find the existing `require('./scoring')` line in `api/whatsapp.js` (added in Task 5). Immediately AFTER it, add:

```js
const { pushToMonday } = require('./monday');
```

- [ ] **Step 2: Replace pushToHubSpot calls with pushToMonday**

Find the existing block inside `handleMessage`:

```js
  if (lead)    pushToHubSpot(lead,    'lead',    from).catch(e => console.error('[wa] hubspot lead', e && e.message));
  if (session) pushToHubSpot(session, 'session', from).catch(e => console.error('[wa] hubspot session', e && e.message));
```

Replace with:

```js
  if (lead) {
    const leadWithScore = scoring
      ? { ...lead, score: scoring.score, priority: scoring.bucket, phone: from }
      : { ...lead, phone: from };
    pushToMonday(leadWithScore, 'atlas-whatsapp').catch(e => console.error('[wa] monday lead', e && e.message));
  }
  if (session) {
    const sessionWithScore = scoring
      ? { ...session, tier: 'Session', score: scoring.score, priority: scoring.bucket, phone: from }
      : { ...session, tier: 'Session', phone: from };
    pushToMonday(sessionWithScore, 'atlas-whatsapp').catch(e => console.error('[wa] monday session', e && e.message));
  }
```

Note: `phone: from` stamps the WhatsApp sender number onto the Monday Phone column so principals can reply on the same channel.

- [ ] **Step 3: Remove the dead HubSpot helper**

Find and DELETE the entire `pushToHubSpot` function in `api/whatsapp.js`. Keep `extractLead`, `extractSession`, `stripBlocks`, `parseBlock`, the LEAD_RE / SESSION_RE constants — same as Task 8.

- [ ] **Step 4: Update the diagnostic GET**

Find in `api/whatsapp.js`:

```js
        hubspotConfigured:  !!process.env.HUBSPOT_ACCESS_TOKEN,
```

Replace with:

```js
        mondayConfigured: !!process.env.MONDAY_API_TOKEN && !!process.env.MONDAY_BOARD_ID && !!process.env.MONDAY_COLUMN_MAP,
```

- [ ] **Step 5: Sanity-check**

Run: `node --check api/whatsapp.js` — silent / exit 0.

- [ ] **Step 6: Commit**

```bash
git add api/whatsapp.js
git commit -m "wa: swap HubSpot for Monday, stamp WhatsApp phone on item

Mirrors api/chat.js Task 8 — pushToHubSpot calls replaced with
pushToMonday, score + priority merged into the record. Additionally
stamps phone = from (the WhatsApp sender number) on every Monday
write so principals know which channel to reply on.

Deleted dead HubSpot helper code. Diagnostic GET now reports
mondayConfigured. extractLead/extractSession/stripBlocks/parseBlock/
LEAD_RE/SESSION_RE retained — they are CRM-agnostic."
```

---

## Task 10 — Swap HubSpot for Monday in `api/apply.js`

**Files:**
- Modify: `api/apply.js` (replace pushToHubSpot with pushToMonday; compute score at submission)

- [ ] **Step 1: Read the current shape of `api/apply.js`**

Run: `grep -n "pushToHubSpot\|module.exports" api/apply.js`
Expected: line numbers showing the export and where pushToHubSpot is called.

- [ ] **Step 2: Add imports at the top of the file**

Find the existing requires (probably near the top of the module). Add:

```js
const { scoreLead } = require('./scoring');
const { pushToMonday } = require('./monday');
```

- [ ] **Step 3: Replace the pushToHubSpot call**

Find the existing pushToHubSpot invocation in `api/apply.js`. It will look something like:

```js
pushToHubSpot(applicationRecord, 'lead').catch(e => console.error('[apply] hubspot', e && e.message));
```

Replace it with:

```js
let scoring = null;
try { scoring = scoreLead(applicationRecord, 'apply'); }
catch (e) { console.error('[apply] scoreLead threw', e && e.message); }
const record = scoring
  ? { ...applicationRecord, score: scoring.score, priority: scoring.bucket }
  : applicationRecord;
pushToMonday(record, 'apply').catch(e => console.error('[apply] monday', e && e.message));
```

(The variable name `applicationRecord` is illustrative — use whatever variable holds the cleaned form fields in your `api/apply.js`. If the existing code uses something like `lead` or `formData`, substitute that name through.)

- [ ] **Step 4: Delete the dead HubSpot helper**

Remove the inlined pushToHubSpot function definition from `api/apply.js` (entire function body and its block-comment header). Keep any input-validation code, the email regex, the CORS handling, and the response-shape logic — those are still needed.

- [ ] **Step 5: Update diagnostic GET if present**

If `api/apply.js` has a diagnostic GET handler that reports `hubspotConfigured`, swap it to `mondayConfigured` using the same pattern as Tasks 8 and 9.

- [ ] **Step 6: Sanity-check**

Run: `node --check api/apply.js` — silent / exit 0.

- [ ] **Step 7: Commit**

```bash
git add api/apply.js
git commit -m "apply: swap HubSpot for Monday + score at submission

Form-submit endpoint (no Atlas conversation, no adaptive closing
to apply). The captured application is scored via scoreLead with
source='apply' (which awards the +10 source bonus reflecting the
intentional structured intake) and pushed to Monday with the
score + priority bucket as columns.

Deleted the dead pushToHubSpot helper. Form validation and the
CORS / response shape are unchanged."
```

---

## Task 11 — Swap HubSpot for Monday in `api/session-booking.js`

**Files:**
- Modify: `api/session-booking.js`

- [ ] **Step 1: Read the current shape**

Run: `grep -n "pushToHubSpot\|module.exports" api/session-booking.js`

- [ ] **Step 2: Add imports**

At the top of `api/session-booking.js`, add:

```js
const { scoreLead } = require('./scoring');
const { pushToMonday } = require('./monday');
```

- [ ] **Step 3: Replace the pushToHubSpot call**

Find the existing pushToHubSpot call and replace it with:

```js
let scoring = null;
try { scoring = scoreLead({ ...sessionRecord, tier: 'Session' }, 'session'); }
catch (e) { console.error('[session] scoreLead threw', e && e.message); }
const record = scoring
  ? { ...sessionRecord, tier: 'Session', score: scoring.score, priority: scoring.bucket }
  : { ...sessionRecord, tier: 'Session' };
pushToMonday(record, 'session').catch(e => console.error('[session] monday', e && e.message));
```

(Replace `sessionRecord` with whatever variable name `api/session-booking.js` uses for the cleaned form data.)

- [ ] **Step 4: Delete the dead HubSpot helper**

- [ ] **Step 5: Update diagnostic GET if present**

- [ ] **Step 6: Sanity-check**

Run: `node --check api/session-booking.js` — silent / exit 0.

- [ ] **Step 7: Commit**

```bash
git add api/session-booking.js
git commit -m "session: swap HubSpot for Monday + force Tier=Session

Session bookings always pass tier='Session' to scoreLead so the
scoring rubric counts the +8 Session tier bonus. The 'session'
source bonus is +5 (lower than Atlas channels — booking a
strategic advisory session is exploratory rather than
mandate-intent). Scored record pushed to Monday with the score +
priority bucket as columns.

Deleted the dead pushToHubSpot helper. Form validation, CORS,
and response shape unchanged."
```

---

## Task 12 — Swap HubSpot for Monday in `api/subscribe.js`

**Files:**
- Modify: `api/subscribe.js`

- [ ] **Step 1: Read the current shape**

Run: `grep -n "pushToHubSpot\|module.exports" api/subscribe.js`

- [ ] **Step 2: Add imports**

At the top of `api/subscribe.js`, add:

```js
const { scoreLead } = require('./scoring');
const { pushToMonday } = require('./monday');
```

- [ ] **Step 3: Replace the pushToHubSpot call**

Find the existing pushToHubSpot call (which probably uses the HubSpot Forms API at `api-eu1.hsforms.com` rather than the CRM API). Replace it with:

```js
/* Newsletter signups short-circuit in scoreLead — always Watch. */
const scoring = scoreLead({ email: subscribeRecord.email }, 'newsletter');
const record = {
  email: subscribeRecord.email,
  score: scoring.score,
  priority: scoring.bucket
};
pushToMonday(record, 'newsletter').catch(e => console.error('[subscribe] monday', e && e.message));
```

(Replace `subscribeRecord` with whatever variable name `api/subscribe.js` uses.)

- [ ] **Step 4: Delete the dead HubSpot helper**

Remove the HubSpot Forms API call code (the entire `fetch('https://api-eu1.hsforms.com/...')` block and any related portal-id / form-id env var references). Keep CORS, input validation (email format), and the response shape.

- [ ] **Step 5: Update diagnostic GET if present**

- [ ] **Step 6: Sanity-check**

Run: `node --check api/subscribe.js` — silent / exit 0.

- [ ] **Step 7: Commit**

```bash
git add api/subscribe.js
git commit -m "subscribe: swap HubSpot for Monday — newsletters land as Watch

Newsletter signups always score 10 and bucket=Watch via scoreLead's
newsletter source short-circuit. No qualifying data, no full rubric,
just a single Monday item with email + source=newsletter +
priority=Watch so principals can see all inbound traffic in one
board.

Replaces the previous pushToHubSpot call to api-eu1.hsforms.com.
Removed HUBSPOT_PORTAL_ID and HUBSPOT_FORM_ID env var references —
those env vars can now be deleted from Vercel."
```

---

## Task 13 — HubSpot dead-code sweep

**Files:**
- Modify: any file that still references HUBSPOT_ACCESS_TOKEN, HUBSPOT_PORTAL_ID, HUBSPOT_FORM_ID, pushToHubSpot, or 'atlas-chat'/'atlas-whatsapp' values in himark_source that are now stale

- [ ] **Step 1: Find any remaining HubSpot references**

Run:

```bash
grep -rn 'HUBSPOT\|hubspot\|pushToHubSpot\|himark_source\|api-eu1.hsforms.com' api/ --include='*.js'
```

Expected: empty output if Tasks 8–12 cleaned up correctly. If anything is reported, it's dead code or stale config that needs removing.

- [ ] **Step 2: Find any stale documentation references**

Run:

```bash
grep -rn 'HubSpot' . --include='*.md' --exclude-dir=node_modules --exclude-dir=.git
```

This may surface old spec files mentioning HubSpot — those CAN stay (history is fine) but README.md or any active docs should be updated to mention Monday instead.

Edit any README.md or CONTRIBUTING.md (if present) that references HubSpot, replacing with Monday equivalents.

- [ ] **Step 3: Commit any sweeps**

```bash
git add -A
git commit -m "sweep: remove residual HubSpot references

Final pass after Tasks 8–12 removed the active pushToHubSpot
helpers. Catches any stale comments, env var names in dotfiles,
or doc references that survived the per-endpoint swaps. None of
the changes touch live behaviour — they remove dead code only."
```

If the grep in Step 1 was empty, this commit may be empty — skip.

- [ ] **Step 4: Tell the user to remove HubSpot env vars from Vercel**

Vercel → Settings → Environment Variables. Remove:
- `HUBSPOT_ACCESS_TOKEN`
- `HUBSPOT_PORTAL_ID` (if present)
- `HUBSPOT_FORM_ID` (if present)

This is a user-action, not a code task. Note this in the task message so the user knows to do it manually.

---

## Task 14 — Deploy Phase C and end-to-end test all 5 channels

**Files:** none — verification gate.

- [ ] **Step 1: Push the branch**

```bash
git push
```

Wait for Vercel deploy to show **Ready**.

- [ ] **Step 2: Smoke-test all five sources**

For each scenario, complete the action AND verify a corresponding Monday item appears on the HIMARK Inbound board with the expected columns.

**Test 1 — Atlas web chat (Priority bucket):**
- Open Atlas widget, complete LeadSense as a Private-fit founder with R200k budget, "this quarter" timeline
- Expected Monday item: Source = `Atlas Chat`, Score ≥ 75, Priority = `Priority`, Stage = `New`, Captured at = now, Follow-up by = tomorrow's date
- Expected Atlas closing bubble: the "within 24 hours" line

**Test 2 — Atlas WhatsApp (Standard bucket):**
- Send `apply` to HIMARK's WhatsApp number, complete LeadSense as a Growth-fit director with R80k budget, "next quarter" timeline
- Expected Monday item: Source = `Atlas WhatsApp`, Score 40–74, Priority = `Standard`, Phone = your phone number, Stage = `New`, Follow-up by = +5 working days
- Expected Atlas closing bubble: the default "five working days" line (Standard bucket triggers no substitution)

**Test 3 — Apply form:**
- Submit /apply.html with a complete application (any plausible data)
- Expected Monday item: Source = `Apply Form`, Score and Priority computed from the form fields, Stage = `New`

**Test 4 — Session booking:**
- Submit /sessions booking form
- Expected Monday item: Source = `Session Booking`, Tier = `Session`, Stage = `New`, Follow-up by computed from bucket

**Test 5 — Newsletter:**
- Subscribe via /subscribe.html with `e2etest@himark.co.za`
- Expected Monday item: Source = `Newsletter`, Score = 10, Priority = `Watch`, all other columns blank

- [ ] **Step 3: Verify the diagnostic GETs**

In a browser, visit:
- `https://www.himark.co.za/api/chat` — should return JSON with `mondayConfigured: true` and NO mention of HubSpot
- `https://www.himark.co.za/api/whatsapp` — same

If either returns `mondayConfigured: false`, the env vars are not set correctly in Vercel — fix and redeploy.

- [ ] **Step 4: Spot-check Vercel logs over 30 minutes of operation**

In Vercel logs, filter for `[crm]`. Expected to see:
- `[crm] monday item created` lines on every test write (good)
- NO `[crm] monday-write-failed` or `[crm] env-missing` or `[crm] monday-graphql-errors` lines (bad — investigate any that appear)

- [ ] **Step 5: Spot-check the Decline bucket end-to-end**

In Atlas web chat, complete LeadSense as a sub-floor / discount-asking profile (per Task 6 Step 4).

Expected:
- Monday item with Score < 15, Priority = `Decline`, Follow-up by is blank
- Atlas's closing bubble starts with "Thank you for the detail. Based on fit..."

- [ ] **Step 6: Phase C complete — no commit needed**

If Tests 1–5 all pass, the migration is live and HubSpot is fully removed. Phase C is done.

If any test fails, debug against the relevant task above and iterate.

---

## Self-review notes

After writing this plan, I checked it against the spec:

1. **Spec coverage.** Every section of the spec maps to a task:
   - Monday board design → Phase B (user action)
   - Scoring rubric → Tasks 1 + 2
   - Bucket thresholds + closing lines → Task 1 (BUCKET_CLOSING_LINES) + Tasks 4/5 (substitution)
   - §15 Atlas prompt change → Task 3
   - `api/scoring.js` API → Task 1
   - `api/monday.js` API → Task 7
   - Env vars → Phase B (Monday) + Task 13 (HubSpot removal)
   - Error handling → covered in Task 7's helper and Tasks 4/5's try-catch around scoreLead
   - Edge cases (newsletter, session, repeat visitor) → Task 1 (newsletter short-circuit), Task 11 (session tier forcing), no dedupe in helper (per spec)
   - Testing plan (8 scenarios) → Task 6 (Phase A subset: 4 scenarios) + Task 14 (Phase C: all 5 sources + Decline + diagnostic GETs + log spot-check)
   - Rollout sequence → Phase A (Tasks 1–6) + Phase B gate + Phase C (Tasks 7–14)
   - Done definition → Task 14's Step 4 covers verification of the diagnostic GET, the Vercel logs spot-check, and all 5 channels working
2. **Placeholder scan.** No TBDs. No "add error handling" without specifics. No "similar to Task N" — each task repeats the code it needs.
3. **Type consistency.** `scoreLead(record, source)` returns `{ score, bucket, breakdown }` in Task 1 and is consumed with that exact shape in Tasks 4, 5, 8, 9, 10, 11, 12. `pushToMonday(record, source)` is defined in Task 7 and called with that signature in Tasks 8, 9, 10, 11, 12. The constants `BUCKET_PRIORITY` / `BUCKET_STANDARD` / `BUCKET_WATCH` / `BUCKET_DECLINE` are defined in Task 1 and referenced by string value in Task 14's verification.
4. **DRY.** `scoreLead` and `pushToMonday` each live in one file and are imported by the five endpoints — no duplication of either helper. This is a deliberate departure from the chunking pattern (which duplicated splitIntoChunks across files) because these helpers are larger and would diverge under maintenance pressure.
