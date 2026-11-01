import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { createApiServer } from './app.mjs';
import { createTextPanelService } from './text-panel.mjs';

const client = new ElevenLabsClient();
const getSignedUrl = async agentId => {
  const response = await client.conversationalAi.conversations.getSignedUrl({ agentId }, { timeoutInSeconds: 15 });
  return response.signedUrl;
};
const textPanel = createTextPanelService({ getSignedUrl });
const server = createApiServer({ getSignedUrl, textPanel });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await textPanel.close();
  server.closeAllConnections();
  server.close();
});
const port = Number(process.env.PORT || 8787);
server.listen(port, '127.0.0.1', () => console.log(`Investor API listening on http://127.0.0.1:${port}`));
server.on('error', () => { console.error('Could not start investor API. Check PORT in .env.'); process.exitCode = 1; });
