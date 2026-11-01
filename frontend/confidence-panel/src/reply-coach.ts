type Round = { bridgeRevision?: number; responses: { role: string; panelist: string; reply: string }[]; speakingOrder: string[] };
type Recommendation = { revision: number; summary: string; focus: string; suggestedReply: string };

export function createReplyCoachUI(api: string, hooks: { busy: () => boolean; attach: (text: string) => void; edit?: () => void }) {
  const el = <T extends HTMLElement>(id: string): T => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing coach element: ${id}`);
    return node as T;
  };
  const status = el('coach-status'), summary = el('coach-summary'), focus = el('coach-focus');
  const draft = el<HTMLTextAreaElement>('coach-draft'), note = el<HTMLTextAreaElement>('coach-note');
  const refresh = el<HTMLButtonElement>('coach-refresh'), use = el<HTMLButtonElement>('coach-use');
  const automatic = el<HTMLInputElement>('coach-auto'), transcript = el('coach-transcript'), interim = el('coach-interim');
  let revision: number | undefined, generation = 0, request: AbortController | undefined, suggested = false;
  const render = () => {
    refresh.disabled = revision === undefined || Boolean(request) || hooks.busy();
    use.disabled = !suggested || !draft.value.trim() || hooks.busy();
  };
  const cancel = () => { generation++; request?.abort(); request = undefined; };
  const clearSuggestion = () => {
    suggested = false; draft.value = ''; summary.textContent = ''; focus.textContent = '';
  };
  const addTranscript = (speaker: string, text: string) => {
    const line = document.createElement('p');
    const label = document.createElement('strong'); label.textContent = `${speaker}: `;
    const content = document.createElement('span'); content.textContent = text;
    line.append(label, content); transcript.appendChild(line);
    while (transcript.children.length > 24) transcript.firstElementChild?.remove();
    transcript.scrollTop = transcript.scrollHeight;
  };
  const recommend = async () => {
    if (revision === undefined || request) return;
    const current = ++generation, expected = revision;
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    clearSuggestion(); status.textContent = 'Preparing a reply from the conversation…'; render();
    try {
      const response = await fetch(`${api}/coach`, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: expected, note: note.value.trim() }), signal: controller.signal });
      const data = await response.json() as Recommendation & { error?: string };
      if (current !== generation) return;
      if (!response.ok) throw new Error(data.error || 'Could not prepare a reply. Try again when ready.');
      if (data.revision !== revision || !['summary','focus','suggestedReply'].every(k => typeof data[k as keyof Recommendation] === 'string')) throw new Error('The conversation changed. Refresh the suggestion.');
      summary.textContent = data.summary; focus.textContent = data.focus; draft.value = data.suggestedReply;
      suggested = true; status.textContent = 'Edit the draft, then add it to chat. Fill in any [placeholders].';
    } catch (error) {
      if (current === generation) status.textContent = controller.signal.aborted ? 'The coach timed out. Refresh when ready.' : error instanceof Error ? error.message : 'Could not prepare a suggestion.';
    } finally {
      clearTimeout(timeout);
      if (current === generation) { request = undefined; render(); }
    }
  };
  refresh.addEventListener('click', () => { if (!hooks.busy()) void recommend(); });
  use.addEventListener('click', () => { if (suggested && !hooks.busy() && draft.value.trim()) hooks.attach(draft.value.trim()); });
  draft.addEventListener('input', () => {
    hooks.edit?.(); cancel(); suggested = Boolean(draft.value.trim()) && revision !== undefined;
    status.textContent = 'Your edited draft. Add it to chat when ready.'; render();
  });
  note.addEventListener('input', () => {
    hooks.edit?.(); cancel(); suggested = false;
    status.textContent = 'Note changed. Update the suggestion to use it.'; render();
  });
  automatic.addEventListener('change', () => {
    if (!automatic.checked) { cancel(); status.textContent = suggested ? 'Automatic suggestions paused. You can still use this draft.' : 'Automatic suggestions paused.'; render(); }
    else if (revision !== undefined && !hooks.busy()) void recommend();
  });
  render();
  return {
    begin(text: string, speaker = 'You') {
      cancel(); revision = undefined; clearSuggestion(); interim.textContent = '';
      addTranscript(speaker, text); status.textContent = 'Waiting for the investors…'; render();
    },
    complete(result: Round) {
      revision = result.bridgeRevision;
      for (const role of result.speakingOrder) {
        const reply = result.responses.find(r => r.role === role);
        if (reply) addTranscript(reply.panelist, reply.reply);
      }
      status.textContent = 'Ask for a suggested reply when you are ready.'; render();
      if (automatic.checked) void recommend();
    },
    failure() { status.textContent = 'No completed investor round yet. Retry your pitch to continue.'; render(); },
    interim(text: string) { interim.textContent = text ? `You (live): ${text}` : ''; },
    refresh: render,
    reset() {
      cancel(); revision = undefined; clearSuggestion(); note.value = '';
      transcript.replaceChildren(); interim.textContent = '';
      status.textContent = 'Send a pitch or speak to get a suggested reply.'; render();
    },
    close: cancel,
  };
}
