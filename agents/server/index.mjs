import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { createApiServer } from './app.mjs';
import { createTextPanelService } from './text-panel.mjs';
import { createReplyAudio } from './reply-audio.mjs';

const client = new ElevenLabsClient({ maxRetries: 0 });
const getSignedUrl = async agentId => {
  const response = await client.conversationalAi.conversations.getSignedUrl({ agentId }, { timeoutInSeconds: 15 });
  return response.signedUrl;
};
const textPanel = createTextPanelService({ getSignedUrl });
const replyAudio = createReplyAudio({ textPanel, synthesize: ({ voiceId, text, signal }) => client.textToSpeech.stream(voiceId, {
  text, modelId: 'eleven_v4_turbo', outputFormat: 'mp3_44100_128',
}, { abortSignal: signal, timeoutInSeconds: 45, maxRetries: 0 }) });
const getVoiceToken = async () => (await client.tokens.singleUse.create('realtime_scribe', { maxRetries: 0, timeoutInSeconds: 15 })).token;
const server = createApiServer({ getSignedUrl, textPanel, replyAudio, getVoiceToken });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  replyAudio.close();
  await textPanel.close();
  server.closeAllConnections();
  server.close();
});
const port = Number(process.env.PORT || 8787);
server.listen(port, '127.0.0.1', () => console.log(`Investor API listening on http://127.0.0.1:${port}`));
server.on('error', () => { console.error('Could not start investor API. Check PORT in .env.'); process.exitCode = 1; });
