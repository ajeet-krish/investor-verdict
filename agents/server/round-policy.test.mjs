import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { parseAssessment, parseSpeech } from './round-policy.mjs';
import { scenarios } from '../testing/scenarios.mjs';
import { scenarioSdk, mockEnv } from '../testing/mock-panel.mjs';
import { runScenario } from '../testing/panel-runner.mjs';
import { createApiServer } from './app.mjs';
import { createTextPanelService, PANEL } from './text-panel.mjs';

const assessment = { wants_turn: true, priority: 80, reason: 'Follow-up needed.', substantive: true,
  answer_status: 'unanswered', score_delta: 10, score_reason: 'This question was ignored.' };
const concern = { text: 'How many customers paid?', askedRound: 1 };

test('unresolved concerns force independent deductions even when the model proposes a gain', () => {
  assert.equal(parseAssessment(JSON.stringify(assessment), concern).delta, -15);
  assert.equal(parseAssessment(JSON.stringify({ ...assessment, answer_status: 'partial' }), concern).delta, -10);
  assert.equal(parseAssessment(JSON.stringify({ ...assessment, score_delta: -20 }), concern).delta, -20);
});

test('concern classifications cannot punish unasked questions or invent resolution during a pause', () => {
  assert.throws(() => parseAssessment(JSON.stringify(assessment), null));
  assert.throws(() => parseAssessment(JSON.stringify({ ...assessment, answer_status: 'none' }), concern));
  assert.throws(() => parseAssessment(JSON.stringify({ ...assessment, answer_status: 'resolved', substantive: false, score_delta: 0 }), concern));
  assert.equal(parseAssessment(JSON.stringify({ ...assessment, answer_status: 'deferred', substantive: false, score_delta: 0 }), concern).delta, 0);
  assert.equal(parseAssessment(JSON.stringify({ ...assessment, answer_status: 'deferred', substantive: false, score_delta: 0 }), null).answerStatus, 'none');
  for (const patch of [{ score_delta: 21 }, { score_delta: 1.5 }, { score_reason: '' }, { wants_turn: true, priority: 0 }]) {
    assert.throws(() => parseAssessment(JSON.stringify({ ...assessment, ...patch }), concern));
  }
});

test('only concerns actually present in the public reply can become pending', () => {
  assert.deepEqual(parseSpeech(JSON.stringify({ reply: concern.text, concern: concern.text })), { reply: concern.text, concern: concern.text });
  assert.throws(() => parseSpeech(JSON.stringify({ reply: 'Thanks.', concern: concern.text })));
  assert.throws(() => parseSpeech(JSON.stringify({ reply: concern.text, concern: concern.text }), true));
  assert.throws(() => parseSpeech(JSON.stringify({ reply: 'Thanks.' })));
  assert.deepEqual(parseSpeech(JSON.stringify({ reply: 'I pass.', concern: null }), true), { reply: 'I pass.', concern: null });
});

for (const scenario of scenarios) test(`HTTP multi-input scenario: ${scenario.name}, with independent concern memory and audio`, async () => {
  const report = await runScenario(scenario, { audio: true });
  assert.equal(report.passed, true, JSON.stringify(report.records.map(r => r.checks)));
  if (scenario.name === 'neither') {
    const concerns = report.records.slice(0, 4).map(r => r.result.responses[0].pendingConcern);
    assert.ok(concerns.every(c => c.text === concerns[0].text && c.askedRound === 1), 'Follow-up does not overwrite the original unresolved doubt');
  }
});

test('HTTP serves all four farewell audio streams, then never replays departed investors', async () => {
  const scenario = { name: 'four-exits', turns: Array.from({ length: 4 }, (_, turn) => ({
    pitch: 'Synthetic test: there is no supporting evidence.',
    expect: turn === 3 ? {} : { investors: Object.fromEntries(PANEL.map((role, i) => [role.key, {
      scoreDelta: -20, answerStatus: turn === 1 && i < 2 ? 'resolved' : 'none',
    }])) },
  })) };
  const report = await runScenario(scenario, { audio: true });
  assert.equal(report.passed, true, JSON.stringify(report.records.map(r => r.checks)));
  assert.equal(report.records[2].audio.length, 4);
  assert.equal(report.records[2].result.departureOrder.length, 4);
  assert.equal(report.records[3].audio.length, 0);
});

test('HTTP offer decisions preserve scores, play a decline, then play all remaining acceptance farewells', async () => {
  const scenario = { name: 'offer-decisions', turns: Array.from({ length: 3 }, (_, turn) => ({
    pitch: 'Synthetic test: compelling supporting evidence.',
    expect: { investors: Object.fromEntries(PANEL.map((role, i) => [role.key, {
      scoreDelta: 20, answerStatus: turn === 1 && i < 2 ? 'resolved' : 'none',
    }])) },
  })).concat([{ role: 'technical_expert', decision: 'decline' }, { role: 'interrogator', decision: 'accept' }]) };
  const report = await runScenario(scenario, { audio: true });
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(report.records[2].result.offerOrder.length, 4);
  assert.equal(report.records[2].audio.length, 4);
  assert.equal(report.records[3].audio.length, 1);
  assert.equal(report.records[3].result.gameOver, false);
  assert.equal(report.records[4].audio.length, 3);
  assert.equal(report.records[4].result.speakingOrder[0], 'interrogator');
  assert.equal(report.records[4].result.gameOver, true);
});

test('simultaneous founder submissions are rejected with 409, without duplicate scores or replies', async t => {
  const scenario = scenarios.find(s => s.name === 'both');
  const sdk = scenarioSdk(scenario);
  let hold = false, startedResolve;
  const started = new Promise(resolve => { startedResolve = resolve; });
  const waiting = [];
  const original = sdk.startSession;
  sdk.startSession = config => original({ ...config, onIncomingEvent: event => {
    if (hold) { waiting.push(() => config.onIncomingEvent(event)); startedResolve(); }
    else config.onIncomingEvent(event);
  } });
  const panel = createTextPanelService({ env: mockEnv, sdk, getSignedUrl: async id => `wss://test/${id}` });
  const server = createApiServer({ env: mockEnv, textPanel: panel });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await panel.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  let cookie = '';
  const submit = pitch => fetch(`http://127.0.0.1:${server.address().port}/api/evaluate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ pitch, panelists: PANEL.map(r => r.title), scores: [50, 50, 50, 50] }),
  });
  const first = await submit(scenario.turns[0].pitch);
  cookie = first.headers.get('set-cookie').split(';')[0];
  await first.json();
  hold = true;
  const accepted = submit(scenario.turns[1].pitch);
  await started;
  const collisions = await Promise.all(Array.from({ length: 3 }, () => submit('A second answer arriving at the same time.')));
  assert.ok(collisions.every(r => r.status === 409));
  for (const response of collisions) await response.json();
  hold = false; waiting.forEach(release => release());
  const response = await accepted;
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.turn, 2);
  assert.deepEqual(result.scores, [70, 70, 50, 50]);
  assert.deepEqual(result.speakingOrder, []);
  assert.ok(result.responses.every(r => r.pendingConcern === null));
});


test('meaningful gains and losses have a ten-point minimum, with neutral evidence unchanged', () => {
  for (const [input, expected] of [[1, 10], [5, 10], [10, 10], [15, 15], [20, 20], [-1, -10], [-5, -10], [-15, -15], [-20, -20], [0, 0]]) {
    const data = JSON.stringify({ ...assessment, answer_status: 'none', score_delta: input });
    assert.equal(parseAssessment(data, null).delta, expected);
  }
});
