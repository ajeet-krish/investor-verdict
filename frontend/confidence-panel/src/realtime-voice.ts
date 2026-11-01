import { Scribe, CommitStrategy, RealtimeEvents } from '@elevenlabs/client';
import type { RealtimeConnection } from '@elevenlabs/client';

export type VoiceState = 'off' | 'connecting' | 'listening' | 'paused';
type Handlers = {
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onState: (state: VoiceState) => void;
  onError: (message: string) => void;
};

export function createRealtimeVoice(h: Handlers, getToken: (signal: AbortSignal) => Promise<string>, connect = Scribe.connect) {
  let connection: RealtimeConnection | null = null;
  let enabled = false, ready = false, paused = false, generation = 0;
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = () => h.onState(!enabled ? 'off' : !ready ? 'connecting' : paused ? 'paused' : 'listening');
  const stop = () => {
    generation++;
    enabled = false; ready = false; paused = false;
    clearTimeout(timer);
    request?.abort(); request = null;
    const previous = connection; connection = null;
    previous?.close();
    h.onInterim(''); publish();
  };
  const fail = (message: string) => { stop(); h.onError(message); };
  const idle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => fail('Voice stopped after two minutes without speech. Click the microphone to reconnect.'), 120000);
  };
  const pause = () => {
    paused = true;
    clearTimeout(timer);
    try { if (ready) connection?.mute(); }
    catch { fail('Could not mute the microphone safely. Voice has stopped.'); return; }
    h.onInterim(''); publish();
  };
  return {
    get enabled() { return enabled; },
    async start() {
      if (enabled) return;
      enabled = true; ready = false; paused = false;
      const current = ++generation;
      request = new AbortController();
      publish();
      timer = setTimeout(() => fail('Voice connection timed out. Click the microphone to retry.'), 30000);
      try {
        const token = await getToken(request.signal);
        if (current !== generation) return;
        const socket = connect({
          token, modelId: 'scribe_v2_realtime', commitStrategy: CommitStrategy.VAD,
          vadSilenceThresholdSecs: 1.5,
          microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        connection = socket;
        socket.on(RealtimeEvents.AUDIO_STARTED, () => {
          if (current !== generation) return;
          ready = true;
          clearTimeout(timer);
          if (paused) pause(); else { idle(); publish(); }
        });
        socket.on(RealtimeEvents.PARTIAL_TRANSCRIPT, data => {
          if (current !== generation || paused || !ready) return;
          idle(); h.onInterim(data.text);
        });
        socket.on(RealtimeEvents.COMMITTED_TRANSCRIPT, data => {
          if (current !== generation || paused || !ready || !data.text.trim()) return;
          pause(); // Mute before invoking the app, so a second commit cannot start another turn.
          if (enabled) h.onFinal(data.text.trim());
        });
        socket.on(RealtimeEvents.ERROR, () => {
          if (current === generation) fail('Live transcription failed. Check microphone permission or ElevenLabs access, then reconnect.');
        });
        socket.on(RealtimeEvents.CLOSE, () => {
          if (current === generation) fail('The voice connection closed. Click the microphone to reconnect.');
        });
      } catch {
        if (current === generation) fail('Could not connect voice. Check microphone permission and ElevenLabs speech-to-text access.');
      }
    },
    pause,
    resume() {
      if (!enabled) return;
      paused = false;
      try { if (ready) { connection?.unmute(); idle(); } }
      catch { fail('Could not resume the microphone. Click it to reconnect.'); return; }
      publish();
    },
    stop,
  };
}
