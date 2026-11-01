import { readFileSync } from 'node:fs';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

// Branch IDs are configuration, not credentials. Test instructions never touch agent main.
export function createPanelProvider(env = process.env) {
  const branches = JSON.parse(readFileSync(env.ELEVENLABS_PANEL_BRANCHES_FILE || new URL('../panel-test-branches.json', import.meta.url), 'utf8'));
  const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY, maxRetries: 0 });
  let fallbackNoted = false;
  const getSignedUrl = async agentId => {
    const branch = branches.find(b => b.agentId === agentId);
    if (!branch?.branchId) {
      if (!fallbackNoted) {
        fallbackNoted = true;
        console.log('[panel-provider] No test branch mapping found, using main agent version.');
      }
      const response = await client.conversationalAi.conversations.getSignedUrl({ agentId }, { timeoutInSeconds: 15, maxRetries: 0 });
      return response.signedUrl;
    }
    const response = await client.conversationalAi.conversations.getSignedUrl({ agentId, branchId: branch.branchId }, { timeoutInSeconds: 15, maxRetries: 0 });
    return response.signedUrl;
  };
  return { client, getSignedUrl };
}
