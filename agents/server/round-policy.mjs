import { parseBid } from './turn-selection.mjs';

export const MAX_SPEAKERS = 2;
function json(text) {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}
const brief = text => typeof text === 'string' && text.trim().length > 0 && text.length <= 500;

export function parseAssessment(text, pendingConcern) {
  const bid = parseBid(text);
  const data = json(text);
  if (typeof data.substantive !== 'boolean' || !Number.isInteger(data.score_delta) ||
      Math.abs(data.score_delta) > 20 || !brief(data.score_reason) ||
      (bid.wantsTurn && bid.priority === 0)) throw new Error('Invalid assessment.');
  // A pause with no outstanding question has nothing to defer. Normalize this
  // harmless provider synonym without clearing a concern or inventing a score.
  if (!pendingConcern && !data.substantive && data.answer_status === 'deferred') data.answer_status = 'none';
  const allowed = pendingConcern
    ? (data.substantive ? ['resolved', 'partial', 'unanswered'] : ['deferred'])
    : ['none'];
  if (!allowed.includes(data.answer_status) || (!data.substantive && data.score_delta !== 0)) {
    throw new Error('Invalid concern assessment.');
  }
  // The model judges relevance; the server enforces the requested minimum deduction.
  const proposed = data.score_delta === 0 ? 0 : Math.sign(data.score_delta) * Math.max(10, Math.abs(data.score_delta));
  const delta = data.answer_status === 'partial' ? Math.min(-10, proposed)
    : data.answer_status === 'unanswered' ? Math.min(-15, proposed) : proposed;
  return { ...bid, substantive: data.substantive, answerStatus: data.answer_status,
    delta, scoreReason: data.score_reason.trim() };
}

export function parseSpeech(text, terminal = false) {
  const data = json(text);
  if (typeof data.reply !== 'string' || !data.reply.trim() || data.reply.length > 4000 ||
      !(data.concern === null || (brief(data.concern) && data.reply.includes(data.concern))) ||
      (terminal && data.concern !== null)) throw new Error('Invalid public reply.');
  return { reply: data.reply.trim(), concern: data.concern };
}
