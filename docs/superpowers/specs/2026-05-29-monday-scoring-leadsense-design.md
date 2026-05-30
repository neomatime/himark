# Monday CRM Migration + LeadSense Scoring + Adaptive Atlas Closings — Design Spec

**Date:** 2026-05-29
**Owner:** Neo Matime
**Status:** Approved, ready for implementation plan
**Scope:** Three interdependent workstreams shipped together — (1) replace HubSpot with Monday CRM across all five capture endpoints, (2) add a server-side lead-scoring engine that buckets every lead into Priority / Standard / Watch / Decline, and (3) have Atlas adapt its closing message based on the bucket the score lands in.

---

## Problem

Three problems compound each other.

**HubSpot is clunky for HIMARK's use case.** The contact-centric model doesn't fit how principals actually triage. There's no visual board, no kanban, and no drag-to-progress workflow. Principals need to see leads as a pipeline they're moving items through, not a list of contacts with custom properties.

**LeadSense captures fields but doesn't rank them.** Every lead today comes out of the qualifying flow indistinguishable from every other lead in the same tier. There's no signal for "this one is hot — call them today" vs. "this one is a tire-kicker — auto-decline." Principals waste time deciding who to follow up first.

**Atlas's closing message is one-size-fits-all.** Every visitor — Private Partner-fit founder with R200K budget and "this quarter" timeline AND a vague R20K hobbyist asking about discounts — gets the same "a principal will follow up within five working days" line. Tone-deaf for the priority lead (could be 24 hours), wasteful for the decline (no principal time should be spent at all).

## Solution at a glance

Ship three things together because they interlock:

1. **`api/monday.js`** — a new helper module that pushes leads to a Monday board via GraphQL, replacing all `pushToHubSpot()` calls across the five capture endpoints.
2. **`api/scoring.js`** — a pure-function scoring engine that takes a captured lead and returns `{ score, bucket, breakdown }`. The breakdown is for debugging; the score (0–100) lands in Monday; the bucket drives both Monday's Priority column and Atlas's closing line.
3. **Adapted Atlas closings** — server-side string substitution in `api/chat.js` and `api/whatsapp.js`: after extracting the `<lead>` block from Atlas's reply, score it, then replace the default "five working days" closing with the bucket-specific line BEFORE chunking and sending to the visitor.

## Files changing

| File | Change |
|---|---|
| `api/monday.js` | **NEW** — GraphQL helper module: `pushToMonday(record, source, fromPhone)` |
| `api/scoring.js` | **NEW** — Pure-function scoring engine: `scoreLead(record, source) → { score, bucket, breakdown }` |
| `api/chat.js` | Replace `pushToHubSpot()` with `pushToMonday()`. After extracting lead, call `scoreLead()` then substitute closing line based on bucket BEFORE the existing `splitIntoChunks()` call. Remove HubSpot helper code in this file. |
| `api/whatsapp.js` | Same as `api/chat.js`. Score also pushed to Monday. |
| `api/apply.js` | Replace `pushToHubSpot()` with `pushToMonday()`. Score the application. Remove HubSpot helper. |
| `api/session-booking.js` | Replace `pushToHubSpot()` with `pushToMonday()`. Score the session (lower default since less data). |
| `api/subscribe.js` | Replace `pushToHubSpot()` with `pushToMonday()`. Newsletter signups always score 0–10 (low), bucket = `Watch`. |
| `api/atlas-knowledge.js` | Tighten the closing-message phrase to a stable template the server can find-and-replace (`"A principal will follow up directly within five working days."` — exact match required). Update §15 tone & pace if needed to reinforce. |
| `scripts/verify-scoring.js` | **NEW** — Hand-rolled verification script (Node, no framework) with ~20 lead fixtures + expected score/bucket pairs. Run with `node scripts/verify-scoring.js`. Exit non-zero on any mismatch. |

## Monday board design

Board name: **HIMARK Inbound**

16 columns:

