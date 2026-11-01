import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterestController, interestStatus } from './interest-controller.mjs';

const key = 'market_signals_researcher';
const report = (controller, payload) => JSON.parse(controller.clientToolsFor(key).report_investor_interest(payload));
const answer = (turn_number, confidence) => ({ turn_number, confidence, reason: 'The customer demand claim lacks evidence.' });

test('all four investors start at 100 without an offer or leave event', () => {
  const controller = createInterestController();
  assert.equal(controller.snapshot().length, 4);
  controller.subscribe((states, event) => {
    assert.equal(event, null);
    assert.ok(states.every(s => s.confidence === 100 && s.status === 'engaged'));
  });
});

test('role-bound reports update only one investor and retries cannot deduct twice', () => {
  const controller = createInterestController();
  const received = [];
  controller.subscribe((states, event) => { if (event) received.push(event); });
  assert.equal(report(controller, { ...answer(1, 93), key: 'interrogator' }).accepted, true);
  assert.equal(report(controller, answer(1, 86)).accepted, false);
  assert.equal(controller.snapshot().find(s => s.key === key).confidence, 93);
  assert.equal(controller.snapshot().find(s => s.key === 'interrogator').confidence, 100);
  assert.equal(received.length, 1);
});

test('reject invalid, stale, skipped, increasing and excessive updates without consuming the turn', () => {
  const controller = createInterestController();
  report(controller, answer(1, 93));
  for (const invalid of [null, answer(2, NaN), answer(2, '90'), answer(2, 92.5), answer(2, -1), answer(2, 101), answer(2, 94), answer(2, 0), answer(3, 90), answer(0, 90), { ...answer(2, 90), reason: '' }]) {
    assert.equal(report(controller, invalid).accepted, false);
  }
  assert.equal(report(controller, answer(2, 93)).accepted, true);
  assert.equal(report(controller, answer(3, 90)).accepted, true);
});

test('zero is terminal and emits leave once; old handlers cannot affect a fresh pitch', () => {
  const controller = createInterestController();
  let leaves = 0;
  controller.subscribe((_, event) => { if (event?.left) leaves++; });
  for (let turn = 1; turn <= 5; turn++) assert.equal(report(controller, answer(turn, 100 - turn * 20)).accepted, true);
  assert.equal(report(controller, answer(6, 0)).accepted, false);
  assert.equal(report(controller, answer(6, 100)).accepted, false);
  assert.equal(leaves, 1);
  const oldTools = controller.clientToolsFor(key);
  controller.close();
  const fresh = createInterestController();
  assert.equal(JSON.parse(oldTools.report_investor_interest(answer(7, 0))).accepted, false);
  assert.equal(fresh.snapshot()[0].confidence, 100);
});

test('snapshots cannot mutate score state, and threshold labels are inclusive', () => {
  const controller = createInterestController();
  controller.snapshot()[0].confidence = 0;
  assert.equal(controller.snapshot()[0].confidence, 100);
  assert.deepEqual([100, 70, 69, 40, 39, 1, 0].map(interestStatus), ['engaged', 'engaged', 'concerned', 'concerned', 'nearly-out', 'nearly-out', 'out']);
  assert.throws(() => controller.clientToolsFor('unknown'));
});
