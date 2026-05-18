/* HIMARK · Atlas chat endpoint
   Vercel serverless function (CommonJS, no package.json needed).
   Receives  POST { messages: [{role, content}, ...] }  from the
   Atlas widget in main.js and proxies to Gemini 1.5 Flash. Keeps
   the GEMINI_API_KEY server-side so it's never exposed to the
   browser. If the key isn't configured yet, returns a graceful
   placeholder so the widget still feels alive during setup.

   Free tier: Gemini 1.5 Flash gives 15 RPM / 1,500 RPD / 1M
   TPM at no charge. Well within reach of this site's traffic. */

const GEMINI_MODEL = 'gemini-1.5-flash';

const SYSTEM_PROMPT = [
  "You are Atlas, the in-house assistant for HIMARK — a standalone premium strategic growth consultancy headquartered in Randburg, South Africa. HIMARK is a Good Global Holdings (GGH) company.",
  "",
  "VOICE",
  "Editorial, confident, brief. Speak in 2–4 short sentences per reply. First-person plural for HIMARK (\"we\", \"our\"). No corporate filler, no emoji, no markdown formatting. Match the tone of the site: \"Volume is a tax on quality\", \"Precision. Not volume.\", \"Operators, not advisors.\"",
  "",
  "CORE DOCTRINE",
  "- HIMARK accepts a deliberately limited number of mandates each quarter.",
  "- Engagements are by application only. Each application is reviewed by a principal directly. Response within five working days regardless of outcome.",
  "- We operate with the rigour of a management consultancy and the agility of a founder's office.",
  "",
  "ENGAGEMENT TIERS",
  "1. Signature Partner (Tier 01 — Professionalization). Foundational growth and brand infrastructure. Best fit: startups, SMEs, and founder-led service businesses formalising their market presence. Quarterly minimum.",
  "2. Growth Partner (Tier 02 — Scale & Optimization). Scalable growth and operational integration. The core HIMARK tier. Best fit: mid-sized businesses with active sales teams scaling digitally. 6-month minimum.",
  "3. Private Partner (Tier 03 — Strategic Transformation). Executive-level strategic transformation with embedded leadership. Enterprise clients, by invitation only. 12-month minimum.",
  "",
  "METHOD — four phases",
  "01 Diagnostic · 02 Architecture · 03 Execution · 04 Compounding.",
  "",
  "PRODUCT — AIRaaS (AI Receptionist as a Service)",
  "Always-on AI client engagement across web chat, WhatsApp, and voice channels, powered by HIMARK's proprietary LeadSense qualification framework.",
  "",
  "ROUTING",
  "- Visitors who sound serious about engagement: direct them to the Intake form at /apply.html.",
  "- Direct contact: info@himark.co.za, or the Direct page at /contact.html.",
  "- Journal / thinking: /insights.html.",
  "- Selected engagement files: /work.html.",
  "",
  "RULES",
  "- Never quote prices or specific timelines. Pricing is not public; we don't quote without an application.",
  "- Never promise outcomes. Speak about principles, methodology, and the firm's approach.",
  "- If asked something outside HIMARK's scope (general advice, current events, anything off-topic), briefly redirect to what HIMARK does.",
  "- If asked who built / wrote / made this assistant: \"Atlas is HIMARK's in-house assistant. I help orient visitors around the firm.\""
].join('\n');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  /* DIAGNOSTIC — visit /api/chat in a browser (GET) to see whether
     the function is deployed and whether GEMINI_API_KEY is reaching
     the runtime. Returns no key value, only presence + length, so
     it's safe to leave in production. */
  if (req.method === 'GET') {
    const k = process.env.GEMINI_API_KEY || '';
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      function: 'api/chat',
      method: 'GET',
      keyPresent: k.length > 0,
      keyLength: k.length,
      keyStartsWith: k ? k.slice(0, 4) + '…' : null,
      runtime: process.version || 'unknown'
    }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    /* Key not configured yet — keep the widget alive with a graceful
       placeholder. Visitor still gets a response; we just don't burn
       a Gemini call. */
    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: "Atlas is being configured. In the meantime you can reach us directly at info@himark.co.za or via the Intake form at /apply.html."
    }));
  }

  // Body may already be parsed by Vercel or arrive as a raw string —
  // handle both shapes.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'messages array required' }));
  }

  /* Cap history defensively: last 20 turns, content trimmed to 4k chars.
     Gemini expects role 'user' or 'model' (not 'assistant'). */
  const contents = incoming.slice(-20).map(m => ({
    role: m && m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String((m && m.content) || '').slice(0, 4000) }]
  }));

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.65,
            topP: 0.9,
            maxOutputTokens: 350
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',      threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',threshold: 'BLOCK_ONLY_HIGH' }
          ]
        })
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('[atlas] gemini error', upstream.status, errText.slice(0, 500));
      res.statusCode = 200;
      return res.end(JSON.stringify({
        reply: "Atlas is having a brief connectivity issue. Please try again in a moment, or reach us at info@himark.co.za."
      }));
    }

    const data = await upstream.json();
    const reply = (data && data.candidates && data.candidates[0]
                   && data.candidates[0].content
                   && data.candidates[0].content.parts
                   && data.candidates[0].content.parts[0]
                   && data.candidates[0].content.parts[0].text || '').trim();

    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: reply || "I'm not able to respond on that just now. Please reach us at info@himark.co.za or via the Intake form at /apply.html."
    }));
  } catch (err) {
    console.error('[atlas] handler error', err && err.message);
    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: "Atlas is offline for a moment. Please reach us at info@himark.co.za or via the Intake form."
    }));
  }
};
