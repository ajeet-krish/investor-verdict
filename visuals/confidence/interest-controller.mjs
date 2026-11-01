import { INVESTORS } from './investors.mjs';

export function interestStatus(score) {
  return score === 0 ? 'out' : score === 100 ? 'offered' : score < 40 ? 'nearly-out' : score < 70 ? 'concerned' : 'engaged';
}

// Create a fresh controller for each pitch. Never reuse handlers from an old call.
export function createInterestController() {
  let active = true;
  const listeners = new Set();
  const states = new Map(INVESTORS.map(({ key }) => [key, {
    key, confidence: 50, turn_number: 0, status: 'concerned',
    reason: 'Ready to hear your pitch.',
  }]));
  const snapshot = () => [...states.values()].map(state => ({ ...state }));

  function clientToolsFor(key) {
    if (!states.has(key)) throw new Error(`Unknown investor: ${key}`);
    return {
      report_investor_interest(payload) {
        const state = states.get(key);
        const result = (accepted, error) => JSON.stringify({
          accepted, ...state, next_turn_number: state.turn_number + 1,
          ...(error ? { error } : {}),
        });
        if (!active) return result(false, 'This pitch session is closed.');
        if (!payload || !Number.isSafeInteger(payload.turn_number) || payload.turn_number < 1) {
          return result(false, 'turn_number must be a positive integer.');
        }
        // Network retries and late events cannot deduct points twice.
        if (payload.turn_number <= state.turn_number) return result(false, 'Duplicate or stale turn.');
        if (state.confidence === 0 || state.confidence === 100) return result(false, 'This investor has reached a final verdict.');
        if (payload.turn_number !== state.turn_number + 1) return result(false, 'Use next_turn_number.');
        if (!Number.isInteger(payload.confidence) || payload.confidence < 0 || payload.confidence > 100) {
          return result(false, 'confidence must be an integer from 0 to 100.');
        }
        if (Math.abs(state.confidence - payload.confidence) > 20) return result(false, 'Maximum change is 20 per turn.');
        if (typeof payload.reason !== 'string' || !payload.reason.trim() || payload.reason.length > 500) {
          return result(false, 'Provide a brief reason, between 1 and 500 characters.');
        }
        // Identity is bound by the caller, never taken from model-generated fields.
        Object.assign(state, {
          confidence: payload.confidence,
          turn_number: payload.turn_number,
          reason: payload.reason.trim(),
          status: interestStatus(payload.confidence),
        });
        const event = { investor: { ...state }, left: state.confidence === 0, offered: state.confidence === 100 };
        for (const listener of listeners) {
          try { listener(snapshot(), event); }
          catch (error) { console.error('Investor display listener failed', error); }
        }
        return result(true);
      },
    };
  }

  return {
    snapshot,
    clientToolsFor,
    subscribe(listener) {
      if (!active) throw new Error('This pitch session is closed.');
      listeners.add(listener);
      listener(snapshot(), null);
      return () => listeners.delete(listener);
    },
    close() { active = false; listeners.clear(); },
  };
}
