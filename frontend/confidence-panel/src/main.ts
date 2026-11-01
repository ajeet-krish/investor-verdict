import "./style.css";

/* ---------- Types ---------- */

interface Seed {
  name: string;
  bg: string;
  score: number;
  photo: string;
}

interface Panelist extends Seed {
  start: number;
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
  { name: "The CTO", bg: "#2b2320", score: 62, photo: "/investors/02_technical_expert_zoom.png" },
  { name: "The VP", bg: "#1f2a36", score: 41, photo: "/investors/01_market_signals_researcher_zoom.png" },
  { name: "The Interrogator", bg: "#1f2b25", score: 78, photo: "/investors/03_interrogator_zoom.png" },
  { name: "The Sympathizer", bg: "#332a1c", score: 55, photo: "/investors/04_sympathizer_zoom.png" },
];

// Set VITE_API_URL (for example in frontend/.env) to score pitches on your backend.
const API_URL: string | undefined = import.meta.env.VITE_API_URL;

/* ---------- Helpers ---------- */

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
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

// PLACEHOLDER: a simple keyword heuristic so the bars react while there's no backend.
// Replace by setting VITE_API_URL; the server should answer POST {API_URL}/evaluate.
const TRAITS: string[][] = [
  ["revenue", "profit", "margin", "sales", "price", "growth", "%", "$"],
  ["data", "proof", "evidence", "risk", "competitor", "test", "pilot", "cost"],
  ["team", "plan", "process", "hire", "launch", "roadmap", "scale", "ship"],
  ["customer", "market", "experience", "years", "retention", "partner", "brand", "distribution"],
];

function localEvaluate(pitch: string, current: number[]): number[] {
  const text = pitch.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  const detail = Math.min(words, 40) / 40;
  return current.map((score, i) => {
    const hits = TRAITS[i].filter((t) => text.includes(t)).length;
    const delta = hits * 6 + detail * 6 - 7 + (Math.random() - 0.5) * 4;
    return clamp(score + delta, 5, 98);
  });
}

async function evaluate(pitch: string, current: number[]): Promise<number[]> {
  if (!API_URL) return localEvaluate(pitch, current);
  const res = await fetch(`${API_URL}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pitch, panelists: SEEDS.map((s) => s.name), scores: current }),
  });
  if (!res.ok) throw new Error(`Evaluate failed: ${res.status}`);
  const data = (await res.json()) as { scores?: unknown };
  const scores = data.scores;
  if (!Array.isArray(scores) || scores.length !== current.length || !scores.every((s) => typeof s === "number")) {
    throw new Error("Unexpected response shape");
  }
  return (scores as number[]).map((s) => clamp(s, 0, 100));
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
    start: seed.score,
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
  const freezeLabel = must<HTMLElement>(document, "#freeze-label");

  const panel = SEEDS.map((seed, i) => buildTile(seed, i, grid));
  let frozen = false;
  let busy = false;
  let interim = "";
  let notice = "";
  let chain: Promise<void> = Promise.resolve();

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
      p.chip.textContent = `Confidence ${v}`;
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

  /* judging pipeline: text and voice both land here, one pitch at a time */
  const judge = async (text: string): Promise<void> => {
    busy = true;
    send.disabled = true;
    renderStatus();
    try {
      const before = panel.map((p) => p.score);
      const next = await evaluate(text, before);
      if (frozen) {
        addMsg("sys", "Scores are frozen, so this pitch didn't change them.");
      } else {
        panel.forEach((p, i) => (p.score = next[i]));
        draw();
        addMsg(
          "sys",
          panel.map((p, i) => `${p.name} ${Math.round(p.score)} (${signed(Math.round(p.score) - Math.round(before[i]))})`).join(" \u00b7 "),
        );
      }
    } catch (err) {
      console.error(err);
      addMsg("sys", "The panel couldn't respond. Check your connection and try again.");
    } finally {
      busy = false;
      send.disabled = false;
      renderStatus();
    }
  };

  const submit = (raw: string, via: "text" | "voice"): void => {
    const text = raw.trim();
    if (!text) return;
    addMsg(via === "voice" ? "you voice" : "you", text);
    chain = chain.then(() => judge(text));
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

  freezeBtn.addEventListener("click", () => {
    frozen = !frozen;
    freezeBtn.setAttribute("aria-pressed", String(frozen));
    freezeLabel.textContent = frozen ? "Unfreeze scores" : "Freeze scores";
  });

  must<HTMLButtonElement>(document, "#reset").addEventListener("click", () => {
    panel.forEach((p) => (p.score = p.start));
    draw();
    log.replaceChildren();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = promptInput.value;
    promptInput.value = "";
    submit(value, "text");
  });

  /* welcome <-> call */
  must<HTMLButtonElement>(document, "#start").addEventListener("click", () => {
    welcome.hidden = true;
    app.hidden = false;
    window.scrollTo(0, 0);
    promptInput.focus();
  });
  must<HTMLButtonElement>(document, "#leave").addEventListener("click", () => {
    voice.stop();
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
