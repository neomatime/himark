/* HIMARK · LeadSense scoring verification
   ============================================================
   No test framework on this project — this script exercises
   scoreLead() with 15 representative leads covering all four
   buckets and the major individual signal contributions.

   Run with `node scripts/verify-scoring.js`.
   Same pattern as scripts/verify-chunking.js.
   Any mismatch prints FAIL and exits non-zero.
   ============================================================ */

const {
  scoreLead,
  BUCKET_PRIORITY,
  BUCKET_STANDARD,
  BUCKET_WATCH,
  BUCKET_DECLINE
} = require('../api/scoring');

const cases = [

  /* ── Single-signal isolation ──────────────────────────────── */

  {
    name: 'Private tier alone — 25 pts, no other signals',
    record: { tier: 'Private', role: '', budget: '', timeline: '', brief: '' },
    source: 'session',
    /* 25 (tier) + 5 (undisclosed budget) + 0 + 0 + 0 + 5 (source) = 35 */
    expectMin: 35, expectMax: 35, expectBucket: BUCKET_WATCH
  },
  {
    name: 'Growth tier alone — 20 pts',
    record: { tier: 'Growth', role: '', budget: '', timeline: '', brief: '' },
    source: 'session',
    /* 20 + 5 + 0 + 0 + 0 + 5 = 30 */
    expectMin: 30, expectMax: 30, expectBucket: BUCKET_WATCH
  },
  {
    name: 'Signature tier alone — 12 pts',
    record: { tier: 'Signature', role: '', budget: '', timeline: '', brief: '' },
    source: 'session',
    /* 12 + 5 + 0 + 0 + 0 + 5 = 22 */
    expectMin: 22, expectMax: 22, expectBucket: BUCKET_WATCH
  },
  {
    name: 'Session tier alone — 8 pts',
    record: { tier: 'Session', role: '', budget: '', timeline: '', brief: '' },
    source: 'session',
    /* 8 + 5 + 0 + 0 + 0 + 5 = 18 */
    expectMin: 18, expectMax: 18, expectBucket: BUCKET_WATCH
  },

  /* ── Role seniority signal ────────────────────────────────── */

  {
    name: 'Founder role — +15 pts',
    record: { tier: '', role: 'Founder', budget: '', timeline: '', brief: '' },
    source: 'session',
    /* 0 + 5 + 0 + 15 + 0 + 5 = 25 */
    expectMin: 25, expectMax: 25, expectBucket: BUCKET_WATCH
  },
  {
    name: 'CMO role — +12 pts',
    record: { tier: '', role: 'CMO', budget: '', timeline: '', brief: '' },
    source: 'session',
    /* 0 + 5 + 0 + 12 + 0 + 5 = 22 */
    expectMin: 22, expectMax: 22, expectBucket: BUCKET_WATCH
  },
  {
    name: 'Director role — +10 pts',
    record: { tier: '', role: 'Director of Marketing', budget: '', timeline: '', brief: '' },
    source: 'session',
    /* 0 + 5 + 0 + 10 + 0 + 5 = 20 */
    expectMin: 20, expectMax: 20, expectBucket: BUCKET_WATCH
  },

  /* ── Budget alignment ─────────────────────────────────────── */

  {
    name: 'Budget within tier floor (Private R200k) — +15',
    record: { tier: 'Private', role: '', budget: 'R200,000', timeline: '', brief: '' },
    source: 'session',
    /* 25 + 15 + 0 + 0 + 0 + 5 = 45 */
    expectMin: 45, expectMax: 45, expectBucket: BUCKET_STANDARD
  },
  {
    name: 'Budget in lower band (Private R130k, 80-99% of floor) — +10',
    record: { tier: 'Private', role: '', budget: 'R130,000', timeline: '', brief: '' },
    source: 'session',
    /* 25 + 10 + 0 + 0 + 0 + 5 = 40 */
    expectMin: 40, expectMax: 40, expectBucket: BUCKET_STANDARD
  },

  /* ── Penalty cases ────────────────────────────────────────── */

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
    /* 25 + (−10) + 15 + 15 (CEO) + 0 + 8 = 53 */
    expectMin: 53, expectMax: 53, expectBucket: BUCKET_STANDARD
  },
  {
    name: 'RFP brief phrase — applies −15 penalty',
    record: { tier: 'Growth', role: 'CMO', budget: 'R100,000', timeline: 'this quarter', brief: 'Please send a proposal for our Q3 campaign.' },
    source: 'atlas-chat',
    /* 20 + 15 + 15 + 12 + 0 (brief 44 chars, under 50 threshold) + 8 − 15 (proposal phrase) = 55 */
    expectMin: 55, expectMax: 55, expectBucket: BUCKET_STANDARD
  },
  {
    name: 'Discount request — applies −10 penalty',
    record: { tier: 'Signature', role: 'Manager', budget: 'R60,000', timeline: '', brief: 'Can you give a discount on the rate?' },
    source: 'atlas-chat',
    /* 12 + 15 + 0 + 5 + 0 (brief 37 chars, under 50 threshold) + 8 − 10 (discount) = 30 */
    expectMin: 30, expectMax: 30, expectBucket: BUCKET_WATCH
  },

  /* ── Long rich brief bonus ────────────────────────────────── */

  {
    name: 'Long brief with commercial keyword — +10 brief bonus',
    record: { tier: 'Private', role: 'Founder', budget: 'R200,000', timeline: 'this quarter', brief: 'We are a Series A SaaS business targeting mid-market. Pipeline growth has stalled at the top-of-funnel and we need a positioning reset to reaccelerate revenue ahead of our Series B in 18 months.' },
    source: 'apply',
    /* 25 + 15 + 15 + 15 + 10 (long + keyword) + 10 (apply) = 90 */
    expectMin: 90, expectMax: 90, expectBucket: BUCKET_PRIORITY
  },

  /* ── Newsletter short-circuit ─────────────────────────────── */

  {
    name: 'Newsletter source — always returns score 10, Watch bucket',
    record: { tier: 'Private', role: 'Founder', budget: 'R500,000', timeline: 'this quarter', brief: 'High-value founder with large budget.' },
    source: 'newsletter',
    expectMin: 10, expectMax: 10, expectBucket: BUCKET_WATCH
  }

];

let failed = 0;

for (const c of cases) {
  const result = scoreLead(c.record, c.source);
  const scoreOk  = result.score >= c.expectMin && result.score <= c.expectMax;
  const bucketOk = result.bucket === c.expectBucket;
  const ok = scoreOk && bucketOk;

  console.log((ok ? 'PASS ' : 'FAIL ') + c.name);

  if (!ok) {
    if (!scoreOk) {
      console.error('  score expected: ' + c.expectMin + '-' + c.expectMax + '  got: ' + result.score);
    }
    if (!bucketOk) {
      console.error('  bucket expected: ' + c.expectBucket + '  got: ' + result.bucket);
    }
    console.error('  breakdown: ' + JSON.stringify(result.breakdown));
    failed++;
  }
}

if (failed) {
  console.error('\n' + failed + ' case(s) failed.');
  process.exit(1);
}
console.log('\nAll ' + cases.length + ' cases passed.');