| # | Column name | Monday type | Set by | Notes |
|---|---|---|---|---|
| 1 | *(Item name)* | default | Server | The visitor's full name (`record.name`). |
| 2 | Email | Email | Server | Required. |
| 3 | Phone | Phone | Server | Optional. Auto-stamped for WhatsApp leads from `record.fromPhone`. |
| 4 | Company | Text | Server | |
| 5 | Role | Text | Server | |
| 6 | Brief | Long text | Server | Concatenated outcome + constraint from `record.brief`. |
| 7 | Tier interest | Status | Server | Options: `Signature`, `Growth`, `Private`, `Session`, `Unsure`. |
| 8 | Timeline | Status | Server | Options: `This quarter`, `Next quarter`, `Open`. |
| 9 | Budget | Status | Server | Options: `<R50k`, `R50–80k`, `R80–120k`, `R120–150k`, `R150–200k`, `R200k+`, `Open`. |
| 10 | Source | Status | Server | Options: `Atlas Chat`, `Atlas WhatsApp`, `Apply Form`, `Session Booking`, `Newsletter`. Colour-coded per source. |
| 11 | **Score** | Numbers | Server | 0–100, computed by `scoreLead()`. |
| 12 | **Priority** | Status | Server | Options: `Priority` (red), `Standard` (neutral), `Watch` (yellow), `Decline` (grey). Computed from `Score` via thresholds below. |
| 13 | Stage | Status | Human | Options: `New` (default), `In review`, `Contacted`, `Qualified`, `Engaged`, `Declined`. Principals advance manually. |
| 14 | Captured at | Date+time | Server (auto) | Set to current UTC at item creation. |
| 15 | Assigned principal | Person | Human | Manual assignment. |
| 16 | Follow-up by | Date | Server (auto) | Priority = capture + 1 day. Standard = capture + 5 working days. Watch = capture + 10 working days. Decline = NULL. |

**Colour coding on the Priority column** is the single most important UX detail for principals. Red `Priority` items must visually pop from the rest of the board. Suggested colour palette: Priority = red-orange, Standard = mid-blue, Watch = mustard, Decline = light-grey.

## Scoring rubric (concrete weights)

`scoreLead(record, source)` adds positive weights, subtracts negative weights, clamps to 0–100.

### Positive signals

```
TIER MATCH
  Private Partner ............ +25
  Growth Partner ............. +20
  Signature Partner .......... +12
  Session .................... +8
  Unsure ..................... +0

BUDGET ALIGNMENT
  Explicit, within tier range  +15
  Above tier floor ........... +10
  Undisclosed but plausible .. +5
  Below tier floor ........... −10   (also recorded as negative)

TIMELINE URGENCY
  "this quarter" / <30 days .. +15
  "next quarter" ............. +8
  "open" / "TBD" ............. +0

ROLE SENIORITY            (regex on record.role, case-insensitive)
  /founder|ceo|co-?founder|owner/ ............... +15
  /cmo|coo|cfo|cto|cpo|cro/ ..................... +12
  /director|vp|vice president|head of/ .......... +10
  /manager/ ..................................... +5
  Other / unspecified ........................... +0

BRIEF SPECIFICITY         (length + commercial-outcome keywords)
  >150 chars AND contains commercial keyword     +10
  50–150 chars ............................... +5
  <50 chars or vague ......................... +0

  Commercial keywords list (regex, any one match counts):
    revenue, growth, pipeline, ARR, MRR, churn, retention,
    positioning, demand, conversion, scale, expansion,
    M&A, capital, raise, exit, leadership, restructure
```

### Source quality bonus

```
SOURCE
  Apply form ............... +10   (intentional, structured intake)
  Atlas WhatsApp ........... +8
  Atlas Chat (website) ..... +8
  Session booking .......... +5    (different intent — exploratory)
  Newsletter only .......... +0    (no qualifying signal)
```

### Negative signals

Each scanned via regex/substring on `record.brief` and the message history:

```
NEGATIVE SIGNALS
  Demanded a proposal before fit       −15
    /send (me )?(a )?proposal|RFP|quote|quotation/i

  Vague brief                          −10
    /we need help|interested|can you help|tell me more/i  AND brief length < 80 chars

  Asked about discounts                −10
    /discount|cheaper|reduce(d)? (fee|price|rate)|negotiate/i

  Generic free-email on Private tier   −5
    record.tier === 'Private' AND record.email matches
    /@(gmail|yahoo|hotmail|outlook|live|icloud)\./
```

## Bucket thresholds

After all weights summed and clamped to 0–100:

