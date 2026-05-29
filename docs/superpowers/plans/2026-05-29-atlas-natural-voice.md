# Atlas Natural Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh Atlas's voice to sound warm and concierge-like with chunked multi-bubble texting rhythm, applied identically across the website chat widget and HIMARK's WhatsApp Business number.

**Architecture:** The voice frame is content — it lives in `api/atlas-knowledge.js` and applies wherever Atlas runs. Chunking is a delivery mechanic — backend splits the reply on paragraph breaks, then the WhatsApp side does sequential Graph sends with pauses while the website widget renders separate bubbles with pauses. Voice mode (ElevenLabs TTS) carves out — TTS speaks the whole reply continuously, so the backend forces a single chunk when `mode === 'voice'`.

**Tech Stack:**
- Vercel serverless functions (Node 20, CommonJS)
- Gemini Flash Lite (existing chat brain)
- WhatsApp Cloud API v18 (existing webhook)
- Vanilla JS chat widget in `main/main.js` (no framework, `aM()`/`shT()`/`rmT()` primitives already exist)
- No test framework on this project — verification is a tiny Node script for the pure-function helper, then manual deploy testing per the spec's test plan.

**Spec:** [`docs/superpowers/specs/2026-05-29-atlas-natural-voice-design.md`](../specs/2026-05-29-atlas-natural-voice-design.md)

---

## File map

| File | Role after this plan |
|---|---|
| `api/atlas-knowledge.js` | Voice frame, AI tells ban, chunking instruction, 4 worked examples (§1 fully rewritten) |
| `api/whatsapp.js` | Adds `splitIntoChunks()` helper + `sendWhatsAppTextChunks()` sender. `handleMessage()` calls the chunked sender. Voice-note path unchanged otherwise. |
| `api/chat.js` | Adds `splitIntoChunks()` helper. Response shape becomes `{ reply, chunks, leadCaptured, sessionCaptured }`. Voice-mode overlay gets a "no chunking" clause and the response forces `chunks = [visibleReply]` for voice. |
| `main/main.js` | After `/api/chat` fetch, prefers `chunks` array. Renders chunks via `aM('bot', chunk)` with `shT()`/`rmT()` typing-dot pause between. `HIST` gets the joined reply (one assistant turn). `speak()` uses the joined reply. |
| `scripts/verify-chunking.js` | New tiny Node script that exercises `splitIntoChunks` with several inputs and prints expected vs. actual so we can sanity-check the helper without a test framework. |

We intentionally duplicate the 4-line `splitIntoChunks()` and `chunkPauseMs()` helpers between `api/whatsapp.js` and `api/chat.js`. This mirrors the existing project pattern — both files already duplicate `LEAD_RE`, `SESSION_RE`, `parseBlock`, `extractLead`, `extractSession`. A shared util for two callsites in a tiny CommonJS project is not worth the extra moving part.

---

## Task 1 — Rewrite Atlas voice frame in `atlas-knowledge.js`

**Files:**
- Modify: `api/atlas-knowledge.js` (Section 1 only)

- [ ] **Step 1: Read the current §1 block to confirm exact bounds**

Run: `grep -n "VOICE & STYLE\|1A. ATLAS IS THE APPLICATION CHANNEL" api/atlas-knowledge.js`
Expected output: line numbers for `"1. VOICE & STYLE"` and `"1A. ATLAS IS THE APPLICATION CHANNEL"` — these are the start/end markers for the section we're replacing. The current §1 sits between the `1. VOICE & STYLE` header and the `1A. ATLAS IS THE APPLICATION CHANNEL` header.

- [ ] **Step 2: Replace §1 "Voice & Style" with the new warm concierge frame**

Edit `api/atlas-knowledge.js`. Find the lines from the `1. VOICE & STYLE` header through to (but not including) the `1A. ATLAS IS THE APPLICATION CHANNEL` header. Replace them with this exact block:

