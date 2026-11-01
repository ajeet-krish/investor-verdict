import { randomBytes, randomUUID } from 'node:crypto';
import { PanelError } from './text-panel.mjs';

const copy = value => structuredClone(value);
// One browser-owned conversation, one pending suggestion, bounded in-memory history.
export function createAgentBridge({ ttlMs = 30 * 60 * 1000, now = Date.now, maxRooms = 16 } = {}) {
  const rooms = new Map();
  const tokens = new Map();
  function cancel(room, status = 'cancelled') {
    for (const job of room.jobs.values()) if (job.status === 'pending') job.status = status;
  }
  function revoke(room) {
    if (room.token) tokens.delete(room.token);
    room.token = null; room.autoSend = false;
    cancel(room);
  }
  function prune() {
    for (const [id, room] of rooms) if (room.expiresAt <= now() && !room.busy) { revoke(room); rooms.delete(id); }
  }
  function roomFor(id) {
    prune();
    const room = rooms.get(id);
    if (!room) throw new PanelError('This app connection expired. Connect the coding agent again.', 410);
    return room;
  }
  function touch(room) { room.expiresAt = now() + ttlMs; }
  function agentRoom(token) {
    prune();
    const room = rooms.get(tokens.get(token));
    if (!room || !room.token) throw new PanelError('Invalid or expired app connection token.', 401);
    return room;
  }
  function context(room) {
    return copy({ connected: Boolean(room.token), revision: room.revision, busy: room.busy, ready: room.ready, autoSend: room.autoSend,
      scores: room.result?.scores ?? [50, 50, 50, 50], lastResult: room.result,
      history: room.history, pending: [...room.jobs.values()].find(j => j.status === 'pending') ?? null,
      expiresAt: room.expiresAt });
  }
  return {
    ensure(id) {
      prune();
      let room = rooms.get(id);
      if (!room) {
        if (rooms.size >= maxRooms) throw new PanelError('Too many app connections. Close an old session.', 429);
        room = { id: randomUUID(), token: null, revision: 0, result: null, history: [], jobs: new Map(), busy: false, ready: true, autoSend: false };
        rooms.set(room.id, room);
      }
      touch(room);
      return room.id;
    },
    connect(id) {
      const room = roomFor(id);
      if (room.busy) throw new PanelError('Wait for the current investor round.', 409);
      revoke(room);
      room.jobs.clear();
      room.autoSend = true;
      room.ready = true; // Explicit approval from an idle/reloaded app starts its control flow.
      room.token = randomBytes(32).toString('base64url');
      tokens.set(room.token, id);
      touch(room);
      return { token: room.token, ...context(room) };
    },
    ownerContext(id) { const room = roomFor(id); touch(room); return context(room); },
    agentContext(token) { return context(agentRoom(token)); },
    suggest(token, body) {
      const room = agentRoom(token);
      if (!body || typeof body.pitch !== 'string' || !body.pitch.trim() || body.pitch.length > 4000 ||
          typeof body.requestId !== 'string' || !/^[\w-]{8,100}$/.test(body.requestId) ||
          !Number.isSafeInteger(body.revision) || typeof body.author !== 'string' || !body.author.trim() || body.author.length > 80) {
        throw new PanelError('Supply pitch (1-4000 chars), author, revision and a unique requestId (8-100 letters, digits, _ or -).', 400);
      }
      const existing = room.jobs.get(body.requestId);
      if (existing) {
        if (existing.pitch !== body.pitch.trim() || existing.author !== body.author.trim() || existing.revision !== body.revision) throw new PanelError('requestId was already used for different input.', 409);
        return copy(existing); // Idempotent read, never a second paid evaluation.
      }
      if (body.revision !== room.revision) throw new PanelError('The conversation changed. Read context and revise the suggestion.', 409);
      if (room.busy) throw new PanelError('The panel is evaluating. Wait for the result before suggesting.', 409);
      if ([...room.jobs.values()].some(j => j.status === 'pending')) throw new PanelError('A suggestion is already waiting in the app.', 409);
      if (room.jobs.size >= 100) throw new PanelError('Connection request limit reached. Reconnect for a new session.', 429);
      const job = { id: body.requestId, author: body.author.trim(), pitch: body.pitch.trim(), revision: body.revision, status: 'pending', createdAt: now() };
      room.jobs.set(job.id, job);
      return copy(job);
    },
    job(token, id) {
      const job = agentRoom(token).jobs.get(id);
      if (!job) throw new PanelError('Unknown suggestion.', 404);
      return copy(job);
    },
    reject(id, jobId) {
      const room = roomFor(id), job = room.jobs.get(jobId);
      if (!job || job.status !== 'pending') throw new PanelError('Suggestion is no longer pending.', 409);
      job.status = 'rejected';
      return copy(job);
    },
    begin(id, body) {
      const room = roomFor(id);
      if (room.busy) throw new PanelError('A founder turn is already in progress.', 409);
      let job;
      if (body.bridgeJobId !== undefined) {
        job = room.jobs.get(body.bridgeJobId);
        if (!room.token || !job || job.status !== 'pending' || job.revision !== room.revision) throw new PanelError('Suggestion is stale or already handled.', 409);
        if (body.bridgeAuto && !room.autoSend) throw new PanelError('Agent control is paused.', 409);
        if (!room.ready) throw new PanelError('Wait for the investor audio to finish.', 409);
        if (body.pitch !== job.pitch) throw new PanelError('Suggestion text changed. Dismiss it and send an edited reply normally.', 409);
        job.status = 'running';
      } else cancel(room, 'stale'); // Manual/voice input takes precedence over an unapproved draft.
      room.busy = true;
      room.ready = false;
      touch(room);
      return { id, revision: room.revision, jobId: job?.id, pitch: job?.pitch ?? body.pitch };
    },
    finish(ticket, result) {
      const room = roomFor(ticket.id);
      if (!room.busy || room.revision !== ticket.revision) throw new PanelError('App conversation changed.', 409);
      // A new provider session after expiry starts a new history, but bridge revisions stay monotonic.
      if (result.turn === 1) room.history = [];
      room.result = copy(result);
      room.history.push({ founder: ticket.pitch, turn: result.turn, responses: result.speakingOrder.map(role => {
        const r = result.responses.find(r => r.role === role); return { role, reply: r.reply };
      }) });
      room.history = room.history.slice(-10);
      room.revision++;
      room.busy = false;
      const job = room.jobs.get(ticket.jobId);
      if (job) { job.status = 'completed'; job.result = copy(result); job.resultRevision = room.revision; }
      touch(room);
      return room.revision;
    },
    fail(ticket) {
      const room = rooms.get(ticket.id);
      if (!room || room.revision !== ticket.revision) return;
      room.busy = false; room.ready = true;
      const job = room.jobs.get(ticket.jobId);
      if (job) { job.status = 'failed'; job.error = 'Investor evaluation failed. No automatic retry was made.'; }
    },
    ready(id, revision) {
      const room = roomFor(id);
      if (room.busy || room.revision !== revision) throw new PanelError('App conversation changed.', 409);
      room.ready = true; touch(room);
    },
    mode(id, autoSend) {
      const room = roomFor(id);
      if (typeof autoSend !== 'boolean' || !room.token) throw new PanelError('Connect an agent first and supply autoSend.', 400);
      room.autoSend = autoSend; touch(room);
    },
    disconnect(id) { const room = roomFor(id); revoke(room); },
    reset(id) {
      const room = roomFor(id);
      if (room.busy) throw new PanelError('Wait for the current investor evaluation before resetting.', 409);
      revoke(room); room.jobs.clear(); room.result = null; room.history = []; room.revision++; room.ready = true; touch(room);
    },
    close() { for (const room of rooms.values()) revoke(room); rooms.clear(); },
  };
}
