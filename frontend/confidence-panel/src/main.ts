import "./style.css";
import "./meeting-theme.css";
import { createPitchSuggestions } from "./pitch-suggestions";
import { createRealtimeVoice } from "./realtime-voice";
import type { VoiceState } from "./realtime-voice";
import { createReplyPlayer } from "./reply-player";
import { createCallRoster, playInvestorTurns, validateEvaluation } from "./investor-call";
import { createOfferChoices } from './offer-choices';
import type { Evaluation, InvestorRole } from "./investor-call";

/* ---------- Types ---------- */

interface Seed {
  role: InvestorRole;
  name: string;
  bg: string;
  score: number;
  photo: string;
  deal: { label: string; terms: string };
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
  { role: "technical_expert", name: "The CTO", bg: "#2b2320", score: 50, photo: "/investors/02_technical_expert_zoom.png",
    deal: { label: "Creative Bet", terms: "$3M for 15% + $2M milestone tranche" } },
  { role: "market_signals_researcher", name: "The VP", bg: "#1f2a36", score: 50, photo: "/investors/01_market_signals_researcher_zoom.png",
    deal: { label: "Solid Terms", terms: "$5M for 18% equity" } },
  { role: "interrogator", name: "The Interrogator", bg: "#1f2b25", score: 50, photo: "/investors/03_interrogator_zoom.png",
    deal: { label: "Best Deal", terms: "$5M for 12% equity" } },
  { role: "sympathizer", name: "The Sympathizer", bg: "#332a1c", score: 50, photo: "/investors/04_sympathizer_zoom.png",
    deal: { label: "Smallest Warm Check", terms: "$1.5M for 10% equity" } },
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
  return validateEvaluation(raw, SEEDS, current);
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
    <span class="speaker-icon" role="img" aria-label="Not speaking"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg></span>
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
  const roster = createCallRoster(panel, grid, must<HTMLElement>(document, '#call-empty'));
  const restartBtn = must<HTMLButtonElement>(document, '#call-restart');
  const callEnd = must<HTMLElement>(document, '#call-empty');
  const endTitle = must<HTMLElement>(document, '#end-title');
  const endCopy = must<HTMLElement>(document, '#end-copy');
  const endDeal = must<HTMLElement>(document, '#end-deal');
  let busy = false;
  let interim = "";
  let notice = "";
  let lastTurn = 0;
  let callStartedAt = 0;
  let pendingOffers: InvestorRole[] = [];
  let acceptedOffer: InvestorRole | null = null;
  let epoch = 0;
  let voiceState: VoiceState = 'off';
  let audioPlaying = false;
  let audioGeneration = 0;
  let suggestions: ReturnType<typeof createPitchSuggestions> | undefined;
  let offerChoices: ReturnType<typeof createOfferChoices> | undefined;
  let speakingName = '';
  const player = createReplyPlayer(replyAudio, () => showNotice('Press play to hear the investor, or Skip reply to continue.'));
  const setBusy = (value: boolean): void => {
    busy = value;
    for (const control of [send, promptInput]) control.disabled = value || roster.empty || pendingOffers.length > 0;
    startBtn.disabled = restartBtn.disabled = value;
    resetBtn.disabled = leaveBtn.disabled = value && !audioPlaying;
    micBtn.disabled = roster.empty || pendingOffers.length > 0 || (value && voiceState === 'off');
    suggestions?.refresh();
    offerChoices?.refresh();
  };
  const showSpeaker = (role: InvestorRole | null): void => {
    panel.forEach(p => p.el.classList.toggle("responding", p.role === role));
    panel.forEach(p => must<HTMLElement>(p.el, '.speaker-icon').setAttribute('aria-label', p.role === role ? `${p.name} is speaking` : `${p.name} is not speaking`));
  };

  /* end-of-call result card; the roster shows it once every tile has left */
  const renderEnd = (): void => {
    const winner = acceptedOffer ? SEEDS.find(s => s.role === acceptedOffer) : undefined;
    callEnd.dataset.result = winner ? 'won' : 'lost';
    endTitle.textContent = winner ? 'You won! Deal closed' : 'Game over';
    endCopy.textContent = winner
      ? 'You accepted a simulated investment offer and closed the round.'
      : 'Every investor left the call without a deal. Review their feedback in the transcript and try again.';
    endDeal.hidden = !winner;
    if (winner) {
      must<HTMLElement>(endDeal, '#end-deal-label').textContent = winner.deal.label;
      must<HTMLElement>(endDeal, '#end-deal-terms').textContent = winner.deal.terms;
      must<HTMLElement>(endDeal, '#end-deal-from').textContent = `Offer from ${winner.name} · fictional terms`;
    }
    restartBtn.textContent = winner ? 'Play again' : 'Retry';
  };

