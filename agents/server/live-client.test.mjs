import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveClient } from '../elevenlabs-client.js';
import { createInterestController } from '../../visuals/confidence/interest-controller.mjs';
test('live client registers score tools, uses signed URLs, broadcasts and cleans up', async () => {
  const roleKeys = { cto: 'market_signals_researcher', tech_bro: 'technical_expert', interrogator: 'interrogator', sympathizer: 'sympathizer' };
  const configs = [], messages = [], volumes = [], ended = [];
  const controller = createInterestController();
  const client = createLiveClient({
    agentIds: Object.fromEntries(Object.keys(roleKeys).map(key => [key, `agent_${key}`])),
    getSignedUrl: async key => `wss://example.test/${key}`,
    textOnly: true,
    clientToolsFor: key => controller.clientToolsFor(roleKeys[key]),
    Conversation: { startSession: async config => {
      configs.push(config);
      return { setVolume: value => volumes.push(value), sendUserMessage: text => messages.push(text), endSession: async () => ended.push(config.signedUrl) };
    } },
  });
  await client.start();
  assert.equal(configs.length, 4);
  assert.ok(configs.every(c => c.signedUrl && c.textOnly && c.connectionType === 'websocket' && !('userMediaStream' in c)));
  const score = JSON.parse(configs[0].clientTools.report_investor_interest({ turn_number: 1, confidence: 60, reason: 'Clear customer evidence.' }));
  assert.equal(score.confidence, 60);
  assert.ok(volumes.every(value => typeof value === 'object' && 'volume' in value));
  await client.sendUserText('We have paying customers.'); assert.equal(messages.length, 4);
  await client.stop(); assert.equal(ended.length, 4); controller.close();
});