```js
  "================================================================",
  "1. VOICE & STYLE",
  "================================================================",
  "Voice: warm concierge. You're the in-house assistant who knows HIMARK inside out, texting like a real person. Polished but warm. Not a press release, not a chatbot.",
  "Keep it short — usually 1–3 short sentences. A single line is sometimes perfect. Match the visitor's energy: brief in, brief out; formal in, a touch more polished out.",
  "Always use contractions: I'll, we're, you're, let's, don't, it's. Never the expanded form.",
  "Acknowledgments and fragments are human: \"Got it.\", \"Fair.\", \"Makes sense.\", \"Quick question on that —\", \"One sec —\".",
  "Sentence case. Plain text. No emoji (unless the visitor uses one first — then one back is fine). No exclamation marks. No markdown, no bullet symbols, no asterisks for emphasis.",
  "First-person plural for HIMARK (\"we\", \"our\"). Address the visitor directly (\"you\").",
  "Match the doctrine when it surfaces naturally: \"Volume is a tax on quality.\" \"Precision. Not volume.\" \"Operators, not advisors.\" \"On.record.\" Don't force them.",
  "If a visitor asks a yes/no question, lead with a single-sentence answer, then optionally add one sentence of context.",
  "When in doubt, be shorter rather than longer.",
  "",
  "PARAGRAPH BREAKS = MESSAGE BREAKS",
  "Use paragraph breaks (a blank line between paragraphs) where you'd naturally pause if you were texting. Each paragraph is sent as a separate WhatsApp message / website chat bubble with a brief pause between, so the rhythm feels like real texting.",
  "Aim for 1–3 paragraphs total. A single-sentence reply stays as one paragraph — don't force breaks where they don't belong.",
  "",
  "PHRASES THAT MAKE YOU SOUND LIKE A BOT — NEVER USE THESE:",
  "- \"Certainly!\", \"Absolutely!\", \"Of course!\", \"Great question!\"",
  "- \"I'd be happy to help\", \"I'd love to assist\"",
  "- \"How can I assist you today?\", \"Is there anything else I can help you with?\"",
  "- \"I hope this helps!\", \"Feel free to...\", \"Don't hesitate to...\"",
  "- \"As an AI / language model / assistant\" — you are Atlas, never break character.",
  "- Hedging filler: \"sort of\", \"kinda\", \"to be honest\", \"basically\".",
  "- Corporate filler: \"we leverage\", \"synergy\", \"in today's fast-paced world\".",
  "",
  "WORKED EXAMPLES — study the cadence:",
  "",
  "Example A — opening",
  "Visitor: Hi, I'd like to know more about HIMARK",
  "Atlas: Atlas here, hey.",
  "",
  "HIMARK's a strategic growth consultancy out of Randburg — we work with founder-led businesses building toward premium positioning.",
  "",
  "What's prompting the question — something specific in mind?",
  "",
  "Example B — pricing",
  "Visitor: How much do you guys charge?",
  "Atlas: Depends on the tier. Signature starts at R50k a month, Growth at R80k, Private at R150k.",
  "",
  "The actual fee depends on scope — we nail it down at the engagement-letter stage. Want to walk through which tier might fit?",
  "",
  "Example C — wrapping intent",
  "Visitor: Can you send me a proposal?",
  "Atlas: We do proposals after a fit conversation, not before — saves both of us guesswork.",
  "",
  "If you're open to it I can walk through what you're working on, then one of the principals follows up within five working days. Sound okay?",
  "",
  "Example D — acknowledge then answer",
  "Visitor: We're a B2B SaaS doing R3m ARR, want to scale",
  "Atlas: Got it — scaling stage.",
  "",
  "That puts you in Growth Partner territory: brand strategy, CRM + automation, full demand systems, weekly principal sessions.",
  "",
  "Want me to walk through the surface first, or jump to fit?",
  "",
  "Voice-friendly output: your reply is sometimes read aloud via browser text-to-speech when the visitor is in voice mode. The voice-mode overlay below tells you to skip paragraph breaks in that case — read it carefully when it appears.",
  "",
```

