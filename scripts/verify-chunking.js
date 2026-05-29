/* HIMARK · Chunking helper verification
   No test framework on this project — this script exercises the
   splitIntoChunks() pure function with several representative inputs
   and prints actual vs expected. Run with `node scripts/verify-chunking.js`.
   Any mismatch is reported as FAIL on stderr with a non-zero exit. */

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

const cases = [
  {
    name: 'single sentence — one chunk',
    input: 'Got it.',
    expectedChunks: ['Got it.']
  },
  {
    name: 'two paragraphs — two chunks',
    input: 'Atlas here, hey.\n\nHIMARK is a strategic growth consultancy.',
    expectedChunks: ['Atlas here, hey.', 'HIMARK is a strategic growth consultancy.']
  },
  {
    name: 'three paragraphs — three chunks',
    input: 'Atlas here, hey.\n\nWe are a consultancy.\n\nWhat brought you over?',
    expectedChunks: ['Atlas here, hey.', 'We are a consultancy.', 'What brought you over?']
  },
  {
    name: 'four paragraphs — capped at three chunks',
    input: 'one\n\ntwo\n\nthree\n\nfour',
    expectedChunks: ['one', 'two', 'three']
  },
  {
    name: 'paragraph with extra whitespace — trimmed',
    input: '  hello  \n\n  world  ',
    expectedChunks: ['hello', 'world']
  },
  {
    name: 'empty paragraphs filtered',
    input: 'one\n\n\n\ntwo',
    expectedChunks: ['one', 'two']
  },
  {
    name: 'empty input — empty array',
    input: '',
    expectedChunks: []
  }
];

let failed = 0;
for (const c of cases) {
  const actual = splitIntoChunks(c.input);
  const ok = JSON.stringify(actual) === JSON.stringify(c.expectedChunks);
  console.log((ok ? 'PASS ' : 'FAIL ') + c.name);
  if (!ok) {
    console.error('  expected:', JSON.stringify(c.expectedChunks));
    console.error('  actual:  ', JSON.stringify(actual));
    failed++;
  }
}

const pauseCases = [
  { next: '', expected: 400 },
  { next: 'short', expected: 440 },                    // 400 + 5*8
  { next: 'a'.repeat(50), expected: 800 },             // 400 + 400
  { next: 'a'.repeat(140), expected: 1500 },           // 400 + 1120 = 1520 → capped at 1500
  { next: 'a'.repeat(500), expected: 1500 }            // way over → 1500 cap
];
for (const p of pauseCases) {
  const got = chunkPauseMs(p.next);
  const ok = got === p.expected;
  console.log((ok ? 'PASS ' : 'FAIL ') + 'pauseMs len=' + p.next.length);
  if (!ok) {
    console.error('  expected:', p.expected, 'got:', got);
    failed++;
  }
}

if (failed) {
  console.error('\n' + failed + ' case(s) failed.');
  process.exit(1);
}
console.log('\nAll cases passed.');