| Score | Bucket | Monday SLA | Atlas closing |
|---|---|---|---|
| 75–100 | **Priority** | 24 hours | "Thank you. A principal will reach out directly within 24 hours." |
| 40–74 | **Standard** | 5 working days | "Thank you. A principal will follow up directly within five working days." *(current default — no substitution needed)* |
| 15–39 | **Watch** | 10 working days, low-touch | "Thank you. We'll review and come back to you within five to ten working days. In the meantime, our Insights page has the latest from our desk." |
| 0–14 | **Decline** | n/a | "Thank you for the detail. Based on fit, we don't think we're the right partners for this brief right now — we focus on mandates above R50,000 monthly for founder-led businesses pursuing premium positioning. If your circumstances shift, our door's open." |

## How Atlas adapts (implementation flow)

The scoring + substitution happens server-side, BEFORE chunking, BEFORE pushing to Monday. Sequential steps inside the existing `handleMessage()` / chat handler:

```
1. raw = await askAtlas(history)
2. lead = extractLead(raw)
3. session = extractSession(raw)
4. visibleReply = stripBlocks(raw)
5. if (lead) {
     scoring = scoreLead(lead, source)   // { score, bucket, breakdown }
     if (scoring.bucket !== 'Standard') {
       visibleReply = visibleReply.replace(
         'A principal will follow up directly within five working days.',
         BUCKET_CLOSING_LINES[scoring.bucket]
       )
     }
     pushToMonday({ ...lead, score: scoring.score, priority: scoring.bucket }, source)
   }
6. if (session) {
     scoring = scoreLead({ ...session, tier: 'Session' }, source)
     pushToMonday({ ...session, score: scoring.score, priority: scoring.bucket }, source)
   }
7. chunks = splitIntoChunks(visibleReply)
8. send chunks
```

If the exact-match substitution string doesn't appear in Atlas's reply (because Gemini paraphrased), the closing remains unchanged and we fall through to the default 5-day SLA. This is acceptable — Standard is the safe default. To minimize this risk, the Atlas prompt update in `atlas-knowledge.js` reinforces the exact phrasing as a copy-paste template (see §15 PACE & TONE update below).

The substitution uses `String.prototype.replace()` with the literal string (NOT a global regex), so only the first occurrence is replaced. The trailing "If you'd like to add anything in the meantime, just keep typing." sentence is preserved untouched — it survives across all four buckets because it's a separate sentence that doesn't get matched by the substitution target.

## Atlas prompt change in `atlas-knowledge.js`

In §15 (LeadSense), update the CLOSING section to lock in the exact phrasing the server will substitute against:

> **CLOSING — after Step 8 — use EXACTLY this sentence**
> Once you have name + email captured, close the conversation with this exact line — copy it word for word, including punctuation:
>
> *"Thank you. A principal will follow up directly within five working days. If you'd like to add anything in the meantime, just keep typing."*
>
> Do NOT rephrase. Do NOT shorten. Do NOT translate to a different tone. The server expects this exact phrase and may substitute it for a different timing message based on internal qualification logic. Paraphrasing breaks the substitution.

This is the one place where Atlas's "warm concierge" freedom yields to deterministic phrasing — a single sentence, in exchange for the entire downstream adaptive-closing pipeline working reliably.

## Helper module APIs

### `api/scoring.js`

```js
/**
 * Compute a 0-100 priority score and bucket for a captured lead.
 *
 * @param {Object} record  Lead fields: { name, email, company, role,
 *                         brief, tier, timeline, budget } (any may be empty)
 * @param {string} source  One of: 'atlas-chat', 'atlas-whatsapp',
 *                         'apply', 'session', 'newsletter'
 * @returns {Object} { score: number, bucket: string, breakdown: Object }
 */
function scoreLead(record, source) { ... }

const BUCKET_PRIORITY = 'Priority';
const BUCKET_STANDARD = 'Standard';
const BUCKET_WATCH = 'Watch';
const BUCKET_DECLINE = 'Decline';

const BUCKET_CLOSING_LINES = {
  [BUCKET_PRIORITY]: 'Thank you. A principal will reach out directly within 24 hours.',
  [BUCKET_STANDARD]: 'Thank you. A principal will follow up directly within five working days.',
  [BUCKET_WATCH]:    'Thank you. We will review and come back to you within five to ten working days. In the meantime, our Insights page has the latest from our desk.',
  [BUCKET_DECLINE]:  'Thank you for the detail. Based on fit, we do not think we are the right partners for this brief right now — we focus on mandates above R50,000 monthly for founder-led businesses pursuing premium positioning. If your circumstances shift, our door is open.'
};

module.exports = { scoreLead, BUCKET_CLOSING_LINES, BUCKET_PRIORITY, BUCKET_STANDARD, BUCKET_WATCH, BUCKET_DECLINE };
```