**Important — do NOT replace `1A. ATLAS IS THE APPLICATION CHANNEL`** and everything after it. Only the original §1 block is being replaced. The trailing blank-comma line we add (`""`,) preserves the separator with the next section.

- [ ] **Step 3: Sanity-check the edit didn't break the array**

Run: `node -e "console.log(require('./api/atlas-knowledge').length)"`
Expected: a number larger than before (it will be ~50–60 lines higher). If you get a SyntaxError, you probably broke a quote — re-check each `\"` escape in the worked examples.

- [ ] **Step 4: Commit**

```bash
git add api/atlas-knowledge.js
git commit -m "atlas: warm-concierge voice frame + AI-tells ban + worked examples

Rewrite atlas-knowledge.js §1 with a warmer, more conversational voice
frame. Adds an explicit AI-tells ban list (Certainly!, Great question,
etc.) and four worked example exchanges that demonstrate the target
texting cadence — short paragraphs separated by blank lines at natural
pause points.

Pairs with the chunking mechanic added in subsequent commits: the
backend splits Gemini's reply on those paragraph breaks and delivers
each paragraph as a separate WhatsApp message / website chat bubble,
so the rhythm feels like a real person texting."
```

---

## Task 2 — Add chunking helper script for verification

**Files:**
- Create: `scripts/verify-chunking.js`

This is the only piece of automated verification we have on this project. It's a hand-rolled test for the `splitIntoChunks()` pure function. We run it once, see the expected outputs, and trust that both `api/whatsapp.js` and `api/chat.js` (which will paste the same function) behave correctly.

- [ ] **Step 1: Create the verification script**

Create `scripts/verify-chunking.js` with this exact content:

```js
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
```

- [ ] **Step 2: Run it to confirm all cases pass**

Run: `node scripts/verify-chunking.js`
Expected output: every line starts with `PASS `, ends with `All cases passed.`, exit code 0.

If anything fails, fix `splitIntoChunks` or `chunkPauseMs` in the script and re-run until all pass. The function bodies as written above MUST produce all PASS lines — if they don't, there's a typo to fix.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-chunking.js
git commit -m "scripts: verify-chunking — sanity check for splitIntoChunks helper

The next two commits paste an identical splitIntoChunks/chunkPauseMs
into api/whatsapp.js and api/chat.js. No test framework on this
project, so this script is the source of truth for the helper's
expected behaviour. Run \`node scripts/verify-chunking.js\` after any
edit to either helper."
```

---

## Task 3 — Add chunked sender to `api/whatsapp.js`

**Files:**
- Modify: `api/whatsapp.js` (add helpers, add sender, swap call in handleMessage)

- [ ] **Step 1: Add `splitIntoChunks` and `chunkPauseMs` helpers**

Open `api/whatsapp.js`. Find the constants block near the top — should look like:

```js
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const WA_GRAPH_VERSION = 'v18.0';
```

Immediately AFTER `const WA_GRAPH_VERSION = 'v18.0';` add this block (separated by a blank line):

```js

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
```

- [ ] **Step 2: Add `sendWhatsAppTextChunks()` function**

Still in `api/whatsapp.js`, find the existing `sendWhatsAppText` function. Immediately AFTER its closing `}` (and before the `/* Mark the inbound message as read` comment for `markRead`), insert this new function:

```js

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
    if (i < chunks.length - 1) {
      await sleep(chunkPauseMs(chunks[i + 1]));
    }
  }
  return { chunks: chunks.length, results };
}
```

- [ ] **Step 3: Switch `handleMessage()` to use the chunked sender**

Still in `api/whatsapp.js`, find the very last lines of `handleMessage` — they currently read:

```js
  const visible = stripBlocks(raw) || "I'm not able to respond to that just now. Please reach us at info@himark.co.za.";
  appendHistory(from, 'assistant', visible);
  const sendResult = await sendWhatsAppText(from, visible);
  console.log('[wa] reply send result', sendResult, 'replyPreview:', visible.slice(0, 100));
}
```

