import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { parseArgs } from 'node:util';
import { createApiServer } from '../server/app.mjs';
import { createAgentBridge } from '../server/agent-bridge.mjs';
import { createTextPanelService, PANEL } from '../server/text-panel.mjs';
import { createPanelProvider } from '../server/panel-provider.mjs';
import { createReplyAudio } from '../server/reply-audio.mjs';
import { mockEnv, scenarioSdk } from './mock-panel.mjs';
import { scenarios } from './scenarios.mjs';

const { values } = parseArgs({ options: { live: { type: 'boolean', default: false }, audio: { type: 'boolean', default: false }, out: { type: 'string' } } });
const scenario = scenarios[0], env = values.live ? process.env : mockEnv;
const provider = values.live ? createPanelProvider() : { getSignedUrl: async id => `wss://test/${id}` };
const panel = createTextPanelService({ env, getSignedUrl: provider.getSignedUrl, ...(values.live ? {} : { sdk: scenarioSdk(scenario), random: () => 0 }) });
const bridge = createAgentBridge();
const audio = createReplyAudio({ textPanel: panel, synthesize: values.live
  ? ({ voiceId, text, signal }) => provider.client.textToSpeech.stream(voiceId, { text, modelId: 'eleven_v4_turbo', outputFormat: 'mp3_44100_128' }, { abortSignal: signal, timeoutInSeconds: 45, maxRetries: 0 })
  : async () => (async function* () { yield Buffer.from('mock-audio'); })() });
const server = createApiServer({ env, textPanel: panel, agentBridge: bridge, replyAudio: audio });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
const directory = await mkdtemp(join(tmpdir(), 'verdict-bridge-'));
const config = join(directory, 'connection.json'), copied = join(directory, 'copied.json');
const jar = new Map();
async function browser(path, body) {
  const response = await fetch(baseUrl + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; ') },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180000) });
  for (const cookie of response.headers.getSetCookie()) { const [k,v] = cookie.split(';')[0].split('='); jar.set(k,v); }
  const data = await response.json(); assert.equal(response.status, 200, data.error); return data;
}
const cli = async (...args) => (await promisify(execFile)(process.execPath, ['agents/bridge/client.mjs', ...args, '--config', config], { timeout: 20000, maxBuffer: 200000 })).stdout;
const evaluate = (pitch, extra = {}) => browser('/evaluate', { pitch, panelists: PANEL.map(p => p.title), scores: [50,50,50,50], ...extra });
try {
  console.log(values.live ? 'LIVE bridge smoke: real investor credits, synthetic founder inputs.' : 'OFFLINE bridge smoke: no credits or browser.');
  await browser('/reset', {});
  const first = await evaluate(scenario.turns[0].pitch);
  await browser('/agent-bridge/ready', { revision: first.bridgeRevision });
  const { token } = await browser('/agent-bridge/connect', {});
  await writeFile(copied, JSON.stringify({ baseUrl, token }), { mode: 0o600 });
  await cli('connect', '--file', copied);
  const context = JSON.parse(await cli('context'));
  assert.equal(context.lastResult.turn, 1);
  assert.equal(context.autoSend, true);
  const founderFile = join(directory, 'founder.txt');
  await writeFile(founderFile, scenario.turns[1].pitch);
  const job = JSON.parse(await cli('suggest', '--file', founderFile, '--author', 'CLI smoke coding agent', '--request-id', 'smoke-request-001'));
  const draft = (await browser('/agent-bridge/session')).pending;
  assert.equal(draft.id, job.id);
  // This harness acts as the already-approved browser; the coding agent has no owner cookie.
  const second = await evaluate(draft.pitch, { bridgeJobId: draft.id, bridgeAuto: true });
  const audioChecks = [];
  if (values.audio) for (const role of second.speakingOrder) {
    const response = await fetch(`${baseUrl}/reply-audio?turn=${second.turn}&role=${role}`, { headers: { Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; ') }, signal: AbortSignal.timeout(60000) });
    const bytes = (await response.arrayBuffer()).byteLength;
    assert.equal(response.status, 200); assert.ok(bytes > 0); assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    audioChecks.push({ role, bytes });
  }
  await browser('/agent-bridge/ready', { revision: second.bridgeRevision });
  const completed = JSON.parse(await cli('wait', '--id', job.id, '--timeout', '2'));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.turn, 2);
  assert.ok(completed.result.speakingOrder.length <= 2);
  assert.deepEqual(completed.result.scores, second.scores);
  for (const role of ['technical_expert', 'market_signals_researcher']) {
    assert.equal(completed.result.responses.find(r => r.role === role).answerStatus, 'resolved');
  }
  const report = { at: new Date().toISOString(), live: values.live, passed: true,
    checks: ['one initial browser approval', 'CLI context sees current concerns', 'CLI draft reaches owner browser', 'same investor session returns turn 2', 'both concerns resolved', 'real panel result returned to CLI'],
    firstScores: first.scores, result: completed.result, audio: audioChecks };
  if (values.out) await writeFile(values.out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(`PASS: CLI -> app -> investors -> app/CLI. Turn ${second.turn}, scores ${second.scores.join('/')}, ${audioChecks.length} audio streams.`);
  await browser('/agent-bridge/disconnect', {});
  await assert.rejects(cli('context'), 'Disconnect revokes CLI access');
  console.log('PASS: disconnect revokes the coding agent. Temporary credentials removed.');
} catch {
  console.error('Bridge smoke failed. No automatic retry was made.'); process.exitCode = 1;
} finally {
  audio.close(); bridge.close(); await panel.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
