import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createTextPanelService, PANEL, validatePitch } from './text-panel.mjs';
import { parseBid, selectSpeaker } from './turn-selection.mjs';

const env = { ELEVENLABS_API_KEY: 'test-only', ...Object.fromEntries(PANEL.map(r => [r.env, `agent_${r.key}`])) };
const pitch = { pitch: 'Our customer interviews found a recurring reporting problem.', panelists: PANEL.map(r => r.title), scores: [62, 41, 78, 55] };
const willing = (priority = 70) => ({ wants_turn: true, priority, reason: 'A new relevant question.' });
const pass = { wants_turn: false, priority: 0, reason: 'Nothing useful to add.' };
function fakeSdk({ bid = () => willing(), holdSpeech = false, failSpeech = false, speechReply = () => undefined, scoreChange = 5 } = {}) {
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
          const delta = typeof scoreChange === 'function' ? scoreChange(role.key, packet.round) : scoreChange;
          const report = { turn_number: ++scoreTurn, confidence: Math.max(0, Math.min(100, 50 + scoreTurn * delta)), reason: 'Concrete customer evidence.' };
          assert.equal(JSON.parse(config.clientTools.report_investor_interest(report)).accepted, false);
          // A second tool call cannot change confidence twice for one founder message.
          const duplicate = config.clientTools.report_investor_interest({ ...report, turn_number: scoreTurn + 1 });
          assert.equal(JSON.parse(duplicate).accepted, false);
          queueMicrotask(() => {
            const result = bid(role.key, packet.round, packet);
            const assessment = { ...result, substantive: true, answer_status: packet.pending_concern ? 'resolved' : 'none', score_delta: delta, score_reason: delta < 0 ? 'There is no evidence that customers need this.' : 'Concrete customer evidence.' };
            config.onMessage({ source: 'ai', message: typeof result === 'string' ? result : JSON.stringify(assessment) });
            config.onIncomingEvent({ type: 'agent_response_complete' });
          });
        } else {
          blockedScores.push(JSON.parse(config.clientTools.report_investor_interest({ turn_number: scoreTurn + 1, confidence: 90, reason: 'Must be rejected in speak phase.' })));
          if (failSpeech) return config.onError();
          const finish = () => {
            config.onMessage({ source: 'ai', message: speechReply(packet) ?? JSON.stringify({ reply: packet.closing ? (packet.offer_decision === 'accept' ? 'Congratulations and good luck!' : 'I respect your decision. Goodbye.') : packet.offer ? 'I would like to invest. Please accept or decline my offer.' : packet.departure ? "I'm passing because customers haven't been validated. I'm leaving the call." : `${role.key}: Which customers have paid?`, concern: packet.closing || packet.confidence === 0 || packet.confidence === 100 ? null : 'Which customers have paid?' }) });
            config.onIncomingEvent({ type: 'agent_response_complete' });
          };
          if (typeof holdSpeech === 'function' ? holdSpeech(packet) : holdSpeech) releaseSpeech = finish;
          else queueMicrotask(finish);
        }
      },
      endSession: async () => { ended.push(config.signedUrl); },
    };
  } };
}
const makeService = (sdk, options = {}) => createTextPanelService({ env, sdk, getSignedUrl: async id => `wss://test/${id}`, random: () => 0, ...options });