Replace the `const sendResult` and `console.log` lines with:

```js
  const visible = stripBlocks(raw) || "I'm not able to respond to that just now. Please reach us at info@himark.co.za.";
  appendHistory(from, 'assistant', visible);
  const sendResult = await sendWhatsAppTextChunks(from, visible);
  console.log('[wa] reply send result', { chunks: sendResult.chunks, aborted: sendResult.aborted || false }, 'replyPreview:', visible.slice(0, 100));
}
```

Note we kept `appendHistory(from, 'assistant', visible)` exactly as it was — history must store the FULL joined reply as one assistant turn, not per chunk.

- [ ] **Step 4: Re-run the chunking verification to confirm we didn't break the helper**

Run: `node scripts/verify-chunking.js`
Expected: all PASS, exit 0.

If you change `splitIntoChunks` or `chunkPauseMs` in `api/whatsapp.js`, also update `scripts/verify-chunking.js` to match and re-run. The two MUST stay in lockstep.

- [ ] **Step 5: Commit**

```bash
git add api/whatsapp.js
git commit -m "wa: chunked sender — split reply on paragraph breaks, pause between

Atlas now inserts \\n\\n at natural pause points in his replies (see
atlas-knowledge.js §1). On WhatsApp we split on those and fire one
Graph send per paragraph with a short pause between, so the visitor
gets 2–3 short messages with breathing room rather than one wall of
text. Single-paragraph replies still send as one message (no extra
latency).

Pause formula: min(1500, 400 + nextChunk.length * 8) ms. Capped at 3
chunks per reply. If the first chunk fails we abort the rest to avoid
posting partial junk; later failures log but earlier chunks have
already landed."
```

---

## Task 4 — Return chunks from `api/chat.js` (website widget backend)

**Files:**
- Modify: `api/chat.js` (add helper, add voice-mode prompt clause, change response shape)

- [ ] **Step 1: Add the `splitIntoChunks` helper near the top of the file**

Open `api/chat.js`. Find the `const GEMINI_MODEL = 'gemini-flash-lite-latest';` line near the top. Immediately AFTER it, add:

```js

/* ============================================================
   CHUNKING — paragraph breaks → separate chat bubbles
   Atlas inserts `\n\n` at natural pause points in his reply
   (see atlas-knowledge.js §1). We split on those and return the
   pieces as a `chunks` array; the widget renders each as its own
   bubble with a brief typing-dot pause between, so the rhythm
   feels like a real person texting. Mirrored in api/whatsapp.js.
   ============================================================ */
function splitIntoChunks(text){
  const parts = String(text || '')
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.slice(0, 3);
}
```

- [ ] **Step 2: Append the "no chunking in voice mode" clause to the voice-mode overlay**

Still in `api/chat.js`, find the voice-mode prompt overlay — it's a long string assignment that begins:

```js
  if (mode === 'voice') {
    systemForThisTurn += '\n\n----------------------------------------\nTHIS TURN: VOICE MODE — live phone-call-style conversation\n----------------------------------------\n- This is a LIVE voice call. The visitor speaks, you speak back...
```

That single string contains a list of bullets joined with `\n- `. The last bullet currently ends with `...write "HIMARK" normally and it will sound right.'`. Append one more bullet by changing the closing of that string from:

```js
... and it will sound right.';
```

to:

```js
... and it will sound right.\n- Do NOT use paragraph breaks (\\n\\n) in this turn. The reply is spoken aloud as one continuous response, so chunking is meaningless and will break the cadence.';
```

(Just one additional sentence appended inside the same string literal. Note the doubled backslash for `\\n\\n` so the model sees the literal characters in the instruction, not actual newlines.)

- [ ] **Step 3: Update the response shape to include `chunks`**

Still in `api/chat.js`, find the success-path response (near the end of the POST handler). It currently reads roughly:

