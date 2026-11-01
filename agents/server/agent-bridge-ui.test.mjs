import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createAgentBridgeUI } from '../../frontend/confidence-panel/src/agent-bridge.ts';

// No browser: exercise the real UI controller with tiny DOM/event and HTTP adapters.
function setup(t, { state, submit = async () => {}, request } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, disabled: false, textContent: '', events: {}, addEventListener(name, fn) { this.events[name] = fn; } });
    return elements.get(id);
  };
  let tick, busy = false;
  const originals = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  globalThis.document = { getElementById: element };
  globalThis.window = { setInterval: fn => { tick = fn; return 1; } };
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = url.split('/').at(-1), body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, body });
    const data = request ? await request(path, body) : path === 'connect' ? { token: 'test-token', connected: true, autoSend: true } : state;
    return { ok: true, json: async () => data };
  };
  const notices = [];
  const ui = createAgentBridgeUI('/api', { busy: () => busy, active: () => true, submit, notice: text => notices.push(text) });
  t.after(() => { ui.close(); Object.assign(globalThis, originals); });
  return { ui, element, calls, notices, tick: async () => { tick(); await setImmediate(); }, busy: value => { busy = value; } };
}
const suggestion = { id: 'draft-001', author: 'Coder agent', pitch: '<script>not HTML</script>', revision: 1, status: 'pending' };

test('one approval enables automatic submissions; busy playback prevents another turn', async t => {
  const sent = [];
  const fixture = setup(t, { state: { connected: true, autoSend: true, ready: true, pending: suggestion }, submit: async (...args) => { sent.push(args); } });
  await fixture.element('agent-connect').events.click();
  fixture.busy(true); await fixture.tick(); assert.equal(sent.length, 0);
  assert.equal(fixture.element('agent-draft-text').textContent, `Coder agent: ${suggestion.pitch}`);
  fixture.busy(false); await fixture.tick();
  assert.deepEqual(sent, [[suggestion.pitch, { id: suggestion.id, automatic: true }]]);
});

test('human typing or microphone takeover cannot be undone by an old poll while pause is in flight', async t => {
  let releasePause;
  const waiting = new Promise(resolve => { releasePause = resolve; });
  const sent = [];
  const fixture = setup(t, { submit: async x => sent.push(x), request: async path => {
    if (path === 'connect') return { connected: true, autoSend: true, token: 'test-token' };
    if (path === 'mode') { await waiting; return {}; }
    return { connected: true, autoSend: true, ready: true, pending: suggestion };
  } });
  await fixture.element('agent-connect').events.click();
  fixture.ui.pauseForHuman();
  await fixture.tick();
  assert.equal(sent.length, 0);
  assert.equal(fixture.element('agent-toggle').textContent, 'Resume agent');
  releasePause(); await setImmediate();
});

test('reset during an outstanding poll suppresses stale suggestions', async t => {
  let resolvePoll;
  const sent = [];
  const fixture = setup(t, { submit: async x => sent.push(x), request: async path => path === 'connect'
    ? { connected: true, autoSend: true, token: 'test-token' }
    : new Promise(resolve => { resolvePoll = resolve; }) });
  await fixture.element('agent-connect').events.click();
  await fixture.tick(); fixture.ui.reset();
  resolvePoll({ connected: true, autoSend: true, ready: true, pending: suggestion });
  await setImmediate();
  assert.equal(sent.length, 0);
  assert.equal(fixture.element('agent-connect').hidden, false);
});
