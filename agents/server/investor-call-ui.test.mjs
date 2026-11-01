import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createCallRoster, playInvestorTurns, validateEvaluation } from '../../frontend/confidence-panel/src/investor-call.ts';
import { PANEL } from './text-panel.mjs';

const seeds = PANEL.map(p => ({ role: p.key, name: p.title }));
const roles = seeds.map(p => p.role);
function result(count = 4) {
  const departures = roles.slice(0, count);
  return { turn: 3, event: 'pitch', decision: null, gameOver: false, acceptedOffer: null, offerOrder: [], pendingOffers: [], scores: roles.map(r => departures.includes(r) ? 0 : 50),
    responses: seeds.map(s => ({ role: s.role, panelist: s.name, spoke: true, reply: "I'm passing and leaving." })),
    departureOrder: departures, departedRoles: departures, speakingOrder: roles };
}
function node() {
  const classes = new Set();
  return { hidden: false, dataset: {}, attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); }, remove(k) { classes.delete(k); } },
  };
}
function view(animateExit) {
  const tiles = roles.map(role => ({ role, el: node() })), grid = node(), empty = node();
  const roster = createCallRoster(tiles, grid, empty, animateExit);
  return { tiles, grid, empty, roster };
}

test('frontend accepts four farewells and mixed turns, but rejects extra ordinary speakers or false exits', () => {
  assert.equal(validateEvaluation(result(), seeds, [10, 10, 10, 10]).departureOrder.length, 4);
  assert.equal(validateEvaluation(result(3), seeds, [10, 10, 10, 50]).speakingOrder.length, 4);
  assert.throws(() => validateEvaluation(result(1), seeds, [10, 50, 50, 50]), /Unexpected/);
  const ordinary = result(0);
  assert.throws(() => validateEvaluation(ordinary, seeds, [50, 50, 50, 50]), /Unexpected/);
  const reordered = result(3); reordered.speakingOrder = [...roles].reverse();
  assert.throws(() => validateEvaluation(reordered, seeds, [10, 10, 10, 50]), /Unexpected/);
  const duplicate = result(); duplicate.departureOrder[3] = roles[0];
  assert.throws(() => validateEvaluation(duplicate, seeds, [10, 10, 10, 10]), /Unexpected/);
  assert.throws(() => validateEvaluation(result(), seeds, [0, 0, 0, 0]), /Unexpected/, 'Cannot repeat old farewells');
});

test('tiles leave one at a time only after audio completes or is skipped, then reset restores all four', async () => {
  const v = view(), r = result(), spoken = [], exited = [];
  v.roster.begin(r);
  let finish;
  const playback = playInvestorTurns(r, {
    current: () => true,
    present: reply => spoken.push(reply.role),
    play: () => new Promise(resolve => { finish = resolve; }),
    depart: role => { exited.push(role); v.roster.leave(role); },
  });
  for (let i = 0; i < 4; i++) {
    assert.equal(v.grid.dataset.count, String(4 - i));
    assert.equal(spoken.length, i + 1);
    assert.equal(exited.length, i);
    assert.equal(v.tiles[i].el.hidden, false, 'Keep the speaking investor visible');
    finish(); await setImmediate();
    assert.equal(v.tiles[i].el.hidden, true);
  }
  await playback;
  assert.deepEqual(exited, roles);
  assert.equal(v.empty.hidden, false);
  assert.equal(v.roster.empty, true);
  v.roster.reset();
  assert.equal(v.grid.dataset.count, '4');
  assert.equal(v.empty.hidden, true);
  assert.ok(v.tiles.every(t => !t.el.hidden));
});

test('reset during a farewell prevents late playback from hiding restored tiles or starting the next voice', async () => {
  const v = view(), r = result(); v.roster.begin(r);
  let current = true, finish, spoken = 0;
  const playing = playInvestorTurns(r, { current: () => current,
    present: () => { spoken++; }, play: () => new Promise(resolve => { finish = resolve; }),
    depart: role => v.roster.leave(role) });
  current = false; v.roster.reset(); finish(); await playing;
  assert.equal(spoken, 1);
  assert.equal(v.grid.dataset.count, '4');
  assert.ok(v.tiles.every(t => !t.el.hidden));
});

