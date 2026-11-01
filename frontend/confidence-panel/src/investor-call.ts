export type InvestorRole = 'technical_expert' | 'market_signals_researcher' | 'interrogator' | 'sympathizer';
export interface Evaluation {
  scores: number[];
  responses: { role: InvestorRole; panelist: string; reply: string; spoke: boolean }[];
  speakingOrder: InvestorRole[];
  departureOrder: InvestorRole[];
  departedRoles: InvestorRole[];
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
  if (!sameRoles(data.departedRoles, zeros) || !sameRoles(data.departureOrder, newlyOut) ||
      !sameRoles(data.speakingOrder, speakers.map(r => r.role)) ||
      data.speakingOrder.length - data.departureOrder.length > 2 ||
      !data.departureOrder.every((r, i) => data.speakingOrder[i] === r) ||
      speakers.some(r => zeros.includes(r.role) && !data.departureOrder.includes(r.role))) {
    throw new Error('Unexpected investor speaker or departure.');
  }
  return data;
}

// Keep queued farewells visible. A tile leaves only after its own playback ends.
export function createCallRoster(tiles: { role: InvestorRole; el: HTMLElement }[], grid: HTMLElement, empty: HTMLElement) {
  const left = new Set<InvestorRole>();
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
      left.clear();
      for (const role of result.departedRoles) if (!result.departureOrder.includes(role)) left.add(role);
      for (const tile of tiles) tile.el.classList.toggle('leaving', result.departureOrder.includes(tile.role));
      render();
    },
    leave(role: InvestorRole) { left.add(role); render(); },
    reset() {
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
  depart: (role: InvestorRole) => void;
}) {
  for (const role of result.speakingOrder) {
    if (!hooks.current()) return;
    hooks.present(result.responses.find(r => r.role === role)!);
    await hooks.play(role);
    if (!hooks.current()) return;
    if (result.departureOrder.includes(role)) hooks.depart(role);
  }
}