test('all four zero-confidence investors get sequential farewells even when every bid passes', async () => {
  const sdk = fakeSdk({ bid: () => pass, scoreChange: -20, holdSpeech: true });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    await service.evaluate(pitch, first.sessionId);
    const ending = service.evaluate(pitch, first.sessionId);
    const grants = () => sdk.sent.filter(s => s.packet.phase === 'speak');
    for (let i = 0; i < 4; i++) {
      await setImmediate();
      assert.equal(grants().length, i + 1, 'Only one farewell generation has the floor at a time');
      assert.equal(grants()[i].packet.departure, true);
      assert.equal(grants()[i].packet.confidence, 0);
      assert.match(grants()[i].packet.exit_reason, /no evidence/);
      sdk.finishSpeech();
    }
    const { result } = await ending;
    assert.deepEqual(result.departureOrder, PANEL.map(p => p.key));
    assert.deepEqual(result.speakingOrder, result.departureOrder);
    assert.deepEqual(result.scores, [0, 0, 0, 0]);
    assert.equal(result.maxSpeakers, 2, 'Ordinary reply cap remains two');
    assert.ok(result.responses.every(r => r.spoke && !r.wantsTurn && r.pendingConcern === null));
    for (const role of result.speakingOrder) assert.match(service.getSpeech(first.sessionId, 3, role).text, /leaving the call/);
    assert.equal(sdk.ended.length, 4, 'Departed provider connections close');
    const sent = sdk.sent.length;
    const later = await service.evaluate(pitch, first.sessionId);
    assert.equal(sdk.sent.length, sent, 'Departed investors never assess or speak again');
    assert.deepEqual(later.result.speakingOrder, []);
    assert.deepEqual(later.result.departureOrder, []);
    assert.deepEqual(later.result.departedRoles, PANEL.map(p => p.key));
  } finally { await service.close(); }
});

for (const exitingCount of [1, 3]) test(`${exitingCount} mandatory farewells precede normal bids without consuming ordinary slots`, async () => {
  const leaving = PANEL.slice(0, exitingCount).map(p => p.key);
  const sdk = fakeSdk({ bid: role => leaving.includes(role) ? pass : willing(100),
    scoreChange: role => leaving.includes(role) ? -20 : 0 });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    await service.evaluate(pitch, first.sessionId);
    const { result } = await service.evaluate(pitch, first.sessionId);
    assert.deepEqual(result.departureOrder, leaving);
    assert.deepEqual(result.speakingOrder.slice(0, exitingCount), leaving);
    assert.equal(result.speakingOrder.length, exitingCount + Math.min(2, 4 - exitingCount));
    assert.equal(new Set(result.speakingOrder).size, result.speakingOrder.length);
    const next = await service.evaluate(pitch, first.sessionId);
    assert.ok(next.result.speakingOrder.every(role => !leaving.includes(role)));
    assert.deepEqual(next.result.departureOrder, []);
  } finally { await service.close(); }
});

