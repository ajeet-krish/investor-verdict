import "./style.css";
import { createReplyCoachUI } from "./reply-coach";
import { createAgentBridgeUI } from "./agent-bridge";
import type { AgentSubmission } from "./agent-bridge";
import { createRealtimeVoice } from "./realtime-voice";
import type { VoiceState } from "./realtime-voice";
import { createReplyPlayer } from "./reply-player";

/* ---------- Types ---------- */

type InvestorRole = "technical_expert" | "market_signals_researcher" | "interrogator" | "sympathizer";

interface Evaluation {
  scores: number[];
  responses: { role: InvestorRole; panelist: string; reply: string; spoke: boolean }[];
  speakingOrder: InvestorRole[];
  turn: number;
  bridgeRevision?: number;
}

interface Seed {
  role: InvestorRole;
  name: string;
  bg: string;
  score: number;
  photo: string;
}

interface Panelist extends Seed {
  el: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
  chip: HTMLElement;
  change: HTMLElement;
  verdict: HTMLElement;
}

/* ---------- Config ---------- */

const SEEDS: Seed[] = [
  { role: "technical_expert", name: "The CTO", bg: "#2b2320", score: 50, photo: "/investors/02_technical_expert_zoom.png" },
  { role: "market_signals_researcher", name: "The VP", bg: "#1f2a36", score: 50, photo: "/investors/01_market_signals_researcher_zoom.png" },
  { role: "interrogator", name: "The Interrogator", bg: "#1f2b25", score: 50, photo: "/investors/03_interrogator_zoom.png" },
  { role: "sympathizer", name: "The Sympathizer", bg: "#332a1c", score: 50, photo: "/investors/04_sympathizer_zoom.png" },
];

// The root launcher proxies this same-origin API; never put credentials in VITE variables.
const API_URL: string = import.meta.env.VITE_API_URL || "/api";

/* ---------- Helpers ---------- */

const pad = (n: number): string => String(n).padStart(2, "0");
const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : "\u00b10");

function colorFor(score: number): string {
  if (score < 40) return "#d9544f";
  if (score < 70) return "#e0a63a";
  return "#3fd16a";
}

function must<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

