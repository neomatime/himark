/* HIMARK · LeadSense scoring verification
   No test framework on this project — this script exercises
   scoreLead() against 15 fixture leads spanning all four buckets
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
    /* 25 (tier) + 5 (undisclosed budget default) + 8 (source) = 38 → Watch */
    expectMin: 25 + 5 + 8, expectMax: 25 + 5 + 8, expectBucket: BUCKET_WATCH
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
    /* 25 (tier) + 15 (budget within) + 0 (timeline) + 15 (CEO — founder tier) + 0 (brief) + 8 (source) − 5 (free email on Private) = 58 */
    expectMin: 58, expectMax: 58, expectBucket: BUCKET_STANDARD
  },
  {
    name: 'Below-floor budget — −10 penalty applies even with strong tier',
    record: { tier: 'Private', role: 'CEO', budget: 'R30,000', timeline: 'this quarter', brief: '' },
    source: 'atlas-chat',
    /* 25 + (−10) + 15 + 15 (CEO — founder tier) + 0 + 8 = 53 */
    expectMin: 53, expectMax: 53, expectBucket: BUCKET_STANDARD
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
