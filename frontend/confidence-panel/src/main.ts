import "./style.css";

/* ---------- Types ---------- */

type InvestorRole = "technical_expert" | "market_signals_researcher" | "interrogator" | "sympathizer";

interface Evaluation {
  scores: number[];
  responses: { role: InvestorRole; panelist: string; reply: string; spoke: boolean }[];
  speaker: InvestorRole | null;
  turn: number;
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
}

/* The Web Speech API isn't in TypeScript's DOM lib yet, so we type the bits we use. */
interface SpeechResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

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

async function evaluate(pitch: string, current: number[]): Promise<Evaluation> {
  const raw = await post("/evaluate", { pitch, panelists: SEEDS.map(s => s.name), scores: current });
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
  if (data.speaker === null ? speakers.length !== 0 : speakers.length !== 1 || speakers[0].role !== data.speaker) {
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
    <div class="rd"><div class="v">0</div><div class="c">confidence</div></div>
    <div class="chip"></div>
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

/* ---------- Voice ---------- */

interface VoiceHandlers {
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onState: (live: boolean) => void;
  onError: (message: string) => void;
}

interface Voice {
  readonly supported: boolean;
  readonly live: boolean;
  start(): void;
  stop(): void;
}

function createVoice(h: VoiceHandlers): Voice {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  let rec: RecognitionLike | null = null;
  let wanted = false;

  const spawn = (): void => {
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0].transcript;
        if (result.isFinal) h.onFinal(text);
        else interim += text;
      }
      h.onInterim(interim);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted = false;
      const blocked = e.error === "not-allowed" || e.error === "service-not-allowed";
      h.onError(blocked ? "Microphone access was blocked. Allow it in your browser settings and try again." : `Voice error: ${e.error}`);
    };
    r.onend = () => {
      if (wanted) {
        try {
          spawn(); // browsers end sessions after silence; keep listening
        } catch {
          wanted = false;
          h.onState(false);
        }
      } else {
        h.onInterim("");
        h.onState(false);
      }
    };
    rec = r;
    r.start();
  };

  return {
    supported: Ctor !== null,
    get live() {
      return wanted;
    },
    start() {
      if (!Ctor || wanted) return;
      wanted = true;
      try {
        spawn();
        h.onState(true);
      } catch {
        wanted = false;
        h.onError("Couldn't start the microphone.");
      }
    },
    stop() {
      wanted = false;
      rec?.stop();
      h.onInterim("");
      h.onState(false);
    },
  };
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
  freezeBtn.hidden = true; // Live confidence is authoritative; do not discard score updates.
  promptInput.maxLength = 4000;

  const panel = SEEDS.map((seed, i) => buildTile(seed, i, grid));
  let busy = false;
  let interim = "";
  let notice = "";
  let lastTurn = 0;
  const setBusy = (value: boolean): void => {
    busy = value;
    for (const control of [send, resetBtn, leaveBtn, startBtn, micBtn, promptInput]) control.disabled = value;
  };
  const showSpeaker = (role: InvestorRole | null): void => {
    panel.forEach(p => p.el.classList.toggle("responding", p.role === role));
  };

  /* status line */
  const renderStatus = (): void => {
    if (notice) statusEl.textContent = notice;
    else if (busy) statusEl.textContent = "The panel is deliberating\u2026";
    else if (voice.live) statusEl.textContent = interim ? `Listening\u2026 ${interim}` : "Listening\u2026";
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
  const draw = (): void => {
    for (const p of panel) {
      const v = Math.round(p.score);
      p.fill.style.height = `${v}%`;
      p.fill.style.backgroundColor = colorFor(v);
      p.value.textContent = String(v);
      p.chip.textContent = v === 0 ? "Passed · 0" : v === 100 ? "Simulated offer · 100" : `Confidence ${v}`;
    }
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
  const judge = async (text: string): Promise<void> => {
    setBusy(true);
    voice.stop();
    showSpeaker(null);
    notice = "";
    renderStatus();
    try {
      let before = panel.map(p => p.score);
      const result = await evaluate(text, before);
      if (result.turn === 1 && lastTurn > 0) {
        before = panel.map(() => 50);
        addMsg("sys", "Your previous session expired. This pitch starts fresh at 50.");
      }
      lastTurn = result.turn;
      panel.forEach((p, i) => (p.score = result.scores[i]));
      draw();
      addMsg("sys", panel.map((p, i) => `${p.name} ${p.score} (${signed(p.score - before[i])})`).join(" · "));
      const reply = result.responses.find(r => r.spoke);
      showSpeaker(result.speaker);
      if (reply) addMsg("investor", `${reply.panelist}: ${reply.reply}`);
      else showNotice("The panel is listening.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "The panel couldn't respond.";
      addMsg("sys", `${message} Your text is below so you can retry.`);
      promptInput.value = text;
    } finally {
      setBusy(false);
      renderStatus();
      promptInput.focus();
    }
  };

  const submit = (raw: string, via: "text" | "voice"): void => {
    const text = raw.trim();
    if (!text || busy || app.hidden) return;
    if (text.length > 4000) { showNotice("Please keep your pitch under 4,000 characters."); return; }
    promptInput.value = "";
    addMsg(via === "voice" ? "you voice" : "you", text);
    void judge(text);
  };

  /* voice: the panel listens to everything you say */
  const voice = createVoice({
    onFinal: (text) => submit(text, "voice"),
    onInterim: (text) => {
      interim = text;
      renderStatus();
    },
    onState: (live) => {
      micBtn.classList.toggle("live", live);
      micBtn.setAttribute("aria-pressed", String(live));
      micBtn.setAttribute("aria-label", live ? "Turn microphone off" : "Turn microphone on");
      panel.forEach((p) => p.el.classList.toggle("hear", live));
      renderStatus();
    },
    onError: (message) => showNotice(message),
  });

  /* toolbar */
  micBtn.addEventListener("click", () => {
    if (!voice.supported) {
      showNotice("Voice isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }
    if (voice.live) voice.stop();
    else voice.start();
  });

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

  // Reset/Leave are disabled while evaluating, avoiding late responses and cookie races.
  const resetSession = async (): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    voice.stop();
    showSpeaker(null);
    notice = "";
    renderStatus();
    try {
      const result = await post("/reset", {}) as { scores?: unknown } | null;
      if (!result || !Array.isArray(result.scores) || result.scores.length !== 4 || !result.scores.every(s => s === 50)) {
        throw new Error("The session could not be reset. Please try again.");
      }
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

  draw();
}

main();
