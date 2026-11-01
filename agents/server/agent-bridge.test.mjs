import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAgentBridge } from './agent-bridge.mjs';
import { createApiServer } from './app.mjs';
import { createTextPanelService, PANEL } from './text-panel.mjs';
import { mockEnv, scenarioSdk } from '../testing/mock-panel.mjs';
import { scenarios } from '../testing/scenarios.mjs';

const draft = (revision = 0, requestId = 'request-001') => ({ pitch: 'A founder reply.', author: 'Test coder agent', revision, requestId });
const result = { turn: 1, scores: [55, 55, 50, 50], responses: [{ role: 'technical_expert', reply: 'A real reply from the panel.' }], speakingOrder: ['technical_expert'] };

test('approval creates a scoped token; suggestions alone never evaluate or forge investor replies', () => {
  const bridge = createAgentBridge();
  const room = bridge.ensure();
  const { token } = bridge.connect(room);
  assert.equal(bridge.agentContext(token).autoSend, true);
  assert.throws(() => bridge.agentContext('wrong'), { status: 401 });
  assert.ok(!JSON.stringify(bridge.agentContext(token)).includes(token));
  const job = bridge.suggest(token, draft());
  assert.equal(job.status, 'pending');
  assert.equal(bridge.ownerContext(room).busy, false);
  const otherRoom = bridge.ensure();
  assert.throws(() => bridge.begin(otherRoom, { pitch: job.pitch, bridgeJobId: job.id }), { status: 409 });
  bridge.close();
});

test('idempotency, revision checks and human input prevent stale or double execution', () => {
  const bridge = createAgentBridge(), room = bridge.ensure();
  const { token } = bridge.connect(room);
  const job = bridge.suggest(token, draft());
  assert.deepEqual(bridge.suggest(token, draft()), job);
  assert.throws(() => bridge.suggest(token, { ...draft(), pitch: 'Different text' }), { status: 409 });
  const ticket = bridge.begin(room, { pitch: 'Human takes over.' });
  assert.equal(bridge.job(token, job.id).status, 'stale');
  assert.throws(() => bridge.begin(room, { pitch: job.pitch, bridgeJobId: job.id }), { status: 409 });
  bridge.finish(ticket, result);
  assert.throws(() => bridge.suggest(token, draft(0, 'request-old')), { status: 409 });
  assert.equal(bridge.agentContext(token).history[0].founder, 'Human takes over.');
  assert.equal(bridge.agentContext(token).ready, false);
  const next = bridge.suggest(token, draft(1, 'request-next'));
  assert.throws(() => bridge.begin(room, { pitch: next.pitch, bridgeJobId: next.id, bridgeAuto: true }), { status: 409 });
  bridge.ready(room, 1);
  bridge.mode(room, false);
  assert.throws(() => bridge.begin(room, { pitch: next.pitch, bridgeJobId: next.id, bridgeAuto: true }), { status: 409 });
  const approved = bridge.begin(room, { pitch: next.pitch, bridgeJobId: next.id });
  bridge.finish(approved, { ...result, turn: 2 });
  assert.equal(bridge.job(token, next.id).status, 'completed');
  assert.deepEqual(bridge.job(token, next.id).result.scores, result.scores);
  assert.throws(() => bridge.begin(room, { pitch: next.pitch, bridgeJobId: next.id }), { status: 409 });
  bridge.close();
});

test('reset, disconnect and expiry revoke agent access and pending suggestions', () => {
  let time = 0;
  const bridge = createAgentBridge({ now: () => time, ttlMs: 100 });
  let room = bridge.ensure(), token = bridge.connect(room).token;
  bridge.suggest(token, draft()); bridge.disconnect(room);
  assert.throws(() => bridge.agentContext(token), { status: 401 });
  token = bridge.connect(room).token;
  assert.equal(bridge.agentContext(token).pending, null);
  bridge.suggest(token, draft()); bridge.reset(room);
  assert.throws(() => bridge.agentContext(token), { status: 401 });
  assert.equal(bridge.ownerContext(room).history.length, 0);
  token = bridge.connect(room).token; time = 101;
  assert.throws(() => bridge.agentContext(token), { status: 401 });
  assert.throws(() => bridge.ownerContext(room), { status: 410 });
  bridge.close();
});