test('existing payload keeps four scores, with one dynamically chosen speaker and shared history', async () => {
  const sdk = fakeSdk({ bid: (role, round) => role === (round === 1 ? 'interrogator' : 'sympathizer') ? willing(95) : pass });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    assert.deepEqual(first.result.scores, [60, 60, 60, 60]);
    assert.equal(first.result.speaker, 'interrogator');
    assert.equal(service.getSpeech(first.sessionId, 1, 'interrogator').role, 'interrogator');
    assert.throws(() => service.getSpeech('another-session', 1, 'interrogator'), /expired/);
    assert.equal(first.result.responses.filter(r => r.spoke).length, 1);
    assert.ok(first.result.responses.filter(r => !r.spoke).every(r => r.reply === ''));
    assert.ok(sdk.configs.every(c => c.textOnly));
    const second = await service.evaluate({ ...pitch, scores: [1, 2, 3, 4] }, first.sessionId);
    assert.equal(second.result.speaker, 'sympathizer');
    assert.throws(() => service.getSpeech(first.sessionId, 1, 'interrogator'), /no longer current/);
    assert.deepEqual(second.result.scores, [70, 70, 70, 70]);
    const assessments = sdk.sent.filter(s => s.packet.round === 2 && s.packet.phase === 'assess');
    assert.equal(assessments.length, 4);
    assert.ok(assessments.every(s => s.packet.previous_exchange.speaker === 'interrogator'));
    assert.ok(sdk.blockedScores.every(s => s.accepted === false));
    assert.equal(sdk.configs.length, 4);
    await service.reset(first.sessionId);
    assert.equal(sdk.ended.length, 4);
    const fresh = await service.evaluate(pitch);
    assert.deepEqual(fresh.result.scores, [60, 60, 60, 60]);
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
    assert.deepEqual(result.scores, [60, 60, 60, 60], 'silent investors can still assess evidence');
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

test('invalid assessments get one correction, then abstain without closing the room', async () => {
  const sdk = fakeSdk({ bid: () => 'I should speak now!' });
  const service = makeService(sdk);
  try {
    const { result, sessionId } = await service.evaluate(pitch);
    assert.deepEqual(result.scores, [50, 50, 50, 50]);
    assert.ok(result.responses.every(r => r.assessmentStatus === 'unavailable' && r.answerStatus === null));
    assert.ok(result.responses.every(r => /unchanged/.test(r.reason)));
    assert.equal(sdk.sent.filter(s => s.packet.phase === 'assess').length, 8);
    assert.equal(sdk.sent.filter(s => s.packet.phase === 'speak').length, 0);
    assert.equal(sdk.ended.length, 0);
    const next = await service.evaluate(pitch, sessionId);
    assert.equal(next.result.turn, 2);
    assert.equal(sdk.configs.length, 4);
  } finally { await service.close(); }
});

test('the observed bid-only pass is repaired without interrupting other investors or double scoring', async () => {
  const sdk = fakeSdk({ bid: (role, round, packet) => role === 'market_signals_researcher'
    ? packet.correction ? pass : JSON.stringify(pass) : willing() });
  const service = makeService(sdk);
  try {
    const { result } = await service.evaluate(pitch);
    assert.equal(result.responses[1].assessmentStatus, 'repaired');
    assert.deepEqual(result.scores, [60, 60, 60, 60]);
    assert.equal(result.speakingOrder.length, 2);
    assert.ok(!result.speakingOrder.includes('market_signals_researcher'));
    const requests = sdk.sent.filter(s => s.packet.phase === 'assess');
    assert.equal(requests.length, 5);
    const repair = requests.find(s => s.packet.correction).packet;
    assert.equal(repair.round, 1);
    assert.equal(repair.next_score_turn, 1);
    assert.equal(Object.keys(repair.required_response_fields).length, 7);
    assert.equal(sdk.ended.length, 0);
  } finally { await service.close(); }
});

test('a failed assessment preserves its existing concern and score while other investors continue', async () => {
  const sdk = fakeSdk({ bid: (role, round) => role === 'technical_expert' && round === 2 ? '{"wants_turn":true,' : willing() });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    const second = await service.evaluate(pitch, first.sessionId);
    assert.equal(second.result.responses[0].assessmentStatus, 'unavailable');
    assert.deepEqual(second.result.responses[0].pendingConcern, first.result.responses[0].pendingConcern);
    assert.deepEqual(second.result.scores, [60, 70, 70, 70]);
    assert.equal(second.result.speakingOrder.length, 2);
    assert.ok(!second.result.speakingOrder.includes('technical_expert'));
    const third = await service.evaluate(pitch, first.sessionId);
    assert.equal(third.result.responses[0].assessmentStatus, 'valid');
    assert.equal(third.result.scores[0], 70);
    assert.equal(sdk.configs.length, 4);
  } finally { await service.close(); }
});

test('all four investors at 100 get offers despite passing, then acceptance closes everyone without double scoring', async () => {
  const sdk = fakeSdk({ scoreChange: 20, bid: () => pass });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    await service.evaluate(pitch, first.sessionId);
    const third = await service.evaluate(pitch, first.sessionId);
    assert.deepEqual(third.result.offerOrder, PANEL.map(p => p.key));
    assert.deepEqual(third.result.speakingOrder, third.result.offerOrder);
    assert.deepEqual(third.result.pendingOffers, third.result.offerOrder);
    assert.deepEqual(third.result.departedRoles, []);
    const count = sdk.sent.length;
    await assert.rejects(service.evaluate(pitch, first.sessionId), /Accept or decline/);
    assert.equal(sdk.sent.length, count);
    const chosen = 'interrogator';
    const { result } = await service.decideOffer({ role: chosen, decision: 'accept', turn: 3 }, first.sessionId);
    assert.equal(result.gameOver, true);
    assert.equal(result.acceptedOffer, chosen);
    assert.equal(result.speakingOrder[0], chosen);
    assert.equal(result.speakingOrder.length, 4);
    assert.deepEqual(result.pendingOffers, []);
    assert.deepEqual(result.scores, [100, 100, 100, 100]);
    assert.deepEqual(result.departureOrder, result.speakingOrder);
    assert.equal(sdk.sent.filter(s => s.packet.phase === 'assess').length, 12);
    for (const role of result.speakingOrder) assert.match(service.getSpeech(first.sessionId, 4, role).text, /good luck/);
    await assert.rejects(service.evaluate(pitch, first.sessionId), /game has ended/);
    await assert.rejects(service.decideOffer({ role: chosen, decision: 'accept', turn: 3 }, first.sessionId), { status: 409 });
  } finally { await service.close(); }
});

