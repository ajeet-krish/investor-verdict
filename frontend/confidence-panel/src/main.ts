import "./style.css";

interface Seed {
  name: string;
  bg: string;
  score: number;
}

interface Panelist extends Seed {
  start: number;
  el: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
  chip: HTMLElement;
}

const SEEDS: Seed[] = [
  { name: "The Closer", bg: "#2b2320", score: 62 },
  { name: "The Skeptic", bg: "#1f2a36", score: 41 },
  { name: "The Operator", bg: "#1f2b25", score: 78 },
  { name: "The Veteran", bg: "#332a1c", score: 55 },
];

// Index of who is speaking each turn; -1 means silence.
const SPEAKING_ORDER: number[] = [-1, 1, 1, 0, -1, 3, 2, 2, -1, 0, 3];

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const pad = (n: number): string => String(n).padStart(2, "0");

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
  p.el.style.backgroundImage = url ? `url(${url})` : "none";
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
      <button class="rm" type="button">Remove</button>
    </div>
    <div class="cb"><span>100</span>
      <div class="tr"><div class="fl"></div>
        <div class="tk" style="top:25%"></div><div class="tk" style="top:50%"></div><div class="tk" style="top:75%"></div>
      </div><span>0</span></div>
    <div class="nm"><span class="eq"><b></b><b></b><b></b></span>${seed.name}</div>`;
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
    setPhoto(panelist, null);
    savePhoto(index, null);
  });

  const saved = loadPhoto(index);
  if (saved) setPhoto(panelist, saved);
  return panelist;
}

function main(): void {
  const welcome = must<HTMLElement>(document, "#welcome");
  const app = must<HTMLElement>(document, "#app");
  must<HTMLButtonElement>(document, "#start").addEventListener("click", () => {
    welcome.hidden = true;
    app.hidden = false;
    window.scrollTo(0, 0);
  });
  must<HTMLButtonElement>(document, "#leave").addEventListener("click", () => {
    app.hidden = true;
    welcome.hidden = false;
    window.scrollTo(0, 0);
  });

  const grid = must<HTMLElement>(document, "#grid");
  const panel = SEEDS.map((seed, i) => buildTile(seed, i, grid));
  let paused = false;
  let turn = 0;

  const draw = (): void => {
    for (const p of panel) {
      const v = Math.round(p.score);
      p.fill.style.height = `${v}%`;
      p.fill.style.backgroundColor = colorFor(v);
      p.value.textContent = String(v);
      p.chip.textContent = `Confidence ${v}`;
    }
  };

  const nextSpeaker = (): void => {
    const speaker = SPEAKING_ORDER[turn % SPEAKING_ORDER.length];
    panel.forEach((p, i) => p.el.classList.toggle("on", i === speaker));
    turn++;
  };

  const drift = (): void => {
    if (paused) return;
    const speaker = SPEAKING_ORDER[(turn - 1) % SPEAKING_ORDER.length];
    panel.forEach((p, i) => {
      const step = i === speaker ? 9 : 3;
      p.score = clamp(p.score + (Math.random() - 0.5) * step * 2, 5, 98);
    });
    draw();
  };

  const pauseBtn = must<HTMLButtonElement>(document, "#pause");
  const pauseLabel = must<HTMLElement>(document, "#pause-label");
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.setAttribute("aria-pressed", String(paused));
    pauseLabel.textContent = paused ? "Resume scores" : "Pause scores";
  });
  must<HTMLButtonElement>(document, "#reset").addEventListener("click", () => {
    panel.forEach((p) => (p.score = p.start));
    draw();
  });

  const timer = must<HTMLElement>(document, "#timer");
  let seconds = 872;
  setInterval(() => {
    seconds++;
    timer.textContent = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  }, 1000);

  nextSpeaker();
  draw();
  setInterval(nextSpeaker, 3200);
  setInterval(drift, 1400);
}

main();
