import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../server/app.mjs';
import { createTextPanelService, PANEL } from '../server/text-panel.mjs';
import { createReplyAudio } from '../server/reply-audio.mjs';
import { scenarioSdk, mockEnv } from './mock-panel.mjs';

export function checkTurn(result, priorScores, expected = {}) {
  assert.ok(Array.isArray(result.speakingOrder) && result.speakingOrder.length <= 2, 'At most two speakers');
  assert.equal(new Set(result.speakingOrder).size, result.speakingOrder.length, 'No repeated speaker');
  assert.equal(result.responses.length, 4);
  assert.equal(result.maxSpeakers, 2);
  assert.deepEqual(result.responses.filter(r => r.spoke).map(r => r.role).sort(), [...result.speakingOrder].sort());
  for (const [i, response] of result.responses.entries()) {
    assert.equal(response.role, PANEL[i].key);
    assert.equal(response.confidence, result.scores[i]);
    assert.ok(Number.isInteger(response.confidence) && response.confidence >= 0 && response.confidence <= 100);
    assert.ok(Math.abs(response.confidence - priorScores[i]) <= 20, 'Bounded confidence change');
    assert.equal(response.spoke, Boolean(response.reply));
    const rule = expected.investors?.[response.role];
    if (!rule) continue;
    assert.equal(response.answerStatus, rule.answerStatus, `${response.role}: answer status`);
    const delta = response.confidence - priorScores[i];
    if (rule.minDelta !== undefined) assert.ok(delta >= rule.minDelta, `${response.role}: minimum delta`);
    if (rule.maxDelta !== undefined) assert.ok(delta <= rule.maxDelta, `${response.role}: maximum delta`);
    if (rule.concern !== undefined) assert.equal(Boolean(response.pendingConcern), rule.concern, `${response.role}: pending concern`);
  }
  if (expected.speakers) assert.deepEqual([...result.speakingOrder].sort(), [...expected.speakers].sort());
  if (expected.includesSpeaker) assert.ok(result.speakingOrder.includes(expected.includesSpeaker), 'Requested follow-up speaker');
}

// Exercise the actual HTTP routes and session cookie without a browser or running dev server.
export async function runScenario(scenario, { live = false, provider, audio = false, onTurn = () => {} } = {}) {
  const env = live ? process.env : mockEnv;
  const getSignedUrl = live ? provider.getSignedUrl : async id => `wss://test/${id}`;
  const panel = createTextPanelService({ env, getSignedUrl, ...(live ? {} : { sdk: scenarioSdk(scenario), random: () => 0 }) });
  const replyAudio = createReplyAudio({ textPanel: panel, synthesize: live
    ? ({ voiceId, text, signal }) => provider.client.textToSpeech.stream(voiceId, { text, modelId: 'eleven_v4_turbo', outputFormat: 'mp3_44100_128' }, { abortSignal: signal, timeoutInSeconds: 45, maxRetries: 0 })
    : async () => (async function* () { yield Buffer.from('mock-audio'); })(),
  });
  const server = createApiServer({ env, getSignedUrl, textPanel: panel, replyAudio });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '', scores = [50, 50, 50, 50];
  const records = [];
  async function post(path, body) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error}`);
    return data;
  }
  try {
    for (const [i, step] of scenario.turns.entries()) {
      const result = await post('/api/evaluate', { pitch: step.pitch, panelists: PANEL.map(p => p.title), scores });
      const record = { turn: i + 1, pitch: step.pitch, result, checks: 'passed' };
      records.push(record);
      try { checkTurn(result, scores, step.expect); assert.equal(result.turn, i + 1, 'Session memory retained'); }
      catch (error) { record.checks = error.message; }
      if (audio) {
        record.audio = [];
        for (const role of result.speakingOrder) {
          const response = await fetch(`${base}/api/reply-audio?turn=${result.turn}&role=${role}`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(60000) });
          const bytes = (await response.arrayBuffer()).byteLength;
          assert.equal(response.status, 200, 'Audio request succeeds');
          assert.ok(bytes > 0);
          assert.match(response.headers.get('content-type'), /^audio\/mpeg/);
          record.audio.push({ role, bytes });
        }
      }
      scores = result.scores;
      onTurn(record);
      // Never retry paid requests or continue a scenario after its assumptions fail.
      if (record.checks !== 'passed') break;
    }
    return { name: scenario.name, live, records, passed: records.length === scenario.turns.length && records.every(r => r.checks === 'passed') };
  } catch {
    return { name: scenario.name, live, records, passed: false, error: 'Scenario request or audio validation failed. No automatic retry was made.' };
  } finally {
    try { if (cookie) await post('/api/reset', {}); }
    finally { replyAudio.close(); await panel.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}
