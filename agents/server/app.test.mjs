import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer, ENV_IDS } from './app.mjs';
const env = { ELEVENLABS_API_KEY: 'test-secret-never-return', ...Object.fromEntries(Object.entries(ENV_IDS).map(([key, name]) => [name, `agent_${key}`])) };
async function setup(t, overrides = {}) {
  const calls = [];
  const server = createApiServer({ env, getSignedUrl: async id => { calls.push(id); return 'wss://example.test/session'; }, ...overrides });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (payload, headers = {}) => fetch(base + '/api/elevenlabs/signed-url', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  return { base, post, calls };
}
test('config exposes IDs and initial 50, never the API key', async t => {
  const { base } = await setup(t);
  const r = await fetch(base + '/api/elevenlabs/config');
  const text = await r.text(); assert.ok(!text.includes(env.ELEVENLABS_API_KEY));
  const data = JSON.parse(text); assert.equal(data.startScore, 50); assert.equal(data.configured, true);
});
test('only configured roles get signed URLs; credentials are not cached', async t => {
  const { post, calls } = await setup(t);
  for (const role of ['__proto__', 'constructor', 'other_agent']) assert.equal((await post({ role })).status, 400);
  const r = await post({ role: 'cto' }); assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store'); assert.deepEqual(calls, ['agent_cto']);
});
test('cross-origin requests are blocked before minting a token', async t => {
  const { post, calls } = await setup(t);
  assert.equal((await post({ role: 'cto' }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await post({ role: 'cto' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal(calls.length, 0);
});
test('missing keys and upstream errors never leak credentials', async t => {
  const missing = await setup(t, { env: { ...env, ELEVENLABS_API_KEY: '' } });
  assert.equal((await missing.post({ role: 'cto' })).status, 503);
  const bad = await setup(t, { getSignedUrl: async () => { throw new Error(env.ELEVENLABS_API_KEY); } });
  const response = await bad.post({ role: 'cto' }); assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(env.ELEVENLABS_API_KEY));
});

test('voice tokens are temporary, uncached, origin-checked and rate-limited', async t => {
  let minted=0;
  const {base}=await setup(t,{getVoiceToken:async()=>{minted++;return 'temporary-scribe-token';}});
  const request=(origin='http://127.0.0.1:5173')=>fetch(base+'/api/voice-token',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'{}'});
  assert.equal((await request('https://other.example')).status,403);
  assert.equal(minted,0);
  for(let i=0;i<12;i++){
    const r=await request();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
    const body=await r.text();assert.ok(!body.includes(env.ELEVENLABS_API_KEY));
  }
  assert.equal((await request()).status,429);assert.equal(minted,12);
});
test('reply audio uses the cookie, turn and role, streams MP3, and reset cancels audio', async t=>{
  const calls=[];
  const {base}=await setup(t,{
    textPanel:{reset:async id=>calls.push(['reset-panel',id])},
    replyAudio:{open:(id,turn,role)=>{calls.push(['audio',id,turn,role]);return (async function*(){yield Buffer.from('mp3-bytes');})();},reset:id=>calls.push(['reset-audio',id])},
  });
  const r=await fetch(base+'/api/reply-audio?turn=3&role=interrogator',{headers:{Cookie:'verdict_session=owned'}});
  assert.equal(r.headers.get('content-type'),'audio/mpeg');assert.equal(await r.text(),'mp3-bytes');
  const reset=await fetch(base+'/api/reset',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'verdict_session=owned'},body:'{}'});
  assert.equal(reset.status,200);
  assert.deepEqual(calls,[['audio','owned',3,'interrogator'],['reset-audio','owned'],['reset-panel','owned']]);
});

test('offer decisions require the live call cookie, reject cross-origin requests, and never use an agent bearer token', async t => {
  const calls = [];
  const { base } = await setup(t, { textPanel: { decideOffer: async (body, id) => {
    calls.push({ body, id }); return { sessionId: id, result: { pendingOffers: [] } };
  } } });
  const post = headers => fetch(base + '/api/offer-decision', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ role: 'technical_expert', decision: 'accept', turn: 3 }) });
  assert.equal((await post({ Authorization: 'Bearer coding-agent-token' })).status, 409);
  assert.equal((await post({ Cookie: 'verdict_session=owned', Origin: 'https://other.example' })).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await post({ Cookie: 'verdict_session=owned' })).status, 200);
  assert.equal(calls.length, 1); assert.equal(calls[0].id, 'owned');
});