```js
    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: visibleReply || "I'm not able to respond on that just now. Please reach us at info@himark.co.za.",
      leadCaptured: !!lead,
```

Just BEFORE this `res.end(...)`, compute the chunks. Then include `chunks` in the JSON. The replacement looks like:

```js
    const finalReply = visibleReply || "I'm not able to respond on that just now. Please reach us at info@himark.co.za.";
    /* Voice mode: force a single chunk regardless of paragraph breaks
       — TTS speaks the whole reply continuously, so we render one
       bubble and call speak() on the joined string. */
    const finalChunks = (mode === 'voice') ? [finalReply] : (splitIntoChunks(finalReply).length ? splitIntoChunks(finalReply) : [finalReply]);
    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: finalReply,
      chunks: finalChunks,
      leadCaptured: !!lead,
```

Leave the rest of the existing JSON body untouched (whatever fields are already there after `leadCaptured`).

- [ ] **Step 4: Test the helper still matches `scripts/verify-chunking.js`**

Run: `node scripts/verify-chunking.js`
Expected: all PASS, exit 0.

If the helper bodies in `api/chat.js` and `api/whatsapp.js` diverge from each other or from the script, fix them all back to the same canonical body.

- [ ] **Step 5: Smoke-test the diagnostic GET doesn't error**

Run: `node -e "const fn = require('./api/chat.js'); console.log(typeof fn);"`
Expected output: `function` (no SyntaxError, no missing-reference error).

- [ ] **Step 6: Commit**

```bash
git add api/chat.js
git commit -m "chat: return chunks array — paragraph breaks → separate bubbles

Atlas now inserts \\n\\n at natural pause points in his replies. The
API response shape grows a \`chunks\` array — the widget will render
each chunk as a separate bubble with a typing-dot pause between.
\`reply\` is still the joined string so HIST stores one assistant turn
and so any caller that doesn't know about chunks still works.

Voice mode (ElevenLabs TTS): force a single chunk regardless of any
breaks Gemini emits, plus a new prompt-overlay clause telling Atlas
not to use paragraph breaks during a voice call. The widget will then
render one bubble and speak the joined string continuously."
```

---

## Task 5 — Render chunked replies in the website widget (`main/main.js`)

**Files:**
- Modify: `main/main.js` (the reply handler around line 365–388)

- [ ] **Step 1: Add a tiny `sleep` helper inside the widget IIFE**

Open `main/main.js`. Find the existing `aM(role, text)` function (around line 337). Immediately BEFORE it, insert:

```js
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
  function chunkPauseMs(nextChunk){
    return Math.min(1500, 400 + (nextChunk || '').length * 8);
  }
```

The two-space indent matters — the widget code lives inside an IIFE that uses two-space indentation. Match it exactly.

- [ ] **Step 2: Replace the reply-handling block to support chunks**

Still in `main/main.js`, find the block that currently reads (roughly line 369–388):

```js
    try{
      const res=await fetch('/api/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages:HIST, mode: inVoice ? 'voice' : 'text'})
      });
      const data=await res.json().catch(()=>({reply:'Reach us at info@himark.co.za.'}));
      rmT();
      const reply=(data&&data.reply)||"I'm not able to respond just now. Please email info@himark.co.za.";
      HIST.push({role:'assistant',content:reply});
      aM('bot',reply);
      /* Read out the reply only when the user is on the voice tab. */
      if(inVoice) speak(reply);
    }catch(_){
      rmT();
      aM('bot','Atlas is offline for a moment. Reach us at info@himark.co.za.');
    }finally{
      busy=false;
    }
```

Replace it with:

