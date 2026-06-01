/* /api/voice — Atlas premium voice (TTS) endpoint.
   Rebuilt from scratch as a clean copy because Vercel was
   refusing to deploy the previous version of this file even
   though chat.js at the same path pattern worked. */

const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      function: 'api/voice',
      method: 'GET',
      keyPresent: !!process.env.ELEVENLABS_API_KEY,
      voiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
      runtime: process.version || 'unknown'
    }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'TTS not configured', fallback: 'browser' }));
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const text = String((body && body.text) || '').slice(0, 2000).trim();
  if (!text) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'text required' }));
  }

  try {
    const upstream = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId),
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: text,
          /* eleven_multilingual_v2 over turbo_v2_5: ~300ms slower
             per turn but dramatically more natural prosody —
             real pauses, breath, conversational lilt. Worth it
             for a voice receptionist that's meant to feel human. */
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            /* Lower stability = more emotional variation between
               sentences. 0.35 sits in ElevenLabs' "expressive"
               zone without flipping into the "unstable / drifting"
               zone (<0.20). */
            stability: 0.35,
            /* Slight loosening from 0.78 → 0.72 lets the model
               wander a touch more for prosody without losing
               George's voice character. */
            similarity_boost: 0.72,
            /* Style is the single biggest natural-vs-robotic
               lever. 0.18 → 0.55 unlocks emphasis, lilt, and
               conversational rhythm. Higher than 0.7 starts
               sounding theatrical for our use case. */
            style: 0.55,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text().catch(function () { return ''; });
      console.error('[atlas voice] elevenlabs error', upstream.status, errText.slice(0, 400));
      res.statusCode = upstream.status === 401 ? 401 : 502;
      return res.end(JSON.stringify({ error: 'TTS upstream failed', upstreamStatus: upstream.status }));
    }

    const arr = await upstream.arrayBuffer();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(Buffer.from(arr));
  } catch (err) {
    console.error('[atlas voice] handler error', err && err.message);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'TTS failed' }));
  }
};
