export type InvestorRole = 'technical_expert' | 'market_signals_researcher' | 'interrogator' | 'sympathizer';
export interface Evaluation {
  scores: number[];
  responses: { role: InvestorRole; panelist: string; reply: string; spoke: boolean }[];
  speakingOrder: InvestorRole[];
  departureOrder: InvestorRole[];
  departedRoles: InvestorRole[];
  offerOrder: InvestorRole[];
  pendingOffers: InvestorRole[];
  event: 'pitch' | 'offer-accepted' | 'offer-declined';
  decision: { role: InvestorRole; choice: 'accept' | 'decline' } | null;
  gameOver: boolean;
  acceptedOffer: InvestorRole | null;
  turn: number;
  bridgeRevision?: number;
}

export function validateEvaluation(raw: unknown, seeds: { role: InvestorRole; name: string }[], current: number[]): Evaluation {
  if (!raw || typeof raw !== 'object') throw new Error('Unexpected investor response.');
  const data = raw as Evaluation;
  if (!Array.isArray(data.scores) || data.scores.length !== seeds.length ||
      !data.scores.every(s => Number.isInteger(s) && s >= 0 && s <= 100) ||
      !Number.isSafeInteger(data.turn) || data.turn < 1 ||
      !Array.isArray(data.responses) || data.responses.length !== seeds.length ||
      !data.responses.every((r, i) => r && r.role === seeds[i].role && r.panelist === seeds[i].name &&
        typeof r.reply === 'string' && typeof r.spoke === 'boolean' &&
        (r.spoke ? r.reply.trim().length > 0 : r.reply === ''))) throw new Error('Unexpected investor response.');
  const speakers = data.responses.filter(r => r.spoke);
  const zeros = seeds.filter((_, i) => data.scores[i] === 0).map(s => s.role);
  const newlyOut = seeds.filter((_, i) => data.scores[i] === 0 && (data.turn === 1 ? 50 : current[i]) > 0).map(s => s.role);
  const sameRoles = (actual: InvestorRole[], expected: InvestorRole[]) => Array.isArray(actual) &&
    actual.length === expected.length && new Set(actual).size === actual.length && actual.every(r => expected.includes(r));
  const validRoles = (actual: InvestorRole[]) => Array.isArray(actual) && new Set(actual).size === actual.length && actual.every(r => seeds.some(s => s.role === r));
  if (![data.departedRoles, data.departureOrder, data.offerOrder, data.pendingOffers].every(validRoles) ||
      !['pitch', 'offer-accepted', 'offer-declined'].includes(data.event) || typeof data.gameOver !== 'boolean') throw new Error('Unexpected offer state.');
  const score = (role: InvestorRole) => data.scores[seeds.findIndex(s => s.role === role)];
  const expectedOffers = seeds.filter((s, i) => data.scores[i] === 100 && !data.departedRoles.includes(s.role)).map(s => s.role);
  const newlyOffered = seeds.filter((s, i) => data.scores[i] === 100 && (data.turn === 1 ? 50 : current[i]) < 100 && !data.departedRoles.includes(s.role)).map(s => s.role);
  const mandatory = [...data.departureOrder, ...data.offerOrder];
  const accepted = data.event === 'offer-accepted';
  if (!zeros.every(r => data.departedRoles.includes(r)) ||
      (!accepted && data.departedRoles.some(r => score(r) !== 0 && score(r) !== 100)) ||
      !sameRoles(data.pendingOffers, expectedOffers) ||
      !data.departureOrder.every(r => data.departedRoles.includes(r)) ||
      data.gameOver !== accepted ||
      (accepted ? data.acceptedOffer !== data.decision?.role : data.acceptedOffer !== null) ||
      (data.event === 'pitch'
        ? data.decision !== null || !sameRoles(data.departureOrder, newlyOut) || !sameRoles(data.offerOrder, newlyOffered) || data.departedRoles.some(r => score(r) !== 0 && score(r) !== 100)
        : !data.decision || score(data.decision.role) !== 100 || data.decision.choice !== (accepted ? 'accept' : 'decline') ||
          data.scores.some((s, i) => s !== current[i]) || data.offerOrder.length !== 0 ||
          (accepted ? data.departedRoles.length !== seeds.length || data.departureOrder[0] !== data.decision.role
            : !sameRoles(data.departureOrder, [data.decision.role]))) ||
      !sameRoles(data.speakingOrder, speakers.map(r => r.role)) ||
      new Set(mandatory).size !== mandatory.length ||
      data.speakingOrder.length - mandatory.length > (data.event === 'pitch' ? 2 : 0) ||
      !mandatory.every((r, i) => data.speakingOrder[i] === r) ||
      speakers.some(r => data.departedRoles.includes(r.role) && !data.departureOrder.includes(r.role))) {
    throw new Error('Unexpected investor speaker or departure.');
  }
  return data;
}