test('declining an offer says goodbye and removes only that investor, then the game continues', async () => {
  const sdk = fakeSdk({ scoreChange: role => role === 'technical_expert' ? 20 : 0,
    bid: role => role === 'technical_expert' ? pass : willing(90) });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    await service.evaluate(pitch, first.sessionId);
    const offered = await service.evaluate(pitch, first.sessionId);
    assert.equal(offered.result.speakingOrder[0], 'technical_expert');
    assert.equal(offered.result.speakingOrder.length, 3, 'Offer is extra to two ordinary speakers');
    const declined = await service.decideOffer({ role: 'technical_expert', decision: 'decline', turn: 3 }, first.sessionId);
    assert.equal(declined.result.gameOver, false);
    assert.deepEqual(declined.result.departureOrder, ['technical_expert']);
    assert.deepEqual(declined.result.scores, [100, 50, 50, 50]);
    assert.deepEqual(declined.result.pendingOffers, []);
    const next = await service.evaluate(pitch, first.sessionId);
    assert.equal(next.result.turn, 5);
    assert.ok(!next.result.speakingOrder.includes('technical_expert'));
    assert.deepEqual(next.result.departedRoles, ['technical_expert']);
    assert.ok(sdk.sent.filter(s => s.packet.round === 5).every(s => s.role !== 'technical_expert'));
  } finally { await service.close(); }
});

test('multiple offers stay pending after one decline; acceptance excludes earlier departures', async () => {
  const sdk = fakeSdk({ scoreChange: role => role === 'technical_expert' ? -20 : 20, bid: () => pass });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    await service.evaluate(pitch, first.sessionId);
    const offered = await service.evaluate(pitch, first.sessionId);
    assert.deepEqual(offered.result.departureOrder, ['technical_expert']);
    assert.equal(offered.result.offerOrder.length, 3);
    assert.equal(offered.result.speakingOrder.length, 4);
    await service.decideOffer({ role: 'market_signals_researcher', decision: 'decline', turn: 3 }, first.sessionId);
    await assert.rejects(service.evaluate(pitch, first.sessionId), /Accept or decline/);
    const accepted = await service.decideOffer({ role: 'sympathizer', decision: 'accept', turn: 4 }, first.sessionId);
    assert.deepEqual(accepted.result.speakingOrder, ['sympathizer', 'interrogator']);
    assert.equal(accepted.result.departedRoles.length, 4);
    assert.equal(accepted.result.gameOver, true);
  } finally { await service.close(); }
});