/* ---------- Scoring ---------- */

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); }
  catch { throw new Error("The investor service is unavailable. Please try again."); }
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${res.status}).`);
  return data;
}

async function evaluate(pitch: string, current: number[], job?: AgentSubmission): Promise<Evaluation> {
  const raw = await post("/evaluate", { pitch, panelists: SEEDS.map(s => s.name), scores: current, ...(job ? { bridgeJobId: job.id, bridgeAuto: job.automatic } : {}) });
  if (!raw || typeof raw !== "object") throw new Error("Unexpected investor response.");
  const data = raw as Evaluation;
  if (!Array.isArray(data.scores) || data.scores.length !== SEEDS.length ||
      !data.scores.every(s => typeof s === "number" && Number.isFinite(s) && s >= 0 && s <= 100) ||
      !Number.isSafeInteger(data.turn) || data.turn < 1 ||
      !Array.isArray(data.responses) || data.responses.length !== SEEDS.length ||
      !data.responses.every((r, i) => r && r.role === SEEDS[i].role && r.panelist === SEEDS[i].name &&
        typeof r.reply === "string" && typeof r.spoke === "boolean" &&
        (r.spoke ? r.reply.trim().length > 0 : r.reply === ""))) {
    throw new Error("Unexpected investor response.");
  }
  const speakers = data.responses.filter(r => r.spoke);
  if (!Array.isArray(data.speakingOrder) || data.speakingOrder.length > 2 || data.speakingOrder.length !== speakers.length ||
      new Set(data.speakingOrder).size !== speakers.length ||
      !data.speakingOrder.every(role => speakers.some(r => r.role === role))) {
    throw new Error("Unexpected investor speaker.");
  }
  return data;
}

/* ---------- Photos ---------- */

const photoKey = (i: number): string => `cp-photo-${i}`;

function savePhoto(i: number, url: string | null): void {
  try {
    if (url) localStorage.setItem(photoKey(i), url);
    else localStorage.removeItem(photoKey(i));
  } catch {
    /* storage unavailable or full; photo just won't persist */
  }
}

function loadPhoto(i: number): string | null {
  try {
    return localStorage.getItem(photoKey(i));
  } catch {
    return null;
  }
}

function cropToTile(file: File, width = 640, height = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No canvas context"));
        const scale = Math.max(width / img.width, height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function setPhoto(p: Panelist, url: string | null): void {
  p.el.style.backgroundImage = url ? `url("${url}")` : "none";
  p.el.classList.toggle("ph", url !== null);
}

function buildTile(seed: Seed, index: number, grid: HTMLElement): Panelist {
  const el = document.createElement("div");
  el.className = "t";
  el.style.backgroundColor = seed.bg;
  el.innerHTML = `
    <div class="chip" role="meter" aria-label="${seed.name} confidence" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
      <span class="score-label">Confidence</span>
      <span class="score-line"><strong class="v">50</strong><span class="score-total">/100</span><span class="score-change" hidden></span></span>
      <span class="score-verdict" hidden></span>
    </div>
    <div class="ctl">
      <label>Add photo<input type="file" accept="image/*" /></label>
      <button class="rm" type="button">Reset photo</button>
    </div>
    <div class="cb"><span>100</span>
      <div class="tr"><div class="fl"></div>
        <div class="tk" style="top:25%"></div><div class="tk" style="top:50%"></div><div class="tk" style="top:75%"></div>
      </div><span>0</span></div>
    <div class="nm"><span class="dot" title="Listening"></span>${seed.name}</div>`;
  grid.appendChild(el);

  const panelist: Panelist = {
    ...seed,
    el,
    fill: must<HTMLElement>(el, ".fl"),
    value: must<HTMLElement>(el, ".v"),
    chip: must<HTMLElement>(el, ".chip"),
    change: must<HTMLElement>(el, ".score-change"),
    verdict: must<HTMLElement>(el, ".score-verdict"),
  };

  const input = must<HTMLInputElement>(el, "input");
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const url = await cropToTile(file);
      setPhoto(panelist, url);
      savePhoto(index, url);
    } catch (err) {
      console.error(err);
    }
  });
  must<HTMLButtonElement>(el, ".rm").addEventListener("click", () => {
    savePhoto(index, null);
    setPhoto(panelist, seed.photo);
  });

  setPhoto(panelist, loadPhoto(index) ?? seed.photo);
  return panelist;
}

/* ---------- App ---------- */

function main(): void {
  const welcome = must<HTMLElement>(document, "#welcome");
  const app = must<HTMLElement>(document, "#app");
  const grid = must<HTMLElement>(document, "#grid");
  const chatbox = must<HTMLElement>(document, "#chatbox");
  const log = must<HTMLElement>(document, "#log");
  const form = must<HTMLFormElement>(document, "#form");
  const promptInput = must<HTMLInputElement>(document, "#prompt");
  const send = must<HTMLButtonElement>(document, "#send");
  const statusEl = must<HTMLElement>(document, "#status");
  const micBtn = must<HTMLButtonElement>(document, "#mic");
  const camBtn = must<HTMLButtonElement>(document, "#cam");
  const chatBtn = must<HTMLButtonElement>(document, "#chat");
  const freezeBtn = must<HTMLButtonElement>(document, "#freeze");
  const resetBtn = must<HTMLButtonElement>(document, "#reset");
  const leaveBtn = must<HTMLButtonElement>(document, "#leave");
  const startBtn = must<HTMLButtonElement>(document, "#start");
  const replyAudio = must<HTMLAudioElement>(document, "#reply-audio");
  const skipAudio = must<HTMLButtonElement>(document, "#skip-audio");
  freezeBtn.hidden = true; // Live confidence is authoritative; do not discard score updates.
  promptInput.maxLength = 4000;

  const panel = SEEDS.map((seed, i) => buildTile(seed, i, grid));
  let busy = false;
  let interim = "";
  let notice = "";
  let lastTurn = 0;
  let epoch = 0;
  let voiceState: VoiceState = 'off';
  let audioPlaying = false;
  let audioGeneration = 0;
  let bridge: ReturnType<typeof createAgentBridgeUI> | undefined;
  let coach: ReturnType<typeof createReplyCoachUI> | undefined;
  let speakingName = '';
  const player = createReplyPlayer(replyAudio, () => showNotice('Press play to hear the investor, or Skip reply to continue.'));
  const setBusy = (value: boolean): void => {
    busy = value;
    for (const control of [send, startBtn, promptInput]) control.disabled = value;
    resetBtn.disabled = leaveBtn.disabled = value && !audioPlaying;
    micBtn.disabled = value && voiceState === 'off';
    bridge?.refresh();
    coach?.refresh();
  };
  const showSpeaker = (role: InvestorRole | null): void => {
    panel.forEach(p => p.el.classList.toggle("responding", p.role === role));
  };

  /* status line */
  const renderStatus = (): void => {
    if (notice) statusEl.textContent = notice;
    else if (audioPlaying) statusEl.textContent = `${speakingName} is speaking. Your microphone is paused.`;
    else if (busy) statusEl.textContent = "The panel is deliberating…";
    else if (voiceState === 'connecting') statusEl.textContent = 'Connecting live audio… Allow microphone access when asked.';
    else if (voiceState === 'listening') statusEl.textContent = interim ? `Listening… ${interim}` : 'Listening… Pause briefly when you finish your turn.';
    else statusEl.textContent = "";
  };
  const showNotice = (message: string): void => {
    notice = message;
    renderStatus();
    window.setTimeout(() => {
      notice = "";
      renderStatus();
    }, 6000);
  };

  /* scores */
  const draw = (previous?: number[]): void => {
    panel.forEach((p, i) => {
      const v = Math.round(p.score);
      const delta = previous ? v - previous[i] : null;
      p.fill.style.height = `${v}%`;
      p.fill.style.backgroundColor = colorFor(v);
      p.value.textContent = String(v);
      p.chip.setAttribute('aria-valuenow', String(v));
      p.chip.setAttribute('aria-valuetext', `${v} out of 100${delta === null ? '' : `, ${signed(delta)} points this turn`}`);
      p.change.hidden = delta === null;
      p.change.textContent = delta === null ? '' : signed(delta);
      p.change.dataset.direction = delta === null || delta === 0 ? 'same' : delta > 0 ? 'up' : 'down';
      p.verdict.hidden = v !== 0 && v !== 100;
      p.verdict.textContent = v === 0 ? 'Passed' : v === 100 ? 'Simulated offer' : '';
    });
  };

  /* chat log */
  const addMsg = (classes: string, text: string): void => {
    const d = document.createElement("div");
    d.className = `msg ${classes}`;
    d.textContent = text;
    log.appendChild(d);
    while (log.children.length > 60) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  };

  /* One request at a time; no queued requests can leak into a new pitch. */
  const judge = async (text: string, job?: AgentSubmission): Promise<void> => {
    setBusy(true);
    coach?.begin(text, job ? "You (coding agent)" : "You");
    const current = epoch;
    const currentAudio = audioGeneration;
    let bridgeRevision: number | undefined;
    voice.pause();
    player.stop();
    replyAudio.hidden = true;
    showSpeaker(null);
    notice = "";
    renderStatus();
    try {
      let before = panel.map(p => p.score);
      const result = await evaluate(text, before, job);
      bridgeRevision = result.bridgeRevision;
      if (result.turn === 1 && lastTurn > 0) {
        before = panel.map(() => 50);
        coach?.reset();
        coach?.begin(text, job ? "You (coding agent)" : "You");
        addMsg("sys", "Your previous session expired. This pitch starts fresh at 50.");
      }
      lastTurn = result.turn;
      panel.forEach((p, i) => (p.score = result.scores[i]));
      draw(before);
      coach?.complete(result);
      addMsg("sys", panel.map((p, i) => `${p.name} ${p.score} (${signed(p.score - before[i])})`).join(" · "));
      if (!result.speakingOrder.length) showNotice("The panel is listening.");
      for (const role of result.speakingOrder) {
        if (current !== epoch) return;
        const reply = result.responses.find(r => r.role === role)!;
        showSpeaker(role);
        addMsg("investor", `${reply.panelist}: ${reply.reply}`);
        if (currentAudio === audioGeneration) {
          notice = "";
          speakingName = reply.panelist;
          audioPlaying = true;
          skipAudio.hidden = false;
          setBusy(true);
          renderStatus();
          const played = await player.play(`${API_URL}/reply-audio?turn=${result.turn}&role=${role}`);
          if (current !== epoch) return;
          if (!played) showNotice('Audio stopped or unavailable. The investor reply is in the chat.');
        }
      }
    } catch (err) {
      coach?.failure();
      const message = err instanceof Error ? err.message : "The panel couldn't respond.";
      addMsg("sys", `${message} Your text is below so you can retry.`);
      promptInput.value = text;
      voice.stop();
    } finally {
      if (current === epoch) {
        audioPlaying = false;
        showSpeaker(null);
        skipAudio.hidden = true;
        replyAudio.hidden = true;
        await bridge?.ready(bridgeRevision);
        setBusy(false);
        voice.resume();
        renderStatus();
        promptInput.focus();
      }
    }
  };

  const submit = (raw: string, via: "text" | "voice"): void => {
    const text = raw.trim();
    if (!text || busy || app.hidden) return;
    if (text.length > 4000) { voice.resume(); showNotice("Please keep your pitch under 4,000 characters."); return; }
    bridge?.pauseForHuman();
    promptInput.value = "";
    addMsg(via === "voice" ? "you voice" : "you", text);
    void judge(text);
  };

  const voice = createRealtimeVoice({
    onFinal: (text) => submit(text, "voice"),
    onInterim: (text) => { interim = text; coach?.interim(text); renderStatus(); },
    onState: (state) => {
      voiceState = state;
      if (state === 'off') coach?.interim('');
      micBtn.classList.toggle("live", state !== 'off');
      micBtn.setAttribute("aria-pressed", String(state !== 'off'));
      micBtn.setAttribute("aria-label", state !== 'off' ? 'Stop live audio' : 'Start live audio');
      panel.forEach(p => p.el.classList.toggle("hear", state === 'listening'));
      setBusy(busy);
      renderStatus();
    },
    onError: showNotice,
  }, async signal => {
    const response = await fetch(`${API_URL}/voice-token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal,
    });
    const data = await response.json();
    if (!response.ok || typeof data.token !== 'string') throw new Error('Voice token unavailable');
    return data.token;
  });

  bridge = createAgentBridgeUI(API_URL, {
    busy: () => busy, active: () => !app.hidden,
    notice: showNotice,
    submit: async (text, job) => {
      if (busy || app.hidden) return;
      addMsg('you agent', text);
      await judge(text, job);
    },
  });
  promptInput.addEventListener('input', () => bridge?.pauseForHuman());
  micBtn.setAttribute('aria-label', 'Start live audio');
  micBtn.addEventListener('click', () => {
    if (voice.enabled) { audioGeneration++; voice.stop(); player.stop(); }
    else if (!busy) { bridge?.pauseForHuman(); notice = ''; void voice.start(); }
  });
  skipAudio.addEventListener('click', () => player.stop());
  window.addEventListener('pagehide', () => { epoch++; audioGeneration++; bridge?.close(); coach?.close(); voice.stop(); player.stop(); });

  camBtn.addEventListener("click", () => {
    const on = camBtn.getAttribute("aria-pressed") !== "true";
    camBtn.setAttribute("aria-pressed", String(on));
    camBtn.setAttribute("aria-label", on ? "Hide photos" : "Show photos");
    app.classList.toggle("photos-off", !on);
  });

  chatBtn.addEventListener("click", () => {
    const open = chatBtn.getAttribute("aria-pressed") !== "true";
    chatBtn.setAttribute("aria-pressed", String(open));
    chatBtn.setAttribute("aria-label", open ? "Hide chat" : "Show chat");
    chatbox.hidden = !open;
    if (open) promptInput.focus();
  });

  // Evaluation must finish before reset; playing audio can be stopped immediately.
  const resetSession = async (): Promise<boolean> => {
    if (busy && !audioPlaying) return false;
    epoch++;
    coach?.reset();
    player.stop();
    replyAudio.hidden = true;
    skipAudio.hidden = true;
    audioPlaying = false;
    setBusy(true);
    voice.stop();
    showSpeaker(null);
    notice = "";
    renderStatus();
    try {
      const result = await post("/reset", {}) as { scores?: unknown; bridgeRevision?: number } | null;
      if (!result || !Array.isArray(result.scores) || result.scores.length !== 4 || !result.scores.every(s => s === 50)) {
        throw new Error("The session could not be reset. Please try again.");
      }
      bridge?.reset();
      coach?.reset(result.bridgeRevision);
      panel.forEach(p => (p.score = 50));
      lastTurn = 0;
      draw();
      log.replaceChildren();
      promptInput.value = "";
      return true;
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Couldn't reset the session. Please try again.");
      if (app.hidden) startBtn.textContent = "Couldn't connect. Click to retry";
      return false;
    } finally {
      setBusy(false);
      renderStatus();
    }
  };
  resetBtn.addEventListener("click", () => { void resetSession(); });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit(promptInput.value, "text");
  });

  /* welcome <-> call */
  startBtn.addEventListener("click", async () => {
    if (!await resetSession()) return;
    startBtn.textContent = "Click here to get started";
    welcome.hidden = true;
    app.hidden = false;
    window.scrollTo(0, 0);
    promptInput.focus();
  });
  leaveBtn.addEventListener("click", async () => {
    if (!await resetSession()) return;
    app.hidden = true;
    welcome.hidden = false;
    window.scrollTo(0, 0);
  });

  /* call timer */
  const timer = must<HTMLElement>(document, "#timer");
  let seconds = 872;
  setInterval(() => {
    seconds++;
    timer.textContent = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  }, 1000);

  coach = createReplyCoachUI(API_URL, {
    busy: () => busy,
    edit: () => bridge?.pauseForHuman(),
    attach: text => {
      bridge?.pauseForHuman();
      voice.stop();
      const current = promptInput.value.trim();
      const combined = current ? `${current} ${text}` : text;
      if (combined.length > 4000) { showNotice('Shorten your chat text or draft before adding the suggestion.'); return; }
      promptInput.value = combined;
      chatbox.hidden = false;
      chatBtn.setAttribute('aria-pressed', 'true');
      chatBtn.setAttribute('aria-label', 'Hide chat');
      promptInput.focus();
      showNotice('Suggestion added. Edit it, then press Send.');
    },
  });
  const layout = must<HTMLElement>(document, ".layout");
  const tipsEl = must<HTMLElement>(document, "#tips");
  const tipsBtn = must<HTMLButtonElement>(document, "#tipsbtn");
  tipsBtn.addEventListener("click", () => {
    const open = tipsBtn.getAttribute("aria-pressed") !== "true";
    tipsBtn.setAttribute("aria-pressed", String(open));
    tipsEl.hidden = !open;
    layout.classList.toggle("no-tips", !open);
  });

  draw();
}

main();