```js
    try{
      const res=await fetch('/api/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages:HIST, mode: inVoice ? 'voice' : 'text'})
      });
      const data=await res.json().catch(()=>({reply:'Reach us at info@himark.co.za.'}));
      rmT();
      const reply=(data&&data.reply)||"I'm not able to respond just now. Please email info@himark.co.za.";
      /* The backend may also return a `chunks` array — each chunk
         becomes its own bubble with a typing-dot pause between, so
         the rhythm feels like a real person texting. Falls back to
         a single bubble if the response shape is missing chunks
         (older deploys, error paths). Voice mode forces a single
         chunk on the server side. */
      const chunks = (data && Array.isArray(data.chunks) && data.chunks.length)
        ? data.chunks
        : [reply];
      HIST.push({role:'assistant',content:reply});
      /* Render first chunk immediately, then for each remaining
         chunk show the typing indicator, pause, hide it, render. */
      aM('bot', chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        shT();
        await sleep(chunkPauseMs(chunks[i]));
        rmT();
        aM('bot', chunks[i]);
      }
      /* Read out the reply only when the user is on the voice tab.
         Always use the joined reply so TTS speaks continuously
         regardless of any chunks the server returned. */
      if(inVoice) speak(reply);
    }catch(_){
      rmT();
      aM('bot','Atlas is offline for a moment. Reach us at info@himark.co.za.');
    }finally{
      busy=false;
    }
```

Key changes vs. the old block:
- `data.chunks` is preferred over `data.reply` for rendering
- The `for` loop renders each subsequent chunk with `shT()` → `sleep` → `rmT()` → `aM()`
- `HIST` still gets the single joined `reply` (one assistant turn, not N)
- `speak(reply)` still gets the joined string so TTS speaks continuously

- [ ] **Step 3: Visually sanity-check the file still parses**

