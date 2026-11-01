import { randomUUID } from 'node:crypto';
import { Conversation } from '@elevenlabs/client';
import { createInterestController } from '../../visuals/confidence/interest-controller.mjs';
import { selectSpeaker } from './turn-selection.mjs';
import { MAX_SPEAKERS, parseAssessment, parseSpeech } from './round-policy.mjs';

// Match the latest frontend's titles and photo order, not the old internal CTO alias.
export const PANEL = [
  { title: 'The CTO', key: 'technical_expert', env: 'ELEVENLABS_AGENT_ID_TECH_BRO' },
  { title: 'The VP', key: 'market_signals_researcher', env: 'ELEVENLABS_AGENT_ID_CTO' },
  { title: 'The Interrogator', key: 'interrogator', env: 'ELEVENLABS_AGENT_ID_INTERROGATOR' },
  { title: 'The Sympathizer', key: 'sympathizer', env: 'ELEVENLABS_AGENT_ID_SYMPATHIZER' },
];

export class PanelError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

// Repeat the full contract each turn so a silent investor does not fall back to
// the legacy bid-only format after a long conversation.
const ASSESSMENT_FORMAT = {
  wants_turn: 'boolean', priority: 'integer 1-100 when willing, otherwise 0',
  reason: 'nonempty string, at most 500 characters', substantive: 'boolean',
  answer_status: 'none without a pending concern; resolved/partial/unanswered with one; deferred only for controls',
  score_delta: 'integer -20..20; meaningful changes at least 10; partial at most -10; unanswered at most -15; neutral/control 0',
  score_reason: 'nonempty string, at most 500 characters',
};

export function validatePitch(body) {
  if (!body || typeof body.pitch !== 'string' || !body.pitch.trim() || body.pitch.length > 4000) {
    throw new PanelError('Pitch must contain 1 to 4000 characters.', 400);
  }
  if (!Array.isArray(body.panelists) || body.panelists.length !== 4 || new Set(body.panelists).size !== 4 ||
      body.panelists.some(name => !PANEL.some(p => p.title === name))) {
    throw new PanelError('Expected the four configured panelist names.', 400);
  }
  if (!Array.isArray(body.scores) || body.scores.length !== 4 || body.scores.some(score => !Number.isFinite(score) || score < 0 || score > 100)) {
    throw new PanelError('Expected four scores between 0 and 100.', 400);
  }
  return { ...body, pitch: body.pitch.trim() };
}