The `breakdown` returned alongside score is a flat object of `{ tier: 25, budget: 15, timeline: 15, role: 10, brief: 5, source: 8, negatives: -10, total: 68 }` shape — useful for debugging and for a future "why this score?" admin panel, never shown to visitor.

### `api/monday.js`

```js
/**
 * Push a captured record to the Monday board.
 *
 * @param {Object} record  Lead + score + priority fields, ready to map to columns
 * @param {string} source  Drives the Source column value
 * @returns {Object} { itemId, created? } | { error, status }
 */
async function pushToMonday(record, source) { ... }

module.exports = { pushToMonday };
```

Internally uses the Monday GraphQL `create_item` mutation against `https://api.monday.com/v2`. Column ID map loaded from `process.env.MONDAY_COLUMN_MAP` (JSON string, parsed once at module load). The mutation shape:

```graphql
mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
  create_item(
    board_id: $boardId,
    item_name: $itemName,
    column_values: $columnValues
  ) { id }
}
```

`columnValues` is a JSON string mapping column IDs to typed values. Each column type has its own value shape — Email columns expect `{email, text}`, Status columns expect `{label}` or `{index}`, Date columns expect `{date, time?}`, Numbers columns expect a stringified number, and Text/Long-text expect a plain string. The helper builds this object from the `MONDAY_COLUMN_MAP` and the record fields, with one branch per column type.

## Env vars

Three new required env vars in Vercel:

```
MONDAY_API_TOKEN       — long string starting with eyJ...
MONDAY_BOARD_ID        — numeric, the board's URL ID
MONDAY_COLUMN_MAP      — JSON string mapping internal field names to
                         Monday column IDs, e.g.:
                         {"email":"email","phone":"phone","company":"text",
                          "role":"text_1","brief":"long_text",
                          "tier":"status","timeline":"status_1","budget":"status_2",
                          "source":"status_3","score":"numbers","priority":"status_4",
                          "stage":"status_5","capturedAt":"date","followUpBy":"date_1"}
```

Three env vars removed when HubSpot code is torn out:

```
HUBSPOT_ACCESS_TOKEN   — removed
HUBSPOT_PORTAL_ID      — removed (if present)
HUBSPOT_FORM_ID        — removed (if present)
```

The diagnostic GET handlers in `api/chat.js` and `api/whatsapp.js` are updated to report Monday readiness instead of HubSpot readiness.

## Error handling

Every external call has an explicit failure mode. None should ever block the visitor's reply.

| Failure | Behaviour |
|---|---|
| `MONDAY_API_TOKEN` missing | `pushToMonday` returns `{ error: 'env-missing' }`, logs once. Atlas still replies normally. Lead lost (but logged with `[crm] lead capture failed env` and full record so it can be recovered manually). |
| Monday API returns non-2xx | Log status + first 300 chars of body. Return `{ error: 'monday-write-failed', status }`. Visitor never sees the failure — the reply has already been sent. |
| Monday API throws (network) | Same as above with `err.cause` surfaced. |
| Score computation throws | `scoreLead` is wrapped in try/catch in the caller; default to `{ score: 50, bucket: 'Standard', breakdown: { error: err.message } }` so the lead still lands with a safe-default bucket. |
| Atlas didn't paraphrase the closing | Substitution `replace()` is a no-op, default 5-day line stays. Safe. |

## Edge cases

