import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createTextPanelService, PANEL, validatePitch } from './text-panel.mjs';
import { parseBid, selectSpeaker } from './turn-selection.mjs';

const env = { ELEVENLABS_API_KEY: 'test-only', ...Object.fromEntries(PANEL.map(r => [r.env, `agent_${r.key}`])) };
const pitch = { pitch: 'Our customer interviews found a recurring reporting problem.', panelists: PANEL.map(r => r.title), scores: [62, 41, 78, 55] };
const willing = (priority = 70) => ({ wants_turn: true, priority, reason: 'A new relevant question.' });
const pass = { wants_turn: false, priority: 0, reason: 'Nothing useful to add.' };
function fakeSdk({ bid = () => willing(), holdSpeech = false, failSpeech = false, scoreChange = 5 } = {}) {
  const configs = [], ended = [], sent = [], blockedScores = [];
  let releaseSpeech;
  return { configs, ended, sent, blockedScores, finishSpeech: () => releaseSpeech(), startSession: async config => {
    configs.push(config);
    const role = PANEL.find(r => config.signedUrl.endsWith(env[r.env]));
    let scoreTurn = 0;
    queueMicrotask(() => config.onMessage({ source: 'ai', message: 'Opening question.' }));
    return {
      sendUserMessage: text => {
        const packet = JSON.parse(text);
        sent.push({ role: role.key, packet });
        config.onMessage({ source: 'ai', message: 'Intermediate acknowledgement.' });
        if (packet.phase === 'assess') {
          const report = { turn_number: ++scoreTurn, confidence: Math.min(100, 50 + scoreTurn * scoreChange), reason: 'Concrete customer evidence.' };
          assert.equal(JSON.parse(config.clientTools.report_investor_interest(report)).accepted, true);
          // A second tool call cannot change confidence twice for one founder message.
          const duplicate = config.clientTools.report_investor_interest({ ...report, turn_number: scoreTurn + 1 });
          assert.equal(JSON.parse(duplicate).accepted, false);
          queueMicrotask(() => {
            const result = bid(role.key, packet.round);
            config.onMessage({ source: 'ai', message: typeof result === 'string' ? result : JSON.stringify(result) });
            config.onIncomingEvent({ type: 'agent_response_complete' });
          });
        } else {
          blockedScores.push(JSON.parse(config.clientTools.report_investor_interest({ turn_number: scoreTurn + 1, confidence: 90, reason: 'Must be rejected in speak phase.' })));
          if (failSpeech) return config.onError();
          const finish = () => {
            config.onMessage({ source: 'ai', message: `${role.key}: Which customers have paid?` });
            config.onIncomingEvent({ type: 'agent_response_complete' });
          };
          if (holdSpeech) releaseSpeech = finish;
          else queueMicrotask(finish);
        }
      },
      endSession: async () => { ended.push(config.signedUrl); },
    };
  } };
}
const makeService = (sdk, options = {}) => createTextPanelService({ env, sdk, getSignedUrl: async id => `wss://test/${id}`, random: () => 0, ...options });

test('existing payload keeps four scores, with one dynamically chosen speaker and shared history', async () => {
  const sdk = fakeSdk({ bid: (role, round) => role === (round === 1 ? 'interrogator' : 'sympathizer') ? willing(95) : pass });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    assert.deepEqual(first.result.scores, [55, 55, 55, 55]);
    assert.equal(first.result.speaker, 'interrogator');
    assert.equal(service.getSpeech(first.sessionId, 1, 'interrogator').role, 'interrogator');
    assert.throws(() => service.getSpeech('another-session', 1, 'interrogator'), /expired/);
    assert.equal(first.result.responses.filter(r => r.spoke).length, 1);
    assert.ok(first.result.responses.filter(r => !r.spoke).every(r => r.reply === ''));
    assert.ok(sdk.configs.every(c => c.textOnly));
    const second = await service.evaluate({ ...pitch, scores: [1, 2, 3, 4] }, first.sessionId);
    assert.equal(second.result.speaker, 'sympathizer');
    assert.throws(() => service.getSpeech(first.sessionId, 1, 'interrogator'), /no longer current/);
    assert.deepEqual(second.result.scores, [60, 60, 60, 60]);
    const assessments = sdk.sent.filter(s => s.packet.round === 2 && s.packet.phase === 'assess');
    assert.equal(assessments.length, 4);
    assert.ok(assessments.every(s => s.packet.previous_exchange.speaker === 'interrogator'));
    assert.ok(sdk.blockedScores.every(s => s.accepted === false));
    assert.equal(sdk.configs.length, 4);
    await service.reset(first.sessionId);
    assert.equal(sdk.ended.length, 4);
    const fresh = await service.evaluate(pitch);
    assert.deepEqual(fresh.result.scores, [55, 55, 55, 55]);
  } finally { await service.close(); }
});