test('failed suggestions remain failed without automatic retries and rejected jobs never run', () => {
  const bridge = createAgentBridge(), room = bridge.ensure(), { token } = bridge.connect(room);
  let job = bridge.suggest(token, draft());
  bridge.reject(room, job.id);
  assert.throws(() => bridge.begin(room, { pitch: job.pitch, bridgeJobId: job.id }), { status: 409 });
  job = bridge.suggest(token, draft(0, 'request-fail'));
  const ticket = bridge.begin(room, { pitch: job.pitch, bridgeJobId: job.id });
  bridge.fail(ticket);
  assert.equal(bridge.job(token, job.id).status, 'failed');
  assert.equal(bridge.suggest(token, draft(0, 'request-fail')).status, 'failed');
  bridge.close();
});

test('HTTP pipeline shares the browser session, returns actual investor results and keeps secrets private', async t => {
  const bridge = createAgentBridge();
  const panel = createTextPanelService({ env: mockEnv, getSignedUrl: async id => `wss://test/${id}`, sdk: scenarioSdk(scenarios[0]), random: () => 0 });
  const server = createApiServer({ env: mockEnv, textPanel: panel, agentBridge: bridge });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { bridge.close(); await panel.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  async function browser(path, body) {
    const r = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; ') }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const cookie of r.headers.getSetCookie()) { const [k,v] = cookie.split(';')[0].split('='); jar.set(k,v); }
    return { status: r.status, data: await r.json() };
  }
  const evaluate = (pitch, extra = {}) => browser('/evaluate', { pitch, panelists: PANEL.map(r => r.title), scores: [50,50,50,50], ...extra });
  await browser('/reset', {});
  const first = await evaluate(scenarios[0].turns[0].pitch);
  assert.equal(first.status, 200);
  await browser('/agent-bridge/ready', { revision: first.data.bridgeRevision });
  const connected = await browser('/agent-bridge/connect', {});
  const token = connected.data.token;
  async function agent(path, body) {
    const response = await fetch(base + '/api/agent-bridge/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const context = (await agent('context')).data;
  assert.equal(context.lastResult.turn, 1);
  assert.equal(context.lastResult.responses[0].pendingConcern.askedRound, 1);
  const request = { pitch: scenarios[0].turns[1].pitch, revision: context.revision, requestId: 'cli-request-001', author: 'Claude in coder terminal' };
  const suggested = await agent('suggest', request);
  assert.equal(suggested.status, 202);
  assert.equal((await browser('/agent-bridge/session')).data.pending.id, request.requestId);
  assert.equal((await agent('ready', { revision: context.revision })).status, 410, 'Agent token cannot impersonate browser control');
  const second = await evaluate(request.pitch, { bridgeJobId: request.requestId, bridgeAuto: true });
  assert.equal(second.status, 200);
  assert.equal(second.data.turn, 2, 'Same four investor conversations, not a fresh session');
  assert.deepEqual(second.data.scores, [70,70,50,50]);
  const job = (await agent('job?id=' + request.requestId)).data;
  assert.equal(job.status, 'completed');
  assert.deepEqual(job.result.scores, second.data.scores);
  assert.ok(!JSON.stringify(job).includes(mockEnv.ELEVENLABS_API_KEY));
  assert.ok(!JSON.stringify(job).includes(token));
  assert.equal((await evaluate(request.pitch, { bridgeJobId: request.requestId })).status, 409);
  assert.equal((await agent('suggest', request)).data.status, 'completed');
  const cross = await fetch(base + '/api/agent-bridge/context', { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  await browser('/reset', {});
  assert.equal((await agent('context')).status, 401);
});
