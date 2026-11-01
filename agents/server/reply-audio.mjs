import { PanelError } from './text-panel.mjs';

// Verified against the existing remote agents and the account's voice list.
export const INVESTOR_VOICES = Object.freeze({
  technical_expert: 'bIHbv24MWmeRgasZH58o',
  market_signals_researcher: 'Xb7hH8MSUJpSbSDYk0k2',
  interrogator: 'JBFqnCBsd6RMkjVDRZzb',
  sympathizer: 'EXAVITQu4vr4xnSDxMaL',
});

// Share one synthesis per reply, including browser media re-requests. No automatic paid retry.
export function createReplyAudio({ textPanel, synthesize, ttlMs = 120000, maxBytes = 8000000 }) {
  const jobs = new Map();
  function remove(key, job) {
    jobs.delete(key);
    clearTimeout(job.timer);
    job.abort.abort();
    job.error = new PanelError('Audio was stopped.', 409);
    job.done = true;
    for (const wake of job.waiters) wake();
    job.waiters.clear();
  }
  return {
    open(sessionId, turn, signal) {
      // Authorize using the cookie and authoritative selected reply, never client text/voice IDs.
      const reply = textPanel.getSpeech(sessionId, turn);
      const voiceId = INVESTOR_VOICES[reply.role];
      if (!voiceId) throw new PanelError('Investor voice is not configured.', 503);
      const key = `${sessionId}:${turn}`;
      let job = jobs.get(key);
      if (!job) {
        for (const [oldKey, oldJob] of jobs) if (oldKey.startsWith(`${sessionId}:`)) remove(oldKey, oldJob);
        if (jobs.size >= 16) throw new PanelError('Audio capacity reached. Try later.', 429);
        job = { parts: [], size: 0, done: false, error: null, users: 0, waiters: new Set(), abort: new AbortController() };
        const current = job;
        current.timer = setTimeout(() => remove(key, current), ttlMs);
        current.timer.unref?.();
        jobs.set(key, current);
        void (async () => {
          const timeout = setTimeout(() => current.abort.abort(), 45000);
          try {
            const upstream = await synthesize({ text: reply.text, voiceId, signal: current.abort.signal });
            if (current.abort.signal.aborted) { await upstream.cancel?.(); throw new Error('Stopped'); }
            for await (const chunk of upstream) {
              if (current.abort.signal.aborted) throw new Error('Stopped');
              current.size += chunk.length;
              if (current.size > maxBytes) throw new Error('Audio too large');
              current.parts.push(chunk);
              for (const wake of current.waiters) wake();
              current.waiters.clear();
            }
            if (!current.size) throw new Error('Empty audio');
          } catch {
            current.error = new PanelError('Investor audio failed. The text reply is still available.', 502);
            current.abort.abort();
          } finally {
            clearTimeout(timeout);
            current.done = true;
            for (const wake of current.waiters) wake();
            current.waiters.clear();
          }
        })();
      }
      const current = job;
      return (async function* () {
        current.users++;
        let index = 0;
        try {
          while (!signal?.aborted) {
            if (current.error) throw current.error;
            if (index < current.parts.length) { yield current.parts[index++]; continue; }
            if (current.done) break;
            await new Promise(resolve => {
              const wake = () => { current.waiters.delete(wake); signal?.removeEventListener('abort', wake); resolve(); };
              current.waiters.add(wake);
              signal?.addEventListener('abort', wake, { once: true });
              if (signal?.aborted) wake();
            });
          }
        } finally {
          current.users--;
          if (!current.users && !current.done) {
            current.abort.abort();
            current.error = new PanelError('Audio was stopped. The text reply is still available.', 409);
          }
        }
      })();
    },
    reset(sessionId) { for (const [key, job] of jobs) if (key.startsWith(`${sessionId}:`)) remove(key, job); },
    close() { for (const [key, job] of jobs) remove(key, job); },
  };
}
