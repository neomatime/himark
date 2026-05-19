/* Minimal test function — used to isolate whether Vercel is
   deploying any new function on this project, or specifically
   failing on api/voice.js. If this returns JSON when visited,
   the project CAN deploy new functions and the voice.js issue
   is content-specific. If this also 404s, the project itself
   isn't picking up new function files and we need to change
   Vercel project settings. */
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    ok: true,
    function: 'api/hello',
    deployed: 'yes',
    runtime: process.version || 'unknown',
    timestamp: new Date().toISOString()
  }));
};
