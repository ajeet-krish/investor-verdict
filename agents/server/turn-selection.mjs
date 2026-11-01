// Bids are private model output, never investor dialogue.
export function parseBid(text) {
  let bid;
  try { bid = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('Investor returned an invalid turn bid.'); }
  if (!bid || typeof bid.wants_turn !== 'boolean' || !Number.isInteger(bid.priority) ||
      bid.priority < 0 || bid.priority > 100 || typeof bid.reason !== 'string' ||
      !bid.reason.trim() || bid.reason.length > 500 || (!bid.wants_turn && bid.priority !== 0)) {
    throw new Error('Investor returned an invalid turn bid.');
  }
  return { wantsTurn: bid.wants_turn, priority: bid.priority, reason: bid.reason.trim() };
}

export function selectSpeaker(bids, lastSpeaker, random = Math.random) {
  const willing = bids.filter(bid => bid.wantsTurn && bid.priority > 0);
  if (!willing.length) return null;
  const adjusted = bid => bid.priority - (bid.key === lastSpeaker ? 10 : 0);
  const best = Math.max(...willing.map(adjusted));
  const tied = willing.filter(bid => adjusted(bid) === best);
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
}
