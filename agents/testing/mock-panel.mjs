import { PANEL } from '../server/text-panel.mjs';

export const mockEnv = { ELEVENLABS_API_KEY: 'test-only', ...Object.fromEntries(PANEL.map(r => [r.env, `test_${r.key}`])) };
const questions = {
  technical_expert: 'How do you reject malformed spreadsheet imports?',
  market_signals_researcher: 'How many paying shops use the report weekly?',
};
// Explicit provider fixtures exercise orchestration, not language understanding.
export function scenarioSdk(scenario) {
  return { startSession: async config => {
    const role = PANEL.find(r => config.signedUrl.endsWith(mockEnv[r.env])).key;
    queueMicrotask(() => config.onMessage({ source: 'ai', message: 'Greeting.' }));
    return { endSession: async () => {}, sendUserMessage: text => {
      const packet = JSON.parse(text);
      const wanted = scenario.turns[packet.round - 1].expect?.investors?.[role];
      let result;
      if (packet.phase === 'assess') {
        const status = wanted?.answerStatus ?? (packet.pending_concern ? 'resolved' : 'none');
        const followup = ['partial', 'unanswered'].includes(status);
        const willing = packet.round === 1 ? Boolean(questions[role]) : followup;
        result = { wants_turn: willing, priority: willing ? (role === 'technical_expert' ? 85 : 80) : 0,
          reason: willing ? 'A useful clarification.' : 'Nothing to add.',
          substantive: status !== 'deferred', answer_status: status,
          // Deliberately optimistic values prove the server enforces unresolved deductions.
          score_delta: status === 'deferred' ? 0 : wanted ? 5 : 0,
          score_reason: `Fixture assessment: ${status}.` };
      } else {
        const question = packet.pending_concern?.text ?? questions[role];
        result = { reply: question, concern: question };
      }
      queueMicrotask(() => {
        config.onMessage({ source: 'ai', message: JSON.stringify(result) });
        config.onIncomingEvent({ type: 'agent_response_complete' });
      });
    } };
  } };
}