export function createTextPanelService({ env = process.env, getSignedUrl, sdk = Conversation, idleMs = 120000, turnTimeoutMs = 45000, maxSessions = 4, random = Math.random }) {
  const sessions = new Map();
  let shuttingDown = false;

  async function dispose(session) {
    if (!session || session.closed) return;
    session.closed = true;
    clearTimeout(session.timer);
    sessions.delete(session.id);
    session.controller.close();
    for (const investor of session.investors.values()) investor.pending?.reject(new PanelError('Pitch session closed.', 409));
    await Promise.allSettled([...session.investors.values()].map(i => i.connection?.endSession()));
  }
  function idle(session) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => void dispose(session), idleMs);
    session.timer.unref?.();
  }
  async function startInvestor(session, role) {
    const investor = { role, connection: null, pending: null, lastReply: '', pendingConcern: null, disconnected: false };
    session.investors.set(role.key, investor);
    let openingResolve;
    const opening = new Promise(resolve => { openingResolve = resolve; });
    investor.connection = await sdk.startSession({
      signedUrl: await getSignedUrl(env[role.env]),
      connectionType: 'websocket',
      textOnly: true,
      clientTools: { report_investor_interest: () => JSON.stringify({
        accepted: false, error: 'In investor_panel_v2, return the assessment JSON. The server applies scores once.',
      }) },
      onMessage: message => {
        if (session.closed || message.source === 'user') return;
        const text = message.message || message.text;
        if (!text) return;
        openingResolve();
        if (investor.pending) investor.pending.reply = String(text).slice(0, 6000);
      },
      onIncomingEvent: event => {
        if (session.closed) return;
        if (event.type === 'agent_response_complete' && investor.pending?.reply) {
          investor.pending.resolve(investor.pending.reply);
        }
      },
      onError: () => {
        investor.disconnected = true;
        investor.pending?.reject(new PanelError('An investor connection failed. Retry with a new pitch session.'));
      },
      onDisconnect: () => {
        investor.disconnected = true;
        investor.pending?.reject(new PanelError('An investor disconnected. Retry with a new pitch session.'));
      },
    });
    if (session.closed) { await investor.connection.endSession(); throw new PanelError('Session cancelled.', 409); }
    // The researcher has a greeting. Consume it before the first submitted pitch.
    if (role.key === 'market_signals_researcher') {
      let timer;
      try {
        await Promise.race([opening, new Promise((_, reject) => { timer = setTimeout(() => reject(new PanelError('Investor greeting timed out.', 504)), 10000); })]);
      } finally { clearTimeout(timer); }
      clearTimeout(timer);
    }
  }
  async function ask(session, role, packet) {
    if (session.closed) throw new PanelError('Pitch session closed.', 409);
    const investor = session.investors.get(role.key);
    if (investor.disconnected) throw new PanelError('An investor disconnected. Start a new pitch session.');
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (error, reply) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        investor.pending = null;
        error ? reject(error) : resolve(reply);
      };
      const timer = setTimeout(() => done(new PanelError('Investor response timed out. No automatic retry was made.', 504)), turnTimeoutMs);
      investor.pending = { phase: packet.phase, resolve: reply => done(null, reply), reject: error => done(error) };
      try { investor.connection.sendUserMessage(JSON.stringify(packet)); } catch { done(new PanelError('Could not send pitch to investor.')); }
    });
  }

  return {
    getSpeech(sessionId, turn, role) {
      const session = sessions.get(sessionId);
      if (!session || session.closed) throw new PanelError('Pitch session expired. Start a new pitch.', 409);
      if (!Number.isSafeInteger(turn) || session.busy || turn !== session.turn) throw new PanelError('That reply is no longer current.', 409);
      const reply = session.lastExchange?.responses.find(reply => reply.role === role);
      if (!reply) throw new PanelError('No investor spoke with that role on this turn.', 404);
      idle(session);
      return { role: reply.role, text: reply.reply };
    },
    async evaluate(body, sessionId) {
      const input = validatePitch(body);
      if (shuttingDown) throw new PanelError('Server is shutting down.', 503);
      if (!env.ELEVENLABS_API_KEY || PANEL.some(role => !env[role.env])) throw new PanelError('Configure the API key and four agent IDs in .env.', 503);
      let session = sessions.get(sessionId);
      if (session?.busy) throw new PanelError('A pitch is already being evaluated in this session.', 409);
      if (!session) {
        if (sessions.size >= maxSessions) throw new PanelError('Too many active pitch sessions. Try again shortly.', 429);
        session = { id: randomUUID(), controller: createInterestController(), investors: new Map(), busy: false, closed: false, turn: 0, timer: null, lastSpeaker: null, lastExchange: null };
        sessions.set(session.id, session);
      }
      session.busy = true;
      clearTimeout(session.timer);
      try {
        if (!session.investors.size) {
          // Sequential connection setup avoids a burst of account-concurrency checks.
          for (const role of PANEL) await startInvestor(session, role);
        }
        const before = session.controller.snapshot();
        const active = PANEL.filter(role => {
          const state = before.find(s => s.key === role.key);
          return state.confidence > 0 && state.confidence < 100;
        });
        // All active investors listen and bid privately; none has the floor yet.
        const bids = await Promise.all(active.map(async role => {
          const state = before.find(s => s.key === role.key);
          const pendingConcern = session.investors.get(role.key).pendingConcern;
          const packet = {
            protocol: 'investor_panel_v2', phase: 'assess', round: session.turn + 1,
            founder_message: input.pitch, previous_exchange: session.lastExchange,
            pending_concern: pendingConcern, max_speakers: MAX_SPEAKERS,
            confidence: state.confidence, next_score_turn: state.turn_number + 1,
            required_response_fields: ASSESSMENT_FORMAT,
          };
          for (let attempt = 0; attempt < 2; attempt++) {
            const answer = await ask(session, role, attempt === 0 ? packet : {
              ...packet,
              correction: 'Your previous assessment was invalid or incomplete. Correct that SAME assessment, not a new founder turn. Return one complete JSON object with ALL seven required fields, even when passing. No prose or ellipses. No score has been applied yet.',
            });
            try {
              return { key: role.key, ...parseAssessment(answer, pendingConcern),
                assessmentStatus: attempt === 0 ? 'valid' : 'repaired' };
            } catch { /* Only invalid completed assessments receive one correction. */ }
          }
          // An unusable assessment must not cancel other investors, invent a
          // judgment, clear a concern or penalize the founder for a provider fault.
          return { key: role.key, wantsTurn: false, priority: 0, answerStatus: null,
            assessmentStatus: 'unavailable', reason: 'Assessment unavailable; investor sat out with confidence unchanged.' };
        }));
        // Validate all assessments before applying any score or clearing a concern.
        for (const bid of bids) {
          if (bid.assessmentStatus === 'unavailable') continue;
          const state = before.find(s => s.key === bid.key);
          const result = JSON.parse(session.controller.clientToolsFor(bid.key).report_investor_interest({
            turn_number: state.turn_number + 1,
            confidence: Math.max(0, Math.min(100, state.confidence + bid.delta)), reason: bid.scoreReason,
          }));
          if (!result.accepted) throw new PanelError('Investor score could not be applied.');
          if (bid.answerStatus === 'resolved' || result.confidence === 0 || result.confidence === 100) {
            session.investors.get(bid.key).pendingConcern = null;
          }
        }
        const remaining = [...bids];
        const speeches = [];
        let winner;
        // Willing investors contribute at most once, with exclusive sequential grants.
        while (speeches.length < MAX_SPEAKERS && (winner = selectSpeaker(remaining, session.lastSpeaker, random))) {
          remaining.splice(remaining.indexOf(winner), 1);
          const role = PANEL.find(role => role.key === winner.key);
          const state = session.controller.snapshot().find(s => s.key === role.key);
          const answer = await ask(session, role, {
            protocol: 'investor_panel_v2', phase: 'speak', round: session.turn + 1,
            founder_message: input.pitch, bid_reason: winner.reason,
            pending_concern: session.investors.get(role.key).pendingConcern, answer_status: winner.answerStatus,
            max_speakers: MAX_SPEAKERS,
            previous_exchange: { founder: input.pitch, responses: [...speeches] },
            confidence: state.confidence, status: state.status,
          });
          let speech;
          const terminal = state.confidence === 0 || state.confidence === 100;
          try { speech = parseSpeech(answer, terminal); }
          catch { throw new PanelError('An investor returned an invalid public reply.'); }
          const { reply, concern } = speech;
          const investor = session.investors.get(role.key);
          // Never overwrite an unresolved question merely because its owner speaks again.
          if (!terminal && !investor.pendingConcern && concern) {
            investor.pendingConcern = { text: concern, askedRound: session.turn + 1 };
          }
          speeches.push({ role: role.key, reply });
          session.lastSpeaker = role.key;
          session.investors.get(role.key).lastReply = reply;
        }
        const first = speeches[0];
        session.lastExchange = { founder: input.pitch, speaker: first?.role ?? null,
          reply: first?.reply ?? '', responses: speeches };
        const states = session.controller.snapshot();
        const responses = input.panelists.map(title => {
          const role = PANEL.find(p => p.title === title);
          const state = states.find(s => s.key === role.key);
          const bid = bids.find(b => b.key === role.key);
          const speech = speeches.find(s => s.role === role.key);
          const spoke = Boolean(speech);
          return { panelist: title, role: role.key, confidence: state.confidence,
            reason: bid?.assessmentStatus === 'unavailable' ? bid.reason : state.reason,
            reply: speech?.reply ?? '', spoke, wantsTurn: bid?.wantsTurn ?? false,
            status: state.status, answerStatus: bid?.answerStatus ?? null,
            assessmentStatus: bid?.assessmentStatus ?? null,
            pendingConcern: session.investors.get(role.key).pendingConcern };
        });
        session.turn++;
        return {
          sessionId: session.id,
          result: { scores: responses.map(r => r.confidence), responses, speakingOrder: speeches.map(s => s.role), speaker: first?.role ?? null,
            selectionReason: bids.find(b => b.key === first?.role)?.reason ?? null, turn: session.turn, source: 'elevenlabs', initialScore: 50, maxSpeakers: MAX_SPEAKERS },
        };
      } catch (error) {
        await dispose(session);
        if (error instanceof PanelError) throw error;
        throw new PanelError('Could not connect to all four ElevenLabs investors. Check account limits and agent access.');
      } finally {
        session.busy = false;
        if (!session.closed) idle(session);
      }
    },
    async reset(sessionId) { await dispose(sessions.get(sessionId)); },
    async close() { shuttingDown = true; await Promise.allSettled([...sessions.values()].map(dispose)); },
  };
}
