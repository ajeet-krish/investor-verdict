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

// Summarize connection faults without keys, tokens or transcript text so the
// client can tell auth, agent config and network faults apart safely.
function sanitizeConnectionDetail(error) {
  const raw = typeof error === 'string' ? error : (error?.message || error?.code || error?.reason || '');
  let text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  text = text.replace(/sk-[A-Za-z0-9_]{8,}/g, '[redacted]')
    .replace(/xi-[A-Za-z0-9_]{8,}/g, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_.]+/g, '[redacted]');
  const lowered = text.toLowerCase();
  if (/401|403|unauthor|forbidden|api key|signed url|jwt|token/.test(lowered)) {
    return 'auth fault, check API key and signed URL';
  }
  if (/404|not found|agent|config|first message|missing|invalid id/.test(lowered)) {
    return 'agent config fault, check agent ID and settings';
  }
  if (/network|timeout|timed out|econn|socket|websocket|dns|offline/.test(lowered)) {
    return 'network fault, check connectivity and retry';
  }
  return text || 'check connectivity and agent settings';
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
    session.timer = setTimeout(() => void dispose(session), session.pendingOffers.size ? Math.max(idleMs, 1800000) : idleMs);
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
      onError: error => {
        const detail = sanitizeConnectionDetail(error);
        console.warn(`[text-panel] Investor connection fault for ${role.key}: ${detail}`);
        investor.disconnected = true;
        investor.pending?.reject(new PanelError(`An investor connection failed (${detail}). Retry with a new pitch session.`));
      },
      onDisconnect: () => {
        investor.disconnected = true;
        investor.pending?.reject(new PanelError('An investor disconnected. Retry with a new pitch session.'));
      },
    });
    if (session.closed) { await investor.connection.endSession(); throw new PanelError('Session cancelled.', 409); }
    // The researcher greeting is best effort. New accounts in textOnly mode
    // may never send first_message, so a missing greeting must not abort setup.
    // Old accounts still resolve early through opening when it arrives fast.
    if (role.key === 'market_signals_researcher') {
      let timer;
      try {
        await Promise.race([opening, new Promise((_, reject) => { timer = setTimeout(() => reject(new PanelError('Investor greeting timed out.', 504)), 10000); })]);
      } catch (error) {
        if (!session.closed && !investor.disconnected) {
          console.warn('[text-panel] No opening greeting from market_signals_researcher after 10s, continuing to first pitch.');
        }
      } finally { clearTimeout(timer); }
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

  async function askSpeech(session, role, packet, terminal) {
    const request = { ...packet, required_response_fields: {
      reply: 'One brief spoken statement. This is SPEAK, never an assessment or a bid.',
      concern: terminal ? 'JSON null. No new question in an offer or farewell.' : 'JSON null, or the exact question substring from reply (at most 500 characters).',
    } };
    for (let attempt = 0; attempt < 2; attempt++) {
      const answer = await ask(session, role, attempt === 0 ? request : { ...request,
        correction: 'Your SPEAK response was invalid. Correct this same speech grant. Return ONLY a complete JSON object with reply and concern. No wants_turn, score_delta or assessment. Scores are already applied; do not score again. Follow the supplied offer/closing instructions even when other investors already spoke.' });
      try { return parseSpeech(answer, terminal); } catch { /* One format correction; no whole-round or transport retry. */ }
    }
    throw new PanelError('An investor returned an invalid public reply after one correction.');
  }

  function finishRound(session, { founder, panelists = PANEL.map(r => r.title), bids = [], speeches,
    departureOrder = [], offerOrder = [], event = 'pitch', decision = null }) {
    const first = speeches[0];
    session.lastExchange = { founder, speaker: first?.role ?? null, reply: first?.reply ?? '', responses: speeches };
    const states = session.controller.snapshot();
    const responses = panelists.map(title => {
      const role = PANEL.find(p => p.title === title), state = states.find(s => s.key === role.key);
      const bid = bids.find(b => b.key === role.key), speech = speeches.find(s => s.role === role.key);
      return { panelist: title, role: role.key, confidence: state.confidence,
        reason: bid?.assessmentStatus === 'unavailable' ? bid.reason : state.reason,
        reply: speech?.reply ?? '', spoke: Boolean(speech), wantsTurn: bid?.wantsTurn ?? false,
        status: state.status, answerStatus: bid?.answerStatus ?? null, assessmentStatus: bid?.assessmentStatus ?? null,
        pendingConcern: session.investors.get(role.key).pendingConcern };
    });
    session.turn++;
    return { sessionId: session.id, result: { scores: responses.map(r => r.confidence), responses,
      speakingOrder: speeches.map(s => s.role), speaker: first?.role ?? null, departureOrder, offerOrder,
      departedRoles: PANEL.filter(r => session.departed.has(r.key)).map(r => r.key),
      pendingOffers: [...session.pendingOffers], gameOver: session.gameOver, acceptedOffer: session.acceptedOffer,
      event, decision, selectionReason: bids.find(b => b.key === first?.role)?.reason ?? null,
      turn: session.turn, source: 'elevenlabs', initialScore: 50, maxSpeakers: MAX_SPEAKERS } };
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
      if (session?.gameOver) throw new PanelError('This game has ended. Start a new pitch.', 409);
      if (session?.pendingOffers.size) throw new PanelError('Accept or decline the pending investment offers first.', 409);
      if (!session) {
        if (sessions.size >= maxSessions) throw new PanelError('Too many active pitch sessions. Try again shortly.', 429);
        session = { id: randomUUID(), controller: createInterestController(), investors: new Map(), busy: false, closed: false, turn: 0, timer: null, lastSpeaker: null, lastExchange: null,
          pendingOffers: new Set(), departed: new Set(), gameOver: false, acceptedOffer: null };
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
          return !session.departed.has(role.key) && state.confidence > 0 && state.confidence < 100;
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
        const scored = session.controller.snapshot();
        const departures = bids.filter(bid => before.find(s => s.key === bid.key).confidence > 0 &&
          scored.find(s => s.key === bid.key).confidence === 0);
        const offers = bids.filter(bid => before.find(s => s.key === bid.key).confidence < 100 &&
          scored.find(s => s.key === bid.key).confidence === 100);
        for (const bid of departures) session.departed.add(bid.key);
        for (const bid of offers) session.pendingOffers.add(bid.key);
        const remaining = bids.filter(bid => !departures.includes(bid) && !offers.includes(bid));
        const departureOrder = departures.map(bid => bid.key);
        const offerOrder = offers.map(bid => bid.key);
        const speeches = [];
        let regularSpeakers = 0;
        // Newly out investors always receive a farewell grant first, even if
        // they passed their bid. Only ordinary replies consume the two slots.
        while (departures.length || offers.length || regularSpeakers < MAX_SPEAKERS) {
          const departure = departures.length > 0;
          const offer = !departure && offers.length > 0;
          const winner = departure ? departures.shift() : offer ? offers.shift() : selectSpeaker(remaining, session.lastSpeaker, random);
          if (!winner) break;
          if (!departure && !offer) { remaining.splice(remaining.indexOf(winner), 1); regularSpeakers++; }
          const role = PANEL.find(role => role.key === winner.key);
          const state = session.controller.snapshot().find(s => s.key === role.key);
          const terminal = state.confidence === 0 || state.confidence === 100;
          const speech = await askSpeech(session, role, {
            protocol: 'investor_panel_v2', phase: 'speak', round: session.turn + 1,
            founder_message: input.pitch, bid_reason: winner.reason,
            pending_concern: session.investors.get(role.key).pendingConcern, answer_status: winner.answerStatus,
            max_speakers: MAX_SPEAKERS,
            previous_exchange: { founder: input.pitch, responses: [...speeches] },
            confidence: state.confidence, status: state.status,
            departure, exit_reason: departure ? state.reason : null,
            offer,
            ...(offer ? { instruction: 'Your confidence reached 100. You have a mandatory priority offer turn outside the ordinary two-speaker limit. Briefly say why you are convinced and offer to invest in this simulation. Tell the founder to Accept or Decline using the buttons. Do not invent investment amounts, equity or terms. Stay in the call awaiting their choice. Return reply and concern: null.' } : {}),
            ...(departure ? { instruction: 'You have the immediate farewell turn because your confidence reached zero. Briefly explain the concrete reason in exit_reason, say you are passing and leaving the call. No new question. Return JSON with reply and concern: null. Farewells are exempt from the normal two-speaker limit.' } : {}),
          }, terminal);
          const { reply, concern } = speech;
          const investor = session.investors.get(role.key);
          // Never overwrite an unresolved question merely because its owner speaks again.
          if (!terminal && !investor.pendingConcern && concern) {
            investor.pendingConcern = { text: concern, askedRound: session.turn + 1 };
          }
          speeches.push({ role: role.key, reply });
          session.lastSpeaker = role.key;
          session.investors.get(role.key).lastReply = reply;
          if (departure) {
            // Farewell audio is synthesized from the saved reply, so the live
            // investor connection can close without preventing its playback.
            await Promise.allSettled([investor.connection.endSession()]);
          }
        }
        return finishRound(session, { founder: input.pitch, panelists: input.panelists, bids, speeches, departureOrder, offerOrder });
      } catch (error) {
        await dispose(session);
        if (error instanceof PanelError) throw error;
        throw new PanelError('Could not connect to all four ElevenLabs investors. Check account limits and agent access.');
      } finally {
        session.busy = false;
        if (!session.closed) idle(session);
      }
    },
    async decideOffer(body, sessionId) {
      if (shuttingDown) throw new PanelError('Server is shutting down.', 503);
      const session = sessions.get(sessionId);
      if (!session || session.closed) throw new PanelError('This call expired. Start a new pitch.', 409);
      if (!body || !PANEL.some(r => r.key === body.role) || !['accept', 'decline'].includes(body.decision) || !Number.isSafeInteger(body.turn)) {
        throw new PanelError('Choose an investor, accept or decline, and the current turn.', 400);
      }
      if (session.busy || session.gameOver || body.turn !== session.turn || !session.pendingOffers.has(body.role)) {
        throw new PanelError('That offer is no longer available or another turn is in progress.', 409);
      }
      session.busy = true; clearTimeout(session.timer);
      const accepted = body.decision === 'accept';
      const chosen = PANEL.find(r => r.key === body.role);
      const closing = accepted ? [chosen, ...PANEL.filter(r => r.key !== chosen.key && !session.departed.has(r.key))] : [chosen];
      const founder = `I ${body.decision} ${chosen.title}'s offer.`;
      try {
        const speeches = [];
        for (const role of closing) {
          const speech = await askSpeech(session, role, {
            protocol: 'investor_panel_v2', phase: 'speak', round: session.turn + 1,
            founder_message: founder, offer_decision: body.decision, chosen_investor: chosen.title,
            chosen_role: chosen.key, closing: true, confidence: session.controller.snapshot().find(s => s.key === role.key).confidence,
            previous_exchange: { founder, responses: [...speeches] },
            instruction: accepted
              ? role.key === chosen.key
                ? 'The founder accepted your simulated offer. Give a brief happy final statement, thank them and wish them luck. The game is over. No questions or invented deal terms. Return reply and concern: null.'
                : 'The founder accepted another investor. The game is over. Give a brief gracious good-luck farewell in your own voice. No questions, bids, objections, or competing offers. Return reply and concern: null.'
              : 'The founder declined your offer. Respect the choice, give a brief gracious final statement and say you are leaving. No questions, persuasion or score changes. The other investors continue. Return reply and concern: null.',
          }, true);
          speeches.push({ role: role.key, reply: speech.reply });
          session.investors.get(role.key).pendingConcern = null;
        }
        for (const role of closing) {
          session.departed.add(role.key); session.pendingOffers.delete(role.key);
          await Promise.allSettled([session.investors.get(role.key).connection.endSession()]);
        }
        if (accepted) { session.gameOver = true; session.acceptedOffer = chosen.key; session.pendingOffers.clear(); }
        return finishRound(session, { founder, speeches, departureOrder: closing.map(r => r.key),
          event: accepted ? 'offer-accepted' : 'offer-declined', decision: { role: chosen.key, choice: body.decision } });
      } catch (error) {
        await dispose(session);
        if (error instanceof PanelError) throw error;
        throw new PanelError('Could not finish the investor decision. Start a new pitch.');
      } finally { session.busy = false; if (!session.closed) idle(session); }
    },
    async reset(sessionId) { await dispose(sessions.get(sessionId)); },
    async close() { shuttingDown = true; await Promise.allSettled([...sessions.values()].map(dispose)); },
  };
}
