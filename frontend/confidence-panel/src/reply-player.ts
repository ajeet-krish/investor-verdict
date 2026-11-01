export function createReplyPlayer(audio: HTMLAudioElement, onBlocked: () => void) {
  let finish: ((played: boolean) => void) | null = null;
  const stop = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    finish?.(false);
  };
  return {
    stop,
    play(url: string): Promise<boolean> {
      stop();
      audio.hidden = false;
      audio.src = url;
      return new Promise(resolve => {
        let ended = false;
        const done = (played: boolean) => {
          if (ended) return;
          ended = true;
          audio.onended = null; audio.onerror = null;
          finish = null;
          resolve(played);
        };
        finish = done;
        audio.onended = () => done(true);
        audio.onerror = () => done(false);
        void audio.play().catch(error => {
          if (ended) return;
          if (error?.name === 'NotAllowedError') onBlocked();
          else done(false);
        });
      });
    },
  };
}
