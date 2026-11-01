type Suggestion = { id: string; author: string; pitch: string; revision: number; status: string };
type BridgeState = { connected: boolean; autoSend: boolean; revision: number; ready: boolean; pending: Suggestion | null };
export type AgentSubmission = { id: string; automatic: boolean };

export function createAgentBridgeUI(apiUrl: string, options: {
  busy: () => boolean; active: () => boolean;
  submit: (pitch: string, job: AgentSubmission) => Promise<void>;
  notice: (text: string) => void;
}) {
  const find = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const connect = find<HTMLButtonElement>('agent-connect');
  const disconnect = find<HTMLButtonElement>('agent-disconnect');
  const toggle = find<HTMLButtonElement>('agent-toggle');
  const copy = find<HTMLButtonElement>('agent-copy');
  const status = find<HTMLElement>('agent-status');
  const draft = find<HTMLElement>('agent-draft');
  const draftText = find<HTMLElement>('agent-draft-text');
  const approve = find<HTMLButtonElement>('agent-approve');
  const reject = find<HTMLButtonElement>('agent-reject');
  let connected = false, autoSend = false, polling = false, submitting = false;
  let generation = 0, token = '', pending: Suggestion | null = null, modeVersion = 0, modePending = 0;
  let modeWrites = Promise.resolve();

  async function request(path: string, body?: unknown): Promise<BridgeState & { token?: string }> {
    const response = await fetch(`${apiUrl}/agent-bridge/${path}`, body === undefined
      ? { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'App connection failed.');
    return data;
  }
  function render() {
    connect.hidden = connected;
    disconnect.hidden = toggle.hidden = copy.hidden = !connected;
    connect.disabled = options.busy();
    copy.disabled = !token;
    toggle.textContent = autoSend ? 'Pause agent' : 'Resume agent';
    toggle.disabled = modePending > 0;
    status.textContent = !connected ? 'Allow your coding agent once, then it can send founder replies. Chat and voice remain yours.'
      : autoSend ? 'Agent control on. Typing or starting voice pauses it.' : 'Agent paused. You can chat, speak, or send its suggestion below.';
    draft.hidden = !pending;
    draftText.textContent = pending ? `${pending.author}: ${pending.pitch}` : '';
    approve.disabled = reject.disabled = options.busy() || submitting;
  }
  async function send(automatic: boolean) {
    if (!pending || submitting || options.busy() || !options.active() || (automatic && !autoSend)) return;
    const job = pending;
    pending = null; submitting = true; render();
    try { await options.submit(job.pitch, { id: job.id, automatic }); }
    finally { submitting = false; render(); }
  }
  // Pause locally immediately; a delayed poll must not re-enable agent control.
  async function setMode(value: boolean) {
    const version = ++modeVersion;
    autoSend = value; modePending++; render();
    modeWrites = modeWrites.then(async () => {
      if (version !== modeVersion) return;
      try { await request('mode', { autoSend: value }); }
      catch (error) { if (version === modeVersion) { autoSend = false; options.notice((error as Error).message); } }
    }).finally(() => { modePending--; render(); });
    await modeWrites;
  }
  async function poll() {
    if (!connected || polling || !options.active()) return;
    polling = true;
    const current = generation, version = modeVersion;
    try {
      const state = await request('session');
      if (current !== generation) return;
      if (!state.connected) { resetLocal(); return; }
      if (version === modeVersion && modePending === 0) autoSend = state.autoSend;
      pending = state.pending;
      render();
      if (autoSend && state.ready) await send(true);
    } catch (error) {
      if (current === generation) { resetLocal(); options.notice((error as Error).message); }
    } finally { polling = false; }
  }
  function resetLocal() {
    generation++; modeVersion++; connected = false; autoSend = false; pending = null; token = ''; render();
  }
  connect.addEventListener('click', async () => {
    if (options.busy()) return;
    connect.disabled = true;
    try {
      const state = await request('connect', {});
      connected = true; autoSend = true; token = state.token || ''; generation++; render();
      options.notice('Connected. Copy the connection for your coding agent.');
    } catch (error) { options.notice((error as Error).message); render(); }
  });
  toggle.addEventListener('click', () => { void setMode(!autoSend); });
  disconnect.addEventListener('click', async () => {
    autoSend = false; render();
    try { await request('disconnect', {}); resetLocal(); }
    catch (error) { options.notice((error as Error).message); }
  });
  copy.addEventListener('click', async () => {
    // Copy to the human's clipboard only on their click. Tokens never enter URLs or localStorage.
    try {
      await navigator.clipboard.writeText(JSON.stringify({ baseUrl: new URL(apiUrl, location.href).href.replace(/\/$/, ''), token }, null, 2));
      options.notice('Connection copied. Give it only to the coding agent working with you.');
    } catch { options.notice('Clipboard unavailable. Use localhost or HTTPS and try again.'); }
  });
  approve.addEventListener('click', () => { void send(false); });
  reject.addEventListener('click', async () => {
    if (!pending || options.busy()) return;
    try { await request('reject', { id: pending.id }); pending = null; render(); }
    catch (error) { options.notice((error as Error).message); }
  });
  const timer = window.setInterval(() => { void poll(); }, 1000);
  render();
  return {
    pauseForHuman: () => { if (connected && autoSend) void setMode(false); },
    refresh: render,
    reset: resetLocal,
    ready: async (revision: number | undefined) => {
      if (revision === undefined) return;
      try { await request('ready', { revision }); } catch { /* Reset or a newer round superseded this one. */ }
    },
    close: () => { clearInterval(timer); generation++; autoSend = false; },
  };
}