test('invalid, stale, duplicate and concurrent offer decisions cannot trigger extra paid closing statements', async () => {
  const sdk = fakeSdk({ scoreChange: role => role === 'technical_expert' ? 20 : 0, bid: () => pass, holdSpeech: packet => packet.closing });
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    await service.evaluate(pitch, first.sessionId); await service.evaluate(pitch, first.sessionId);
    const body = { role: 'technical_expert', decision: 'decline', turn: 3 }, count = sdk.sent.length;
    await assert.rejects(service.decideOffer(body, 'wrong-session'), { status: 409 });
    await assert.rejects(service.decideOffer({ ...body, turn: 2 }, first.sessionId), { status: 409 });
    await assert.rejects(service.decideOffer({ ...body, role: 'sympathizer' }, first.sessionId), { status: 409 });
    await assert.rejects(service.decideOffer({ ...body, decision: 'maybe' }, first.sessionId), { status: 400 });
    assert.equal(sdk.sent.length, count);
    const pending = service.decideOffer(body, first.sessionId);
    await setImmediate();
    await assert.rejects(service.decideOffer(body, first.sessionId), { status: 409 });
    await assert.rejects(service.evaluate(pitch, first.sessionId), { status: 409 });
    sdk.finishSpeech(); await pending;
    await assert.rejects(service.decideOffer(body, first.sessionId), { status: 409 });
    assert.equal(sdk.sent.length, count + 1);
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
    assert.deepEqual(result.scores, [60, 60, 60, 60], 'score only once despite multiple speeches');
    for (const role of result.speakingOrder) assert.equal(service.getSpeech(sessionId, 1, role).role, role);
    assert.throws(() => service.getSpeech(sessionId, 1, 'interrogator'), /No investor spoke/);
    assert.throws(() => service.getSpeech(sessionId, 1, 'unknown'), /No investor spoke/);
    assert.throws(() => service.getSpeech(sessionId, 1), /No investor spoke/);
    assert.ok(result.responses.filter(r => !r.spoke).every(r => r.reply === ''));
    assert.ok(sdk.blockedScores.every(s => s.accepted === false));
  } finally { await service.close(); }
});

test('all four may volunteer but only two speak, with the full exchange shared next round', async () => {
  const sdk = fakeSdk();
  const service = makeService(sdk);
  try {
    const first = await service.evaluate(pitch);
    assert.equal(first.result.speakingOrder.length, 2);
    assert.equal(new Set(first.result.speakingOrder).size, 2);
    assert.ok(first.result.responses.filter(r => !r.spoke).every(r => r.pendingConcern === null));
    await service.evaluate(pitch, first.sessionId);
    const assessments = sdk.sent.filter(s => s.packet.round === 2 && s.packet.phase === 'assess');
    assert.ok(assessments.every(s => s.packet.previous_exchange.responses.length === 2));
  } finally { await service.close(); }
});


test('a bid returned during speech is corrected once without rescoring or selecting another investor', async () => {
  const sdk = fakeSdk({ speechReply: packet => packet.correction ? undefined : JSON.stringify(pass) });
  const service = makeService(sdk);
  try {
    const { result } = await service.evaluate(pitch);
    assert.deepEqual(result.scores, [60, 60, 60, 60]);
    assert.equal(result.speakingOrder.length, 2);
    const grants = sdk.sent.filter(s => s.packet.phase === 'speak');
    assert.equal(grants.length, 4);
    assert.equal(grants[0].role, grants[1].role);
    assert.equal(grants[0].packet.round, grants[1].packet.round);
    assert.ok(grants[1].packet.correction);
    assert.deepEqual(Object.keys(grants[1].packet.required_response_fields), ['reply', 'concern']);
  } finally { await service.close(); }
});

test('speech correction is bounded and does not fabricate a final statement', async () => {
  const sdk = fakeSdk({ speechReply: () => JSON.stringify(pass) });
  const service = makeService(sdk);
  try {
    await assert.rejects(service.evaluate(pitch), /invalid public reply after one correction/);
    assert.equal(sdk.sent.filter(s => s.packet.phase === 'speak').length, 2);
  } finally { await service.close(); }
});
