import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createReplyCoach } from '../server/reply-coach.mjs';
import { createApiServer } from '../server/app.mjs';
import { createAgentBridge } from '../server/agent-bridge.mjs';

// Reuse an explicitly fictional, recorded panel exchange. Never impersonate a live investor.
const evidence = JSON.parse(await readFile(new URL('../../docs/test-results/live-app-cli.json', import.meta.url), 'utf8'));
const round = evidence.rounds[0];
const live = process.argv.includes('--live');
const fixture = { summary: 'Investors asked about reliability and demand.', focus: 'Answer both questions honestly.', suggestedReply: 'I have not measured that yet. I will test reliability and ask founders why they returned.' };
const bridge = createAgentBridge();
const coach = createReplyCoach(live ? {} : { env: { OPENAI_API_KEY: 'offline-fixture' }, fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(fixture) }] }] }) }) });
const room = bridge.ensure();
const revision = bridge.finish(bridge.begin(room, { pitch: round.pitch }), round.result);
const server = createApiServer({ agentBridge: bridge, replyCoach: coach });
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const request = () => fetch(`http://127.0.0.1:${server.address().port}/api/coach`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `verdict_room=${room}` }, body: JSON.stringify({ revision, note: 'Keep it short. I have no additional measurements or customer evidence.' }) });
  const response = await request();
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  assert.equal(data.revision, revision);
  assert.ok(data.summary && data.focus && data.suggestedReply);
  const cached = await request(); assert.deepEqual(await cached.json(), data);
  console.log(JSON.stringify({ mode: live ? 'live OpenAI, fictional recorded transcript' : 'offline fixture', cachedRepeat: 'passed', ...data }, null, 2));
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  coach.close(); bridge.close(); server.closeAllConnections(); server.close();
}