test('everyone can pass without a speech request or a fabricated reply', async () => {
  const sdk = fakeSdk({ bid: () => pass });
  const service = makeService(sdk);
  try {
    const { result, sessionId } = await service.evaluate(pitch);
    assert.equal(result.speaker, null);
    assert.deepEqual(result.speakingOrder, []);
    assert.throws(() => service.getSpeech(sessionId, 1), /No investor spoke/);
    assert.equal(result.selectionReason, null);
    assert.ok(result.responses.every(r => !r.spoke && !r.wantsTurn && r.reply === ''));
    assert.equal(sdk.sent.filter(s => s.packet.phase === 'speak').length, 0);
    assert.deepEqual(result.scores, [55, 55, 55, 55], 'silent investors can still assess evidence');
  } finally { await service.close(); }
});

test('only the winning investor gets the floor, held until its final response completes', async () => {
  const sdk = fakeSdk({ holdSpeech: true, bid: role => role === 'market_signals_researcher' ? willing(90) : pass });
  const service = makeService(sdk);
  const evaluation = service.evaluate(pitch);
  evaluation.catch(() => {});
  let finished = false;
  evaluation.then(() => { finished = true; }, () => {});
  try {
    await setImmediate();
    assert.deepEqual(sdk.sent.filter(s => s.packet.phase === 'speak').map(s => s.role), ['market_signals_researcher']);
    assert.equal(finished, false, 'intermediate messages must not finish a speaking turn');
    sdk.finishSpeech();
    const { sessionId, result } = await evaluation;
    assert.equal(result.speaker, 'market_signals_researcher');
    const next = service.evaluate(pitch, sessionId);
    next.catch(() => {});
    await setImmediate();
    await assert.rejects(service.evaluate(pitch, sessionId), /already being evaluated/);
    sdk.finishSpeech();
    await next;
  } finally { await service.close(); }
});

test('a failed speaker ends the session without handing the floor to someone else', async () => {
  const sdk = fakeSdk({ failSpeech: true });
  const service = makeService(sdk);
  try {
    await assert.rejects(service.evaluate(pitch), /connection failed/);
    assert.equal(sdk.sent.filter(s => s.packet.phase === 'speak').length, 1);
    assert.equal(sdk.ended.length, 4);
  } finally { await service.close(); }
});

test('malformed bids stop evaluation before granting any speaker the floor', async () => {
  const sdk = fakeSdk({ bid: () => 'I should speak now!' });
  const service = makeService(sdk);
  try {
    await assert.rejects(service.evaluate(pitch), /invalid turn bid/);
    assert.equal(sdk.sent.filter(s => s.packet.phase === 'speak').length, 0);
    assert.equal(sdk.ended.length, 4);
  } finally { await service.close(); }
});

test('terminal investors stop bidding, and their old replies are not replayed', async () => {
  const sdk = fakeSdk({ scoreChange: 20 });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    await service.evaluate(pitch, first.sessionId);
    await service.evaluate(pitch, first.sessionId);
    const count = sdk.sent.length;
    const { result } = await service.evaluate(pitch, first.sessionId);
    assert.equal(sdk.sent.length, count);
    assert.equal(result.speaker, null);
    assert.deepEqual(result.speakingOrder, []);
    assert.deepEqual(result.scores, [100, 100, 100, 100]);
    assert.ok(result.responses.every(r => r.reply === ''));
  } finally { await service.close(); }
});

test('invalid requests are rejected before starting any ElevenLabs session', async () => {
  const sdk = fakeSdk();
  const service = makeService(sdk);
  for (const body of [null, { ...pitch, pitch: ' ' }, { ...pitch, pitch: 'x'.repeat(4001) }, { ...pitch, panelists: ['The CTO'] }, { ...pitch, scores: [1, 2, NaN, 4] }]) {
    assert.throws(() => validatePitch(body));
    await assert.rejects(service.evaluate(body));
  }
  assert.equal(sdk.configs.length, 0); await service.close();
});

