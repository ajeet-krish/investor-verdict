import { createServer } from 'node:http';
import { once } from 'node:events';

export const ENV_IDS = Object.freeze({
  cto: 'ELEVENLABS_AGENT_ID_CTO',
  tech_bro: 'ELEVENLABS_AGENT_ID_TECH_BRO',
  interrogator: 'ELEVENLABS_AGENT_ID_INTERROGATOR',
  sympathizer: 'ELEVENLABS_AGENT_ID_SYMPATHIZER',
});

export function createApiServer({ env = process.env, getSignedUrl, textPanel, replyAudio, getVoiceToken }) {
  const origin = env.APP_ORIGIN || 'http://127.0.0.1:5173';
  const agentIds = Object.fromEntries(Object.entries(ENV_IDS).map(([role, name]) => [role, env[name] || '']));
  let tokenWindow = 0, tokenCount = 0;
  return createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    // Local development service, bound to loopback. No wildcard CORS or arbitrary agent IDs.
    if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Origin not allowed.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Cross-site request blocked.' });
    const url = new URL(req.url, 'http://localhost');
    const sessionId = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('verdict_session='))?.slice('verdict_session='.length);
    if (getVoiceToken && req.method === 'POST' && url.pathname === '/api/voice-token') {
      if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON required.' });
      if (!env.ELEVENLABS_API_KEY) return send(503, { error: 'Voice is not configured.' });
      if (Date.now() - tokenWindow > 60000) { tokenWindow = Date.now(); tokenCount = 0; }
      if (++tokenCount > 12) return send(429, { error: 'Too many voice connections. Wait a minute before reconnecting.' });
      try { return send(200, { token: await getVoiceToken() }); }
      catch { return send(502, { error: 'Could not start live transcription. Check ElevenLabs speech-to-text access.' }); }
    }
    if (replyAudio && req.method === 'GET' && url.pathname === '/api/reply-audio') {
      const abort = new AbortController();
      res.once('close', () => abort.abort());
      try {
        for await (const chunk of replyAudio.open(sessionId, Number(url.searchParams.get('turn')), url.searchParams.get('role'), abort.signal)) {
          if (abort.signal.aborted) break;
          if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none' });
          if (!res.write(chunk)) await once(res, 'drain', { signal: abort.signal });
        }
        if (!abort.signal.aborted) res.end();
      } catch (error) {
        if (abort.signal.aborted) return;
        if (res.headersSent) res.destroy();
        else send(error.status || 502, { error: error.status ? error.message : 'Investor audio failed.' });
      }
      return;
    }
    if (textPanel && req.method === 'POST' && ['/api/evaluate', '/evaluate', '/api/reset'].includes(url.pathname)) {
      if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON required.' });
      try {
        if (url.pathname === '/api/reset') {
          replyAudio?.reset(sessionId);
          await textPanel.reset(sessionId);
          res.setHeader('Set-Cookie', 'verdict_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
          return send(200, { scores: [50, 50, 50, 50] });
        }
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 20000) return send(413, { error: 'Request too large.' });
        }
        let body;
        try { body = JSON.parse(raw); } catch { return send(400, { error: 'Invalid JSON.' }); }
        const { sessionId: id, result } = await textPanel.evaluate(body, sessionId);
        res.setHeader('Set-Cookie', `verdict_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=120`);
        return send(200, result);
      } catch (error) {
        return send(error.status || 502, { error: error.status ? error.message : 'Investor evaluation failed.' });
      }
    }
    if (req.method === 'GET'  && url.pathname === '/api/elevenlabs/config') {
      return send(200, { configured: Boolean(env.ELEVENLABS_API_KEY) && Object.values(agentIds).every(Boolean), agentIds, startScore: 50 });
    }
    if (req.method !== 'POST' || url.pathname !== '/api/elevenlabs/signed-url') return send(404, { error: 'Not found.' });
    if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON required.' });
    if (!env.ELEVENLABS_API_KEY) return send(503, { error: 'Add ELEVENLABS_API_KEY to the root .env and restart the server.' });
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024) return send(413, { error: 'Request too large.' });
      }
      let payload;
      try { payload = JSON.parse(body); } catch { return send(400, { error: 'Invalid JSON.' }); }
      const role = payload?.role;
      if (typeof role !== 'string' || !Object.hasOwn(agentIds, role)) return send(400, { error: 'Unknown investor.' });
      if (!agentIds[role]) return send(503, { error: 'Investor ID is missing from .env.' });
      const signedUrl = await getSignedUrl(agentIds[role]);
      if (typeof signedUrl !== 'string' || !signedUrl.startsWith('wss://')) throw new Error('Invalid signed URL');
      return send(200, { signedUrl });
    } catch {
      // SDK errors may contain request headers. Do not log or return the raw error.
      return send(502, { error: 'ElevenLabs authorization failed. Check the server key and agent permissions.' });
    }
  });
}