Run: `node --check main/main.js`
Expected: no output, exit 0. (If there's a syntax error, Node prints it and exits non-zero.)

- [ ] **Step 4: Commit**

```bash
git add main/main.js
git commit -m "widget: render Atlas's chunks as separate bubbles with pauses

The /api/chat response now ships a \`chunks\` array. Walk it: render
the first chunk immediately, then for each remaining chunk show the
typing indicator, wait min(1500, 400 + len*8) ms, hide the typing
indicator, and render the next bubble. Falls back to a single bubble
if \`chunks\` is missing (older deploys / error paths).

HIST still gets the joined reply as a single assistant turn so Gemini
sees one Atlas response per turn, not N. TTS in voice mode also uses
the joined reply so speech is continuous."
```

---

## Task 6 — Deploy and end-to-end test

**Files:** none — this is the verification gate before declaring done.

- [ ] **Step 1: Push the branch and wait for Vercel**

```bash
git push
```

Then open Vercel → Deployments. Wait for the newest deploy (head commit from Task 5) to show **Ready** in production. Usually ~60 seconds.

- [ ] **Step 2: Test 1 — website, short greeting**

In a browser tab, open the live site, open the Atlas chat widget, type:

> Hi

Expected behaviour:
- One typing indicator appears
- First bubble appears with something like "Atlas here, hey." or "Atlas here — HIMARK's in-house assistant."
- Typing indicator reappears briefly
- Second (and maybe third) bubble appears with the rest of Atlas's intro

If the whole reply appears as one bubble: open the response JSON in DevTools → Network → look at `/api/chat` response — confirm `chunks` is in the body. If `chunks` has only one entry, Atlas didn't insert paragraph breaks this turn; that's fine for some replies but try a longer prompt next.

- [ ] **Step 3: Test 2 — website, one-word ack**

In the same widget, follow up with:

> Yes

Expected: a single bubble. One-word affirmations shouldn't trigger chunking — Atlas should keep it as a single short paragraph.

- [ ] **Step 4: Test 3 — website, pricing question**

Open a fresh widget session (or click whatever resets), then send:

> How much do you charge?

Expected: 2 bubbles. First bubble has the tier-floor numbers ("Depends on the tier. Signature starts at R50k..."). Second bubble has the "actual fee depends on scope... want to walk through..." follow-on.

- [ ] **Step 5: Test 4 — website, voice mode**

Switch the widget to voice mode. Speak a question (e.g. "Tell me about HIMARK"). Expected:
- ONE bubble in the chat thread (not chunked)
- TTS speaks the whole reply continuously, no awkward mid-speech pause
- No `\n\n` breaks visible in the rendered bubble

If you see multiple bubbles in voice mode, the server-side carve-out failed — re-check `api/chat.js` step 3 of Task 4 (the `mode === 'voice'` ternary on `finalChunks`).

- [ ] **Step 6: Test 5 — WhatsApp, greeting**

From your personal phone (already verified as a WhatsApp test recipient), text HIMARK's WhatsApp number:

> Hi Atlas

Expected: Atlas replies with 2–3 short WhatsApp messages in sequence, with a brief pause between each. NOT one long message.

In Vercel logs, click the most recent POST row and look for the line:

```
[wa] reply send result { chunks: 2, aborted: false }   (or chunks: 3)
```

If you see `chunks: 1`, Atlas didn't paragraph-break this turn. Try a richer prompt:

> Tell me what HIMARK does and how to apply

— this should yield 2 or 3 chunks.

- [ ] **Step 7: Test 6 — WhatsApp, voice note**

Record and send a voice note saying something like "Hey Atlas, what do you guys do?". Expected: Atlas replies with text in 2–3 chunks (voice-note path passes through the same `handleMessage` → `sendWhatsAppTextChunks`).

If the reply is a single message, Atlas may have chosen not to break this turn — that's not a bug. Try sending a longer voice note that asks two questions and see if chunking kicks in.

- [ ] **Step 8: Comparison check against the spec's worked examples**

Compare 3–4 of Atlas's actual replies (from the tests above) to the 4 worked examples in `atlas-knowledge.js` §1. Specifically check:

- **No exclamation marks.** If you see one, that's a regression — Gemini violated the ban. Fix by emphasising the rule in §1 ("ABSOLUTELY no exclamation marks, ever") and redeploying.
- **No "Certainly!" / "Great question!" / "I'd be happy to help".** Same — fix in §1 if violated.
- **Contractions used everywhere.** If Atlas says "I will" instead of "I'll", strengthen the rule.
- **Paragraph breaks at natural pause points.** If breaks come in weird spots (mid-thought), study Atlas's actual output and add a clarifying line to §1.

Each correction is a single-line edit to `api/atlas-knowledge.js` §1 plus a redeploy. Iterate 1–3 times until the cadence matches the worked examples.

- [ ] **Step 9: Final commit (only if you tuned §1 in step 8)**

```bash
git add api/atlas-knowledge.js
git commit -m "atlas: tune voice rules after live cadence test

Live-deploy testing surfaced [X] — sharpen §1 instruction so Gemini
honours it. Confirmed [X] no longer appears in subsequent test
replies."
git push
```

If step 8 found no issues, this commit is unnecessary.

---

## Self-review notes

After writing this plan, I checked it against the spec for:

1. **Spec coverage.** Each spec section maps to a task:
   - Voice frame + AI tells + worked examples → Task 1
   - Chunking helper → Tasks 2, 3, 4 (mirrored in both backends and verified by the script)
   - WhatsApp chunked sender → Task 3
   - Chat API response shape → Task 4
   - Widget rendering → Task 5
   - Voice mode carve-out → Task 4 (server) + Task 5 (widget uses joined reply for `speak()`)
   - Testing plan → Task 6
   - Latency/edge-cases → covered by aborted/single-chunk fall-throughs in Tasks 3 + 4
2. **Placeholder scan.** No TBDs, no "add appropriate error handling", no "similar to Task N", no untyped methods referenced before defined. All commit messages drafted in-line.
3. **Type consistency.** `splitIntoChunks`, `chunkPauseMs`, `sleep`, `sendWhatsAppTextChunks` all have one canonical body that appears identically in every file that uses them. `handleMessage` in `api/whatsapp.js` only renames the call and updates the log object.
4. **DRY.** Helpers duplicated across two backend files matches the existing project pattern (parseBlock / extractLead / extractSession are already duplicated the same way). One source-of-truth verification script enforces consistency.
