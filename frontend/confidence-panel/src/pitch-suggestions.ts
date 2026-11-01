type Suggestion = { label: string; reply: string };
export function createPitchSuggestions(api: string, hooks: { busy: () => boolean; attach: (text: string) => void }) {
  const get = (id: string) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing pitch suggestion element: ${id}`);
    return el;
  };
  const list = get('pitch-options'), heading = get('pitch-heading'), status = get('pitch-status');
  const starters = Array.from(list.querySelectorAll<HTMLButtonElement>('.pitch-option')).map(button => ({
    label: button.querySelector('.pitch-title')?.textContent?.trim() || '',
    reply: button.querySelector('.pitch-copy')?.textContent?.trim() || '',
  }));
  let buttons: HTMLButtonElement[] = [], request: AbortController | undefined, generation = 0;
  const refresh = () => buttons.forEach(button => { button.disabled = hooks.busy(); });
  const cancel = () => { generation++; request?.abort(); request = undefined; };
  const show = (suggestions: Suggestion[]) => {
    list.replaceChildren(); buttons = [];
    for (const suggestion of suggestions) {
      const li = document.createElement('li'), button = document.createElement('button');
      const title = document.createElement('span'), copy = document.createElement('span');
      button.type = 'button'; button.className = 'pitch-option';
      title.className = 'pitch-title'; title.textContent = suggestion.label;
      copy.className = 'pitch-copy'; copy.textContent = suggestion.reply;
      button.append(title, copy);
      button.addEventListener('click', () => { if (!hooks.busy()) hooks.attach(suggestion.reply); });
      li.appendChild(button); list.appendChild(li); buttons.push(button);
    }
    refresh();
  };
  const reset = () => {
    cancel(); heading.textContent = 'Pick a practice pitch';
    status.textContent = 'Three fictional product ideas. Select one to fill the main chat, then edit or press Send.';
    show(starters);
  };
  reset();
  return {
    refresh, reset, close: cancel,
    begin() {
      cancel(); buttons = []; list.replaceChildren(); heading.textContent = 'Your next reply';
      status.textContent = 'Listening to the panel. Suggestions will use this conversation.';
    },
    failed() { status.textContent = 'Retry your pitch in the main chat to continue.'; },
    async complete(revision?: number) {
      cancel();
      if (!Number.isSafeInteger(revision)) { status.textContent = 'Suggestions are unavailable for this session.'; return; }
      const current = generation;
      const controller = new AbortController(); request = controller;
      const timer = setTimeout(() => controller.abort(), 50000);
      status.textContent = 'Preparing three replies from your pitch and the investor questions…';
      try {
        const response = await fetch(`${api}/coach`, { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision }), signal: controller.signal });
        const data = await response.json();
        if (current !== generation) return;
        if (!response.ok) throw new Error(data.error || 'Suggestions are unavailable. You can still reply in the main chat.');
        if (data.revision !== revision || !Array.isArray(data.suggestions) || data.suggestions.length !== 3 || data.suggestions.some((s: Suggestion) => typeof s?.label !== 'string' || typeof s?.reply !== 'string' || !s.reply.trim())) throw new Error('Unexpected suggestion response. You can still reply in the main chat.');
        show(data.suggestions);
        status.textContent = 'Based on your conversation. Select a reply, edit it in the main chat, then press Send.';
      } catch (error) {
        if (current === generation) status.textContent = controller.signal.aborted ? 'Suggestions timed out. You can still reply in the main chat.' : error instanceof Error ? error.message : 'Suggestions are unavailable.';
      } finally {
        clearTimeout(timer);
        if (current === generation) { request = undefined; refresh(); }
      }
    },
  };
}