test('departed investors stay hidden on later turns, while a fresh session restores the grid', () => {
  const v = view(), later = result(3);
  later.departureOrder = []; later.speakingOrder = [roles[3]];
  later.responses.forEach(r => { r.spoke = r.role === roles[3]; r.reply = r.spoke ? 'Who will pay?' : ''; });
  validateEvaluation(later, seeds, [0, 0, 0, 50]);
  v.roster.begin(later);
  assert.equal(v.grid.dataset.count, '1');
  assert.equal(v.tiles[3].el.dataset.position, '1');
  const fresh = { ...later, turn: 1, scores: [50, 50, 50, 50], departedRoles: [] };
  validateEvaluation(fresh, seeds, [0, 0, 0, 50]);
  v.roster.begin(fresh);
  assert.equal(v.grid.dataset.count, '4');
});

test('the collapse animation finishes before removing the tile or starting the next investor', async () => {
  const effects = [], spoken = [];
  const v = view(() => {
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const effect = { finished, finish, cancel() {} }; effects.push(effect); return effect;
  });
  const r = result(3); v.roster.begin(r);
  const playing = playInvestorTurns(r, {
    current: () => true, present: reply => spoken.push(reply.role), play: async () => {},
    depart: role => v.roster.leave(role),
  });
  for (let i = 0; i < 3; i++) {
    await setImmediate();
    assert.equal(effects.length, i + 1);
    assert.equal(spoken.length, i + 1, 'Next investor waits for the exit effect');
    assert.equal(v.grid.dataset.count, String(4 - i));
    assert.equal(v.tiles[i].el.hidden, false);
    effects[i].finish();
  }
  await playing;
  assert.equal(spoken.length, 4);
  assert.equal(v.grid.dataset.count, '1');
});

test('reset cancels a collapse and cannot hide a restored investor when its animation settles', async () => {
  let reject, cancelled = 0;
  const v = view(() => ({ finished: new Promise((_, fail) => { reject = fail; }),
    cancel() { cancelled++; reject(new Error('Animation cancelled')); } }));
  v.roster.begin(result());
  const leaving = v.roster.leave(roles[0]);
  assert.equal(v.tiles[0].el.hidden, false);
  v.roster.reset(); await leaving;
  assert.equal(cancelled, 1);
  assert.equal(v.grid.dataset.count, '4');
  assert.ok(v.tiles.every(t => !t.el.hidden));
});

test('reduced motion skips the collapse animation', async t => {
  const original = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  t.after(() => { if (original) globalThis.matchMedia = original; else delete globalThis.matchMedia; });
  const v = view();
  v.tiles[0].el.animate = () => { throw new Error('Must not animate reduced motion'); };
  await v.roster.leave(roles[0]);
  assert.equal(v.tiles[0].el.hidden, true);
  assert.equal(v.grid.dataset.count, '3');
});

test('offer turns stay visible for a choice; decline removes only the chosen investor at 100', async () => {
  const offered = { ...result(0), scores: [100, 100, 100, 100], offerOrder: roles, pendingOffers: roles };
  validateEvaluation(offered, seeds, [90, 90, 90, 90]);
  const v = view(); v.roster.begin(offered);
  assert.equal(v.grid.dataset.count, '4');
  const declined = { ...offered, turn: 4, event: 'offer-declined', decision: { role: roles[0], choice: 'decline' },
    departureOrder: [roles[0]], departedRoles: [roles[0]], offerOrder: [], pendingOffers: roles.slice(1), speakingOrder: [roles[0]],
    responses: offered.responses.map((r, i) => ({ ...r, spoke: i === 0, reply: i === 0 ? 'Goodbye.' : '' })) };
  validateEvaluation(declined, seeds, offered.scores);
  v.roster.begin(declined);
  assert.equal(v.tiles[0].el.hidden, false, 'Decliner must still hear the farewell');
  await v.roster.leave(roles[0]);
  assert.equal(v.grid.dataset.count, '3');
  const invalid = { ...declined, scores: [0, 100, 100, 100] };
  assert.throws(() => validateEvaluation(invalid, seeds, offered.scores), /Unexpected/, 'Decline cannot lower confidence');
});

test('accepted offer allows all remaining investors to close at unchanged scores and ends the game', () => {
  const accepted = { ...result(), scores: [100, 70, 80, 100], event: 'offer-accepted',
    gameOver: true, acceptedOffer: roles[0], decision: { role: roles[0], choice: 'accept' } };
  validateEvaluation(accepted, seeds, accepted.scores);
  assert.throws(() => validateEvaluation({ ...accepted, acceptedOffer: roles[3] }, seeds, accepted.scores), /Unexpected/);
  assert.throws(() => validateEvaluation({ ...accepted, pendingOffers: [roles[3]] }, seeds, accepted.scores), /Unexpected/);
});