  /* status line */
  const renderStatus = (): void => {
    if (roster.empty) statusEl.textContent = acceptedOffer ? 'Call ended. Offer accepted.' : 'Call ended. Game over.';
    else if (notice) statusEl.textContent = notice;
    else if (audioPlaying) statusEl.textContent = `${speakingName} is speaking. Your microphone is paused.`;
    else if (busy) statusEl.textContent = "The panel is deliberating…";
    else if (pendingOffers.length) statusEl.textContent = 'Choose Accept offer or Decline to continue. Your microphone is paused.';
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

  const updateParticipants = (): void => {
    const present = panel.filter(p => !p.el.hidden).length + 1;
    must<HTMLElement>(document, '#participant-count').textContent = `${present} ${present === 1 ? "participant" : "participants"}`;
  };

  /* scores */
  const draw = (previous?: number[]): void => {
    updateParticipants();
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
      p.verdict.textContent = v === 0 ? 'Leaving the call' : v === 100 ? 'Simulated offer' : '';
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
  const judge = async (text: string, decision?: { role: InvestorRole; decision: 'accept' | 'decline' }): Promise<void> => {
    setBusy(true);
    suggestions?.begin();
    const current = epoch;
    const currentAudio = audioGeneration;
    voice.pause();
    player.stop();
    replyAudio.hidden = true;
    showSpeaker(null);
    notice = "";
    renderStatus();
    try {
      let before = panel.map(p => p.score);
      const result = decision
        ? validateEvaluation(await post('/offer-decision', { ...decision, turn: lastTurn }), SEEDS, before)
        : await evaluate(text, before);
      if (current !== epoch) return;
      if (result.turn === 1 && lastTurn > 0) {
        before = panel.map(() => 50);
        addMsg("sys", "Your previous session expired. This pitch starts fresh at 50.");
      }
      lastTurn = result.turn;
      pendingOffers = result.pendingOffers;
      acceptedOffer = result.acceptedOffer;
      renderEnd();
      offerChoices?.update(pendingOffers);
      panel.forEach((p, i) => (p.score = result.scores[i]));
      roster.begin(result);
      draw(before);
      panel.forEach(p => {
        if (result.departureOrder.includes(p.role)) { p.verdict.hidden = false; p.verdict.textContent = 'Saying goodbye'; }
      });
      if (result.departedRoles.length === panel.length) suggestions?.end();
      else if (pendingOffers.length) suggestions?.offer();
      else void suggestions?.complete(result.bridgeRevision);
      addMsg("sys", panel.map((p, i) => `${p.name} ${p.score} (${signed(p.score - before[i])})`).join(" · "));
      if (!result.speakingOrder.length) showNotice("The panel is listening.");
      await playInvestorTurns(result, {
        current: () => current === epoch,
        present: reply => {
          showSpeaker(reply.role);
          speakingName = reply.panelist;
          addMsg("investor", `${reply.panelist}: ${reply.reply}`);
        },
        play: async role => {
          if (currentAudio === audioGeneration) {
            notice = "";
            audioPlaying = true;
            skipAudio.hidden = false;
            setBusy(true);
            renderStatus();
            const played = await player.play(`${API_URL}/reply-audio?turn=${result.turn}&role=${role}`);
            if (current !== epoch) return;
            if (!played) showNotice('Audio stopped or unavailable. The investor reply is in the chat.');
          }
        },
        depart: async role => {
          await roster.leave(role);
          if (current !== epoch) return;
          updateParticipants();
          addMsg('sys', `${panel.find(p => p.role === role)!.name} left the call.`);
        },
      });
    } catch (err) {
      if (pendingOffers.length) suggestions?.offer();
      else suggestions?.failed();
      offerChoices?.failed();
      const message = err instanceof Error ? err.message : "The panel couldn't respond.";
      addMsg("sys", decision ? `${message} Retry the offer decision, or reset if the call expired.` : `${message} Your text is below so you can retry.`);
      if (!decision) promptInput.value = text;
      voice.stop();
    } finally {
      if (current === epoch) {
        audioPlaying = false;
        showSpeaker(null);
        skipAudio.hidden = true;
        replyAudio.hidden = true;
        if (roster.empty) {
          // Stay on the call screen; the result card replaces the empty grid.
          voice.stop();

          callEnd.scrollIntoView({ block: 'center' });
        }
        else if (pendingOffers.length) voice.pause();
        setBusy(false);
        if (!roster.empty && !pendingOffers.length) voice.resume();
        renderStatus();
        if (roster.empty) restartBtn.focus();
        else if (pendingOffers.length) offerChoices?.focus();
        else promptInput.focus();
      }
    }
  };

  const submit = (raw: string, via: "text" | "voice"): void => {
    const text = raw.trim();
    if (!text || busy || app.hidden || roster.empty || pendingOffers.length) return;
    if (text.length > 4000) { voice.resume(); showNotice("Please keep your pitch under 4,000 characters."); return; }

    promptInput.value = "";
    addMsg(via === "voice" ? "you voice" : "you", text);
    void judge(text);
  };

  const voice = createRealtimeVoice({
    onFinal: (text) => submit(text, "voice"),
    onInterim: (text) => { interim = text; renderStatus(); },
    onState: (state) => {
      voiceState = state;
      micBtn.classList.toggle("live", state !== 'off');
      must<HTMLElement>(document, '#mic-label').textContent = state === 'off' ? 'Mic off' : state === 'listening' ? 'Mic on' : state === 'connecting' ? 'Connecting' : 'Mic paused';
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

  offerChoices = createOfferChoices(must<HTMLElement>(document, '#offer-choices'), SEEDS, {
    busy: () => busy || app.hidden,
    decide: (role, decision) => {
      if (busy || app.hidden || !pendingOffers.includes(role)) return;

      const text = `I ${decision} ${SEEDS.find(s => s.role === role)!.name}'s offer.`;
      addMsg('you', text);
      void judge(text, { role, decision });
    },
  });
  micBtn.setAttribute('aria-label', 'Start live audio');
  micBtn.addEventListener('click', () => {
    if (voice.enabled) { audioGeneration++; voice.stop(); player.stop(); }
    else if (!busy && !roster.empty && !pendingOffers.length) { notice = ''; void voice.start(); }
  });
  skipAudio.addEventListener('click', () => player.stop());
  window.addEventListener('pagehide', () => { epoch++; audioGeneration++; suggestions?.close(); voice.stop(); player.stop(); });

  camBtn.addEventListener("click", () => {
    const on = camBtn.getAttribute("aria-pressed") !== "true";
    camBtn.setAttribute("aria-pressed", String(on));
    camBtn.setAttribute("aria-label", on ? "Hide photos" : "Show photos");
    app.classList.toggle("photos-off", !on);
  });

  chatBtn.addEventListener("click", () => {
    const open = chatBtn.getAttribute("aria-pressed") !== "true";
    chatBtn.setAttribute("aria-pressed", String(open));
    chatBtn.setAttribute("aria-label", open ? "Hide transcript" : "Show transcript");
    log.hidden = !open;
    must<HTMLElement>(chatbox, ".transcript-heading").hidden = !open;
    if (open) promptInput.focus();
  });

  // Evaluation must finish before reset; playing audio can be stopped immediately.
  const resetSession = async (): Promise<boolean> => {
    if (busy && !audioPlaying) return false;
    epoch++;
    suggestions?.reset();
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
      pendingOffers = []; acceptedOffer = null; offerChoices?.update([]); renderEnd();
      panel.forEach(p => (p.score = 50));
      roster.reset();
      lastTurn = 0;
      callStartedAt = Date.now();
      must<HTMLElement>(document, '#timer').textContent = '00:00:00';
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
  restartBtn.addEventListener('click', () => { void resetSession(); });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit(promptInput.value, "text");
  });

  /* welcome <-> call */
  startBtn.addEventListener("click", async () => {
    if (busy) return;
    welcome.hidden = true;
    app.hidden = false;
    window.scrollTo(0, 0);
    const ready = resetSession();
    showNotice("Connecting to the investor room… The server may need a moment to wake up.");
    if (!await ready) {
      app.hidden = true;
      welcome.hidden = false;
      startBtn.textContent = "Couldn't connect. Click to retry";
      return;
    }
    notice = "";
    renderStatus();
    startBtn.textContent = "Join the room ↗";
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
  setInterval(() => {
    if (app.hidden || !callStartedAt) return;
    const seconds = Math.floor((Date.now() - callStartedAt) / 1000);
    timer.textContent = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  }, 1000);

  suggestions = createPitchSuggestions(API_URL, {
    busy: () => busy || roster.empty || pendingOffers.length > 0,
    attach: text => {
      if (busy || app.hidden || roster.empty || pendingOffers.length) return;

      voice.stop();
      promptInput.value = text;
      chatbox.hidden = false;
      promptInput.focus();
      showNotice('Added to chat. Edit it or press Send.');
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
