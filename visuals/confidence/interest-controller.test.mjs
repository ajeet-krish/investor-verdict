import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterestController, interestStatus } from './interest-controller.mjs';
const key = 'market_signals_researcher';
const report = (c, p) => JSON.parse(c.clientToolsFor(key).report_investor_interest(p));
const answer = (turn_number, confidence) => ({ turn_number, confidence, reason: 'Evidence-based assessment.' });

test('four investors start at 50 with no terminal event', () => {
  const c = createInterestController();
  assert.equal(c.snapshot().length, 4);
  c.subscribe((states, event) => { assert.equal(event, null); assert.ok(states.every(s => s.confidence === 50)); });
});
test('confidence rises and falls independently, retries cannot score twice', () => {
  const c = createInterestController();
  assert.equal(report(c, { ...answer(1, 60), key: 'interrogator' }).accepted, true);
  assert.equal(report(c, answer(1, 40)).accepted, false);
  assert.equal(report(c, answer(2, 45)).accepted, true);
  assert.equal(c.snapshot().find(s => s.key === 'interrogator').confidence, 50);
});
test('invalid reports cannot consume a turn or corrupt scores', () => {
  const c = createInterestController();
  for (const p of [null, answer(0, 40), answer(2, 40), answer(1, NaN), answer(1, '40'), answer(1, -1), answer(1, 101), answer(1, 75), answer(1, 20), answer(1, 50.5), { ...answer(1, 45), reason: '' }]) {
    assert.equal(report(c, p).accepted, false);
  }
  assert.equal(report(c, answer(1, 45)).accepted, true);
});
test('zero and 100 are terminal and emit once; a new pitch resets to 50', () => {
  for (const endpoint of [0, 100]) {
    const c = createInterestController(), events = [];
    c.subscribe((_, e) => { if (e?.left || e?.offered) events.push(e); });
    const path = endpoint ? [70, 90, 100] : [30, 10, 0];
    path.forEach((value, i) => assert.equal(report(c, answer(i + 1, value)).accepted, true));
    assert.equal(report(c, answer(4, endpoint ? 90 : 10)).accepted, false);
    assert.equal(events.length, 1);
    assert.equal(events[0].offered, endpoint === 100);
    c.close();
    assert.equal(report(c, answer(4, endpoint)).accepted, false);
    assert.equal(createInterestController().snapshot()[0].confidence, 50);
  }
});
test('snapshots cannot mutate state; offer is distinct from engaged', () => {
  const c = createInterestController(); c.snapshot()[0].confidence = 0;
  assert.equal(c.snapshot()[0].confidence, 50);
  assert.deepEqual([100, 99, 70, 69, 40, 39, 0].map(interestStatus), ['offered', 'engaged', 'engaged', 'concerned', 'concerned', 'nearly-out', 'out']);
});