- **Email-only newsletter signups** — no tier, no role, no brief. Default scoring path returns ~5–10 (source bonus 0, brief specificity 0, etc.). Bucket = `Watch`. Atlas doesn't run for newsletter signups so the closing-line substitution doesn't apply.
- **Session bookings** — `record.tier` is implicitly `Session`. Scoring rubric includes `Session: +8` as the tier contribution. Bookings typically score 30–45 → `Standard` or `Watch`. Adapted closing applies if bucket ≠ Standard.
- **Repeat visitor** — same email appears twice. We do NOT dedupe in Monday at the helper layer (Monday's automation can be configured for this on their side). Each capture creates a new item. The principal can manually merge or close duplicates.
- **Visitor refuses to give name/email at Step 8** — no `<lead>` block is emitted, no Monday write, no scoring. Atlas's standard closing fires (the "I'll be here if you change your mind" path).
- **Atlas emits a lead block but the lead has no email** — `extractLead` already rejects this (`email` is a required field per the existing parser). No Monday write, no scoring. Logged.

## Testing plan

After implementation:

1. **Unit-level (`scripts/verify-scoring.js`)** — ~20 fixture leads spanning all four buckets. Each fixture has known input + expected score + expected bucket. Run script, expect all PASS, exit 0.
2. **Integration: Atlas chat lead** — open widget, complete LeadSense for a synthetic "Private Partner / founder / this quarter / R200K budget" profile. Confirm: item appears in Monday with Score ≥ 75, Priority = `Priority` (red), Atlas's final visible bubble reads "within 24 hours" not "five working days".
3. **Integration: Atlas WhatsApp lead** — same as above via WhatsApp. Confirm same Monday item, same closing-line substitution in the final chunk.
4. **Integration: Apply form** — submit an application via `/apply.html`. Confirm Monday item with Source = `Apply Form`, Score reflects the form data.
5. **Integration: Session booking** — book via `/sessions.html`. Confirm Source = `Session Booking`, Tier = `Session`, Stage = `New`.
6. **Integration: Newsletter** — subscribe via `/subscribe.html`. Confirm Source = `Newsletter`, Score ≤ 10, Priority = `Watch`.
7. **Decline path** — manually trigger a low-score scenario (Atlas chat: "we need cheaper", "send proposal", role = unknown, budget < R50K). Confirm bucket = `Decline` AND Atlas's visible closing bubble contains "we don't think we're the right partners".
8. **Monday writes failing** — temporarily set `MONDAY_API_TOKEN` to an invalid value. Trigger a lead. Confirm Atlas still replies (no visitor-facing impact), Vercel log has `[crm] monday-write-failed`.

## Rollout sequence

Three-step rollout to minimize the time anything is broken:

1. **Phase A — Ship Atlas-side changes (no Monday wire yet)**. Build `api/scoring.js`, add the closing-substitution logic in `api/chat.js` + `api/whatsapp.js`. Update §15 of `atlas-knowledge.js`. Keep `pushToHubSpot` calls as-is (still writing to HubSpot). Deploy. Verify Atlas adapts closings correctly. **No Monday board IDs needed yet — this phase ships independently.**
2. **Phase B — User completes Monday board setup**. User creates the 16-column board in Monday, generates the API token, captures column IDs, fills env vars in Vercel.
3. **Phase C — Wire Monday + remove HubSpot**. Build `api/monday.js`. Swap `pushToHubSpot` → `pushToMonday` in all five endpoints. Remove HubSpot helper code. Remove HubSpot env vars from Vercel. Deploy. End-to-end test the seven scenarios in §Testing.

## Out of scope (not changing here)

- The Monday board automations (Follow-up auto-set, Stage notifications, principal assignment rules) — those are configured visually in Monday by the user, not in code.
- Migrating historical HubSpot data — confirmed in brainstorm: no historical data to migrate.
- A "why this score?" admin panel showing the breakdown — the breakdown is stored in the API response for debugging but not surfaced in any UI in this phase.
- Real-time score recomputation when a principal manually changes a tier or budget in Monday — out of scope. Scoring happens once at capture.
- Email auto-replies based on score (a Watch lead getting an auto-nurture sequence, a Decline lead getting an auto-decline email) — out of scope; tracked separately.

## Done definition

This work is complete when:

1. All eight files listed in §Files changing are updated as specified.
2. `node scripts/verify-scoring.js` exits 0 with all PASS lines.
3. The seven integration tests in §Testing all pass on the live deploy.
4. The Atlas closing-line substitution is verified working end-to-end (one of each bucket: Priority, Standard, Watch, Decline — confirmed visually by the visitor's final bubble matching the expected line).
5. No HubSpot env vars or HubSpot helper code remain in the repo.
6. The diagnostic GET endpoints (`/api/chat`, `/api/whatsapp` with no query params) report `mondayConfigured: true` and do NOT mention HubSpot.
7. Vercel logs over 24 hours of post-deploy operation show no recurring `[crm] monday-write-failed` entries.
