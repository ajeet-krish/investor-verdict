import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfferChoices } from '../../frontend/confidence-panel/src/offer-choices.ts';

function node() {
  return { children: [], events: {}, hidden: false, textContent: '', disabled: false,
    append(...els) { this.children.push(...els); }, replaceChildren() { this.children = []; },
    setAttribute() {}, addEventListener(event, handler) { this.events[event] = handler; } };
}
test('offers require an explicit click, wait for playback and lock against double decisions', t => {
  const original = globalThis.document; globalThis.document = { createElement: node };
  t.after(() => { globalThis.document = original; });
  const root = node(), decisions = [];
  let busy = true;
  const ui = createOfferChoices(root, [{ role: 'technical_expert', name: 'The CTO' }, { role: 'sympathizer', name: 'The Sympathizer' }],
    { busy: () => busy, decide: (...args) => decisions.push(args) });
  ui.update(['technical_expert', 'sympathizer']);
  assert.deepEqual(decisions, []);
  const accept = root.children[2].children[1], decline = root.children[3].children[2];
  assert.equal(accept.disabled, true);
  accept.events.click(); assert.equal(decisions.length, 0);
  busy = false; ui.refresh(); decline.events.click(); accept.events.click();
  assert.deepEqual(decisions, [['sympathizer', 'decline']]);
  assert.equal(accept.disabled, true);
  ui.update(['technical_expert']);
  root.children[2].children[1].events.click();
  assert.deepEqual(decisions.at(-1), ['technical_expert', 'accept']);
  ui.update([]); assert.equal(root.hidden, true);
  accept.events.click(); assert.equal(decisions.length, 2, 'Old buttons cannot act after reset');
});

test('a failed request requires another user click to retry the decision', t => {
  const original = globalThis.document; globalThis.document = { createElement: node };
  t.after(() => { globalThis.document = original; });
  const root = node(); let requests = 0;
  const ui = createOfferChoices(root, [{ role: 'technical_expert', name: 'The CTO' }], { busy: () => false, decide: () => requests++ });
  ui.update(['technical_expert']); const accept = root.children[2].children[1];
  accept.events.click(); ui.failed(); assert.equal(requests, 1);
  accept.events.click(); assert.equal(requests, 2);
});