type ExitAnimation = { finished: Promise<unknown>; cancel: () => void };

function animateInvestorExit(el: HTMLElement): ExitAnimation | undefined {
  if (typeof el.animate !== 'function' ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  return el.animate([
    { transform: 'translateY(0) scale(1)', opacity: 1, filter: 'blur(0px)', offset: 0 },
    { transform: 'translateY(-4px) scale(1.015)', opacity: 1, filter: 'blur(0px)', offset: 0.18 },
    { transform: 'translateY(14px) scale(.88, .12)', opacity: .75, filter: 'blur(2px)', offset: 0.65 },
    { transform: 'translateY(24px) scale(.08, .015)', opacity: 0, filter: 'blur(8px)', offset: 1 },
  ], { duration: 620, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
}

// Keep queued farewells visible through playback and their exit animation.
export function createCallRoster(tiles: { role: InvestorRole; el: HTMLElement }[], grid: HTMLElement, empty: HTMLElement,
  animateExit: (el: HTMLElement) => ExitAnimation | undefined = animateInvestorExit) {
  const left = new Set<InvestorRole>();
  const animations = new Map<InvestorRole, ExitAnimation>();
  let generation = 0;
  const cancelExits = () => {
    generation++;
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    for (const tile of tiles) tile.el.classList.remove('exiting');
  };
  const render = () => {
    let count = 0;
    for (const tile of tiles) {
      tile.el.hidden = left.has(tile.role);
      tile.el.dataset.position = tile.el.hidden ? '' : String(++count);
    }
    grid.dataset.count = String(count);
    grid.setAttribute('aria-label', `${count} investors in the call`);
    empty.hidden = count !== 0;
  };
  render();
  return {
    get empty() { return left.size === tiles.length; },
    begin(result: Evaluation) {
      cancelExits();
      left.clear();
      for (const role of result.departedRoles) if (!result.departureOrder.includes(role)) left.add(role);
      for (const tile of tiles) tile.el.classList.toggle('leaving', result.departureOrder.includes(tile.role));
      render();
    },
    async leave(role: InvestorRole) {
      const tile = tiles.find(t => t.role === role);
      if (!tile || left.has(role) || animations.has(role)) return;
      const current = generation;
      tile.el.classList.toggle('exiting', true);
      const animation = animateExit(tile.el);
      if (animation) {
        animations.set(role, animation);
        try { await animation.finished; } catch { /* Reset cancels the effect. */ }
      }
      if (current !== generation) return;
      left.add(role);
      render();
      tile.el.classList.remove('exiting');
      animation?.cancel();
      animations.delete(role);
    },
    reset() {
      cancelExits();
      left.clear();
      for (const tile of tiles) tile.el.classList.remove('leaving');
      render();
    },
  };
}

export async function playInvestorTurns(result: Evaluation, hooks: {
  current: () => boolean;
  present: (reply: Evaluation['responses'][number]) => void;
  play: (role: InvestorRole) => Promise<void>;
  depart: (role: InvestorRole) => void | Promise<void>;
}) {
  for (const role of result.speakingOrder) {
    if (!hooks.current()) return;
    hooks.present(result.responses.find(r => r.role === role)!);
    await hooks.play(role);
    if (!hooks.current()) return;
    if (result.departureOrder.includes(role)) await hooks.depart(role);
  }
}
