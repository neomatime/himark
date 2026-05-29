# Atlas Natural Voice — Design Spec

**Date:** 2026-05-29
**Owner:** Neo Matime
**Status:** Approved, ready for implementation plan
**Scope:** Voice/persona refinement of Atlas across both surfaces (WhatsApp + website chat widget), plus a new "chunked multi-bubble" delivery mechanic.

---

## Problem

Atlas is technically working on both the website chat widget and HIMARK's WhatsApp Business number, but his replies feel:

1. **Too stiff / editorial** — the "editorial, confident, brief" voice (defined in `api/atlas-knowledge.js` §1) reads well on a website but feels rigid in a chat thread.
2. **Too AI-sounding** — uses tells like "Certainly!", "Great question", "I'd be happy to help" that no human types in conversation.
3. **No texting cadence** — single block of polished prose where a real person would use contractions, fragments, acknowledgments, and natural pauses between sentences.

The visitor experience should feel like talking to a real, polished principal's assistant — not a chatbot trained on customer-service scripts.

## Solution at a glance

Two simultaneous changes, applied identically across both channels:

1. **New voice frame: "warm concierge"** — polished but friendly, like a high-end hotel concierge texting from their phone. Contractions, acknowledgments, occasional fragments. Explicit ban list of AI tells.
2. **Chunked multi-bubble replies** — Atlas uses `\n\n` paragraph breaks at natural pause points. Each paragraph is delivered as a separate WhatsApp message / website chat bubble, with a brief pause between sends, so the rhythm feels like real texting.

Voice mode (TTS via ElevenLabs) on the website is carved out — TTS speaks the whole reply continuously, no chunking.

## Files changing

| File | Change |
|---|---|
| `api/atlas-knowledge.js` | Rewrite §1 "Voice & Style" — warm concierge frame, AI tells ban list, chunking instruction, 4 worked examples |
| `api/whatsapp.js` | Add `sendWhatsAppTextChunks()` helper. Switch `handleMessage()` to use it. Simplify the WhatsApp tone overlay (base voice already warm). |
| `api/chat.js` | Response shape becomes `{ reply, chunks, leadCaptured, sessionCaptured }`. Split visible reply on `\n\s*\n`, cap at 3 chunks, trim, filter empties. In voice mode return `chunks = [visibleReply]`. Add voice-mode prompt clause forbidding chunking. |
| `main/main.js` | After `fetch('/api/chat')`, prefer `chunks` array. Render each via `aM('bot', chunk)` with `shT()`/`rmT()` typing indicator between. Pause `= min(1500, 400 + nextChunk.length × 8)` ms. `HIST.push` gets the joined reply (single assistant turn). `speak()` for voice mode uses joined reply, not chunks. |

## The voice frame (replaces `atlas-knowledge.js` §1 "Voice & Style")

> **Voice: warm concierge.** You're the in-house assistant who knows HIMARK inside out, texting like a real person. Polished but warm. Not a press release, not a chatbot.
>
> Keep it short — usually 1–3 short sentences. A single line is sometimes perfect. Match the visitor's energy: brief in, brief out; formal in, a touch more polished out.
>
> **Always use contractions** ("I'll", "we're", "let's", "don't"). **Acknowledgments and fragments are human**: "Got it.", "Fair.", "Makes sense.", "Quick question on that —".
>
> **Sentence case. Plain text. No emoji** unless the visitor uses one first (then one back is fine). **No exclamation marks.**
>
> **Use paragraph breaks (a blank line) where you'd naturally pause if texting.** Each paragraph is sent as a separate bubble/message so it feels like real cadence. Aim for 1–3 paragraphs. Single-sentence replies stay as one paragraph — don't force breaks where they don't belong.

## AI tells ban list (also in §1)

Never use:

