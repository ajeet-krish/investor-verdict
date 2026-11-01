import { randomUUID } from 'node:crypto';
import { Conversation } from '@elevenlabs/client';
import { createInterestController } from '../../visuals/confidence/interest-controller.mjs';
import { parseBid, selectSpeaker } from './turn-selection.mjs';

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
    const investor = { role, connection: null, pending: null, lastReply: '', disconnected: false };
    session.investors.set(role.key, investor);
    const scoreTool = session.controller.clientToolsFor(role.key).report_investor_interest;
    let openingResolve;
    const opening = new Promise(resolve => { openingResolve = resolve; });
    investor.connection = await sdk.startSession({
      signedUrl: await getSignedUrl(env[role.env]),
      connectionType: 'websocket',
      textOnly: true,
      clientTools: { report_investor_interest: parameters => {
        if (session.closed) return JSON.stringify({ accepted: false, error: 'Session closed.' });
        if (investor.pending?.phase !== 'assess' || investor.pending.scored) {
          return JSON.stringify({ accepted: false, error: 'Score at most once during the private assessment, never during speech.' });
        }
        const result = scoreTool(parameters);
        if (JSON.parse(result).accepted) investor.pending.scored = true;
        return result;
      } },
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
      investor.pending = { phase: packet.phase, scored: false, resolve: reply => done(null, reply), reject: error => done(error) };
      try { investor.connection.sendUserMessage(JSON.stringify(packet)); } catch { done(new PanelError('Could not send pitch to investor.')); }
    });
  }

  return {
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
          const answer = await ask(session, role, {
            protocol: 'investor_panel_v1', phase: 'assess', round: session.turn + 1,
            founder_message: input.pitch, previous_exchange: session.lastExchange,
            confidence: state.confidence, next_score_turn: state.turn_number + 1,
          });
          try { return { key: role.key, ...parseBid(answer) }; }
          catch { throw new PanelError('An investor returned an invalid turn bid. No speaker was selected.'); }
        }));
        const winner = selectSpeaker(bids, session.lastSpeaker, random);
        let spokenReply = '';
        if (winner) {
          const role = PANEL.find(role => role.key === winner.key);
          const state = session.controller.snapshot().find(s => s.key === role.key);
          spokenReply = await ask(session, role, {
            protocol: 'investor_panel_v1', phase: 'speak', round: session.turn + 1,
            founder_message: input.pitch, bid_reason: winner.reason,
            confidence: state.confidence, status: state.status,
          });
          session.lastSpeaker = role.key;
          session.investors.get(role.key).lastReply = spokenReply;
        }
        session.lastExchange = { founder: input.pitch, speaker: winner?.key ?? null, reply: spokenReply };
        const states = session.controller.snapshot();
        const responses = input.panelists.map(title => {
          const role = PANEL.find(p => p.title === title);
          const state = states.find(s => s.key === role.key);
          const bid = bids.find(b => b.key === role.key);
          const spoke = winner?.key === role.key;
          return { panelist: title, role: role.key, confidence: state.confidence, reason: state.reason,
            reply: spoke ? spokenReply : '', spoke, wantsTurn: bid?.wantsTurn ?? false,
            status: state.status };
        });
        session.turn++;
        return {
          sessionId: session.id,
          result: { scores: responses.map(r => r.confidence), responses, speaker: winner?.key ?? null,
            selectionReason: winner?.reason ?? null, turn: session.turn, source: 'elevenlabs', initialScore: 50 },
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