test('partial connection failures close already-opened sessions without automatic retries', async () => {
  const sdk = fakeSdk();
  let attempts = 0;
  const startSession = sdk.startSession;
  sdk.startSession = config => { if (++attempts === 3) throw new Error('Provider failure'); return startSession(config); };
  const service = makeService(sdk);
  await assert.rejects(service.evaluate(pitch), /Could not connect/);
  assert.equal(attempts, 3); assert.equal(sdk.ended.length, 2); await service.close();
});

test('relevance wins, close bids favor another speaker, ties do not use fixed panel order', () => {
  const bids = [{ key: 'technical', wantsTurn: true, priority: 75 }, { key: 'researcher', wantsTurn: true, priority: 70 }];
  assert.equal(selectSpeaker(bids, null, () => 0).key, 'technical');
  assert.equal(selectSpeaker(bids, 'technical', () => 0).key, 'researcher');
  assert.equal(selectSpeaker([{ ...bids[0], priority: 100 }, bids[1]], 'technical').key, 'technical');
  const tied = bids.map(b => ({ ...b, priority: 70 }));
  assert.equal(selectSpeaker(tied, null, () => 0.99).key, 'researcher');
  assert.equal(selectSpeaker(bids.map(b => ({ ...b, wantsTurn: false })), null), null);
});

test('turn bid validation rejects malformed priorities and accepts explicit silence', () => {
  assert.equal(parseBid(JSON.stringify(pass)).wantsTurn, false);
  for (const bid of ['not json', { ...pass, priority: 90 }, { ...willing(), priority: 101 }, { ...willing(), wants_turn: 'yes' }, { ...willing(), reason: '' }]) {
    assert.throws(() => parseBid(typeof bid === 'string' ? bid : JSON.stringify(bid)), /invalid turn bid/);
  }
});


test('multiple willing investors speak sequentially in bid order while others sit out', async () => {
  const sdk = fakeSdk({ holdSpeech: true, bid: role =>
    role === 'sympathizer' ? willing(95) : role === 'technical_expert' ? willing(70) : pass });
  const service = makeService(sdk);
  const evaluation = service.evaluate(pitch);
  evaluation.catch(() => {});
  const grants = () => sdk.sent.filter(s => s.packet.phase === 'speak');
  try {
    await setImmediate();
    assert.deepEqual(grants().map(s => s.role), ['sympathizer']);
    sdk.finishSpeech();
    await setImmediate();
    assert.deepEqual(grants().map(s => s.role), ['sympathizer', 'technical_expert']);
    assert.deepEqual(grants()[1].packet.previous_exchange.responses.map(r => r.role), ['sympathizer']);
    sdk.finishSpeech();
    const { result, sessionId } = await evaluation;
    assert.deepEqual(result.speakingOrder, ['sympathizer', 'technical_expert']);
    assert.equal(result.responses.filter(r => r.spoke).length, 2);
    assert.deepEqual(result.scores, [55, 55, 55, 55], 'score only once despite multiple speeches');
    for (const role of result.speakingOrder) assert.equal(service.getSpeech(sessionId, 1, role).role, role);
    assert.throws(() => service.getSpeech(sessionId, 1, 'interrogator'), /No investor spoke/);
    assert.throws(() => service.getSpeech(sessionId, 1, 'unknown'), /No investor spoke/);
    assert.throws(() => service.getSpeech(sessionId, 1), /No investor spoke/);
    assert.ok(result.responses.filter(r => !r.spoke).every(r => r.reply === ''));
    assert.ok(sdk.blockedScores.every(s => s.accepted === false));
  } finally { await service.close(); }
});

test('all four may volunteer once, with the full exchange shared next round', async () => {
  const sdk = fakeSdk();
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    assert.equal(first.result.speakingOrder.length, 4);
    assert.equal(new Set(first.result.speakingOrder).size, 4);
    await service.evaluate(pitch, first.sessionId);
    const assessments = sdk.sent.filter(s => s.packet.round === 2 && s.packet.phase === 'assess');
    assert.ok(assessments.every(s => s.packet.previous_exchange.responses.length === 4));
  } finally { await service.close(); }
});