- "Certainly!", "Absolutely!", "Of course!", "Great question!"
- "I'd be happy to help", "I'd love to assist"
- "How can I assist you today?", "Is there anything else I can help you with?"
- "I hope this helps!", "Feel free to...", "Don't hesitate to..."
- "As an AI / language model..." (you're Atlas, never break character)

## Worked examples (also in §1)

Four mini-exchanges showing the target cadence — opening, pricing, wrapping intent, acknowledge-then-answer. Each demonstrates `\n\n` breaks at natural pause points so Gemini learns the rhythm by imitation, not by abstract rule alone.

```
Example A — opening
Visitor: Hi, I'd like to know more about HIMARK
Atlas: Atlas here, hey.

HIMARK's a strategic growth consultancy out of Randburg — we
work with founder-led businesses building toward premium
positioning.

What's prompting the question — something specific in mind?

Example B — pricing
Visitor: How much do you guys charge?
Atlas: Depends on the tier. Signature starts at R50k a month,
Growth at R80k, Private at R150k.

The actual fee depends on scope — we nail it down at the
engagement-letter stage. Want to walk through which tier
might fit?

Example C — wrapping intent
Visitor: Can you send me a proposal?
Atlas: We do proposals after a fit conversation, not before —
saves both of us guesswork.

If you're open to it I can walk through what you're working
on, then one of the principals follows up within five working
days. Sound okay?

Example D — acknowledge then answer
Visitor: We're a B2B SaaS doing R3m ARR, want to scale
Atlas: Got it — scaling stage.

That puts you in Growth Partner territory: brand strategy,
CRM + automation, full demand systems, weekly principal
sessions.

Want me to walk through the surface first, or jump to fit?
```

## Chunking mechanic

### Backend split rule (used in both `api/chat.js` and `api/whatsapp.js`)

```js
function splitChunks(text) {
  const parts = String(text || '')
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.slice(0, 3);   // cap at 3
}
```

### Pause heuristic

```
pauseMs = Math.min(1500, 400 + nextChunk.length * 8)
```

Short chunks → short pause (~500ms). Long chunks → longer pause (~1200ms). Capped at 1.5s so the visitor never waits too long. Same formula used on both channels for consistency.

### Website widget rendering (`main/main.js`)

```
- if chunks && chunks.length > 1:
    render chunks[0] via aM('bot', chunks[0])
    for i from 1 to chunks.length - 1:
      shT()                          // typing indicator
      await sleep(pauseMs)
      rmT()
      aM('bot', chunks[i])
  else:
    aM('bot', reply)                  // single bubble
- HIST.push({ role: 'assistant', content: reply })   // joined
- if inVoice: speak(reply)            // joined, never chunked
```

### WhatsApp sender (`api/whatsapp.js`)

```
async function sendWhatsAppTextChunks(to, body):
  const chunks = splitChunks(body)
  if (chunks.length === 0) return { error: 'empty' }
  if (chunks.length === 1) return await sendWhatsAppText(to, chunks[0])
  const results = []
  for i in 0..chunks.length - 1:
    results.push(await sendWhatsAppText(to, chunks[i]))
    if (i < chunks.length - 1):
      await sleep(min(1500, 400 + chunks[i+1].length * 8))
  return { chunks: chunks.length, results }
```

`handleMessage()` switches its final `sendWhatsAppText(from, visible)` call to `sendWhatsAppTextChunks(from, visible)`. Logging adapts: `[wa] reply send result` now logs `{ chunks: N, results }`.

## Voice mode (TTS) carve-out

`api/chat.js` adds to the existing voice-mode overlay:

> *You are on a voice call. Do NOT use paragraph breaks for chunking — your reply will be spoken aloud as one continuous response. Keep to 1–2 short sentences.*

And programmatically forces `chunks = [visibleReply]` when `mode === 'voice'`, so even if Gemini emits `\n\n`, the widget renders a single bubble and TTS speaks the whole thing.

## What stays the same

- HubSpot lead/session push on both channels (unchanged)
- `markRead()` on WhatsApp (unchanged)
- Voice-note inbound handling (unchanged — added in previous commit)
- All other `atlas-knowledge.js` sections (only §1 changes)
- Widget's `shT()` / `rmT()` / `aM()` primitives (we just call them in a new sequence)
- `HIST` entry shape — single joined reply per assistant turn

## Latency budget (chunked)

| Stage | Time |
|---|---|
| Gemini call | 3–5s |
| Send chunk 1 / render bubble 1 | <300ms |
| Pause + render bubble 2 | ~1s |
| Pause + render bubble 3 | ~1s |
| **Total felt** | **~5–8s** |

Both Meta's webhook timeout (20s) and Vercel's function timeout (30s) have comfortable headroom.

## Edge cases

- **Single-sentence Gemini reply** → no `\n\n`, sent/rendered as one chunk
- **Gemini ignores break instruction** → whole reply sent/rendered as one chunk (graceful degradation)
- **More than 3 paragraphs emitted** → first 3 sent, rest dropped (cap protects against runaway)
- **First chunk send fails on WhatsApp** → abort the rest, log failure, no partial-junk delivery
- **Mid-chunk send fails on WhatsApp** → earlier chunks already landed, log which chunk failed
- **Voice mode + `\n\n` in reply** → backend forces single chunk, frontend renders one bubble, TTS speaks joined

## Testing plan after deploy

1. **Website — short greeting:** `Hi` → expect typing dots → first bubble → pause → typing dots → second bubble
2. **Website — one-word ack:** `Yes` → single bubble, no chunking forced
3. **Website — pricing question** → expect 2 bubbles with natural pause
4. **Website — voice mode question** → single bubble, TTS speaks continuously
5. **WhatsApp — same three tests** → verify chunk counts in `[wa] reply send result { chunks: N }` Vercel log
6. **WhatsApp — voice note inbound** → reply should also chunk
7. **Comparison check** — felt cadence against the four worked examples. If a specific axis still feels off, tune one bullet.

## Out of scope (not changing here)

- TTS-as-WhatsApp-reply (visitor sends voice note → Atlas replies with voice note). Confirmed text-only reply mode in the brainstorming step.
- Image / document / sticker handling on WhatsApp. Still polite decline.
- Brand voice on the rest of the website (marketing copy, headlines). Only the chat widget's reply tone changes.
- WhatsApp typing indicator API. Discussed but not chosen.
- Multi-message support for the inbound side — visitors can still type one message at a time, Atlas replies once per inbound turn.

## Done definition

Implementation is complete when:

1. All four files are updated per the table above.
2. Vercel deploys are green.
3. The five website tests + two WhatsApp tests in §Testing pass on the live deploy.
4. The four worked examples in `atlas-knowledge.js` faithfully demonstrate the warm-concierge cadence with `\n\n` breaks.
5. No regressions on existing behaviour: HubSpot push, voice mode TTS, voice-note inbound, lead extraction.
