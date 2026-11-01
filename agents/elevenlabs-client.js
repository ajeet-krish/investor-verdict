import { AGENT_ORDER } from "./config.js";

const COOLDOWN_MS = 2000;
const DEDUPE_MS = 2500;
const STALE_MS = 12000;
const MAX_REPLIES_PER_TURN = 2;

export function createLiveClient(options) {
    const opts = options || {};
    const agentIds = opts.agentIds || {};
    const getSignedUrl = opts.getSignedUrl || null;
    const textOnly = opts.textOnly === true;
    const onTranscript = opts.onTranscript || function noop() {};
    const onSpeaking = opts.onSpeaking || function noopSpeaking() {};
    const onStatus = opts.onStatus || function noopStatus() {};
    const onError = opts.onError || function noopError() {};

    const clientToolsFor = opts.clientToolsFor || (() => ({}));
    const sessions = new Map();
    const terminal = new Set();
    let micStream = null;
    let running = false;
    let activeSpeaker = null;
    let lastSpokeAt = 0;
    let speakQueue = [];
    let retryCount = 0;
    let ConversationRef = opts.Conversation || null;
    let activeAgentHint = null;
    let flushTimerIds = [];
    let founderTurn = 0;
    let repliesThisTurn = 0;
    let roundRobinIdx = 0;
    let lastUserNorm = "";
    let lastUserAt = 0;
    let primaryAgentId = null;
    let pendingAddressed = null;

    function scheduleFlush(delayMs) {
        const timerId = setTimeout(function flushTick() {
            flushTimerIds = flushTimerIds.filter(function keep(id) { return id !== timerId; });
            flushQueue();
        }, delayMs);
        flushTimerIds.push(timerId);
    }

    function clearFlushTimers() {
        for (let i = 0; i < flushTimerIds.length; i += 1) {
            clearTimeout(flushTimerIds[i]);
        }
        flushTimerIds = [];
    }

    function now() {
        return Date.now();
    }

    function normalize(text) {
        return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
    }

    function detectAddressed(inputLower) {
        for (let i = 0; i < AGENT_ORDER.length; i += 1) {
            const id = AGENT_ORDER[i];
            const spaced = id.replace(/_/g, " ");
            if (inputLower.includes(id) || inputLower.includes(spaced)) {
                return id;
            }
        }
        return null;
    }

    function shouldDropUserDuplicate(norm) {
        const at = now();
        if (norm === "" ) {
            return true;
        }
        if (norm === lastUserNorm && at - lastUserAt < DEDUPE_MS) {
            lastUserNorm = norm;
            lastUserAt = at;
            return true;
        }
        lastUserNorm = norm;
        lastUserAt = at;
        return false;
    }

    function pruneStaleQueue() {
        const at = now();
        speakQueue = speakQueue.filter(function fresh(entry) {
            return at - entry.at < STALE_MS;
        });
    }

    function sortQueueByPriority() {
        speakQueue.sort(function byPriority(a, b) {
            const aAddr = a.agentId === pendingAddressed ? 1 : 0;
            const bAddr = b.agentId === pendingAddressed ? 1 : 0;
            if (aAddr !== bAddr) {
                return bAddr - aAddr;
            }
            const aDelta = Number(a.delta) || 0;
            const bDelta = Number(b.delta) || 0;
            if (aDelta !== bDelta) {
                return bDelta - aDelta;
            }
            return a.seq - b.seq;
        });
    }

    function canSpeak(agentId) {
        void agentId;
        if (activeSpeaker !== null) {
            return false;
        }
        if (now() - lastSpokeAt < COOLDOWN_MS) {
            return false;
        }
        if (repliesThisTurn >= MAX_REPLIES_PER_TURN) {
            return false;
        }
        return true;
    }

    function applyAudioGate() {
        const entries = Array.from(sessions.entries());
        for (let i = 0; i < entries.length; i += 1) {
            const agentId = entries[i][0];
            const session = entries[i][1];
            const isActive = agentId === activeSpeaker;
            const targetVolume = isActive ? 1 : 0;
            const targetMuted = isActive === false;
            if (tryMuteMethod(session, targetVolume, targetMuted, isActive)) {
                continue;
            }
        }
    }

    function tryMuteMethod(session, targetVolume, targetMuted, isActive) {
        if (session === null || session === undefined) {
            return false;
        }
        if (typeof session.setVolume === "function") {
            try {
                session.setVolume({ volume: targetVolume });
                return true;
            } catch (errVolume) {
                void errVolume;
            }
        }
        if (typeof session.mute === "function" && typeof session.unmute === "function") {
            try {
                if (isActive) {
                    session.unmute();
                } else {
                    session.mute();
                }
                return true;
            } catch (errMute) {
                void errMute;
            }
        }
        if (typeof session.setMuted === "function") {
            try {
                session.setMuted(targetMuted);
                return true;
            } catch (errMuted) {
                void errMuted;
            }
        }
        if (typeof session.setAudioEnabled === "function") {
            try {
                session.setAudioEnabled(isActive);
                return true;
            } catch (errAudio) {
                void errAudio;
            }
        }
        try {
            if (session.volume !== undefined) {
                session.volume = targetVolume;
                return true;
            }
        } catch (errProp) {
            void errProp;
        }
        return false;
    }

    function flushQueue() {
        pruneStaleQueue();
        if (activeSpeaker !== null) {
            return;
        }
        if (speakQueue.length === 0) {
            return;
        }
        if (now() - lastSpokeAt < COOLDOWN_MS) {
            scheduleFlush(COOLDOWN_MS);
            return;
        }
        if (repliesThisTurn >= MAX_REPLIES_PER_TURN) {
            speakQueue = [];
            return;
        }
        sortQueueByPriority();
        const next = speakQueue.shift();
        if (next) {
            setSpeaking(next.agentId, true);
        }
        applyAudioGate();
    }

    function requestSpeech(agentId, detail) {
        const info = detail || {};
        pruneStaleQueue();
        for (let i = 0; i < speakQueue.length; i += 1) {
            if (speakQueue[i].agentId === agentId) {
                speakQueue[i].delta = Number(info.delta) || speakQueue[i].delta || 0;
                if (info.addressed) {
                    speakQueue[i].addressed = true;
                }
                speakQueue[i].at = now();
                return true;
            }
        }
        if (repliesThisTurn >= MAX_REPLIES_PER_TURN) {
            return false;
        }
        speakQueue.push({
            agentId,
            at: now(),
            seq: roundRobinIdx,
            delta: Number(info.delta) || 0,
            addressed: Boolean(info.addressed),
        });
        roundRobinIdx += 1;
        return true;
    }

    function setSpeaking(agentId, speaking) {
        if (speaking) {
            if (canSpeak(agentId) === false) {
                requestSpeech(agentId, { addressed: agentId === pendingAddressed, delta: 0 });
                applyAudioGate();
                return;
            }
            activeSpeaker = agentId;
            lastSpokeAt = now();
            repliesThisTurn += 1;
            speakQueue = speakQueue.filter(function keep(entry) { return entry.agentId !== agentId; });
            onSpeaking({ agentId, speaking: true, at: now() });
            applyAudioGate();
        } else {
            if (terminal.has(agentId)) {
                const session = sessions.get(agentId);
                sessions.delete(agentId);
                speakQueue = speakQueue.filter(entry => entry.agentId !== agentId);
                if (primaryAgentId === agentId) primaryAgentId = sessions.keys().next().value || null;
                if (session) session.endSession().catch(() => {});
            }
            const wasActive = activeSpeaker === agentId;
            if (wasActive) {
                activeSpeaker = null;
                lastSpokeAt = now();
            }
            onSpeaking({ agentId, speaking: false, at: now() });
            applyAudioGate();
            if (wasActive) {
                scheduleFlush(COOLDOWN_MS);
            }
        }
    }

    function handleAgentText(agentId, text) {
        onTranscript({ speaker: agentId, text: String(text), at: now() });
    }

    function handleUserText(text, isFinal) {
        if (isFinal === false) {
            return;
        }
        const norm = normalize(text);
        if (shouldDropUserDuplicate(norm)) {
            return;
        }
        founderTurn += 1;
        repliesThisTurn = 0;
        pendingAddressed = detectAddressed(norm);
        if (activeSpeaker !== null) {
            const interrupted = activeSpeaker;
            activeSpeaker = null;
            onSpeaking({ agentId: interrupted, speaking: false, at: now(), interrupted: true });
            applyAudioGate();
            scheduleFlush(COOLDOWN_MS);
        }
        onTranscript({ speaker: "user", text: String(text), at: now() });
    }

    function handleUserTextFromSession(sourceAgentId, text, isFinal) {
        if (primaryAgentId !== null && sourceAgentId !== primaryAgentId) {
            return;
        }
        handleUserText(text, isFinal);
    }

    async function loadSdk() {
        if (ConversationRef) {
            return ConversationRef;
        }
        const mod = await import("@elevenlabs/client");
        ConversationRef = mod.Conversation;
        return ConversationRef;
    }

    // The current SDK owns its microphone stream. It does not accept userMediaStream.
    async function resolveMic() {}

    async function endPartialSessions() {
        const entries = Array.from(sessions.entries());
        for (let i = 0; i < entries.length; i += 1) {
            const session = entries[i][1];
            try {
                if (session && typeof session.endSession === "function") {
                    await session.endSession();
                }
            } catch (err) {
                void err;
            }
        }
        sessions.clear();
        primaryAgentId = null;
        applyAudioGate();
    }

    async function startOneSession(Conversation, agentId, agentValue) {
        let signedUrl = null;
        if (typeof getSignedUrl === "function") {
            signedUrl = await getSignedUrl(agentId);
        }
        const baseConfig = signedUrl
            ? { signedUrl }
            : { agentId: agentValue };
        const handlers = clientToolsFor(agentId);
        const session = await Conversation.startSession({
            ...baseConfig,
            connectionType: 'websocket',
            textOnly,
            clientTools: {
                ...handlers,
                report_investor_interest: payload => {
                    const result = handlers.report_investor_interest(payload);
                    const accepted = JSON.parse(result);
                    if (accepted.accepted && (accepted.confidence === 0 || accepted.confidence === 100)) {
                        terminal.add(agentId);
                        // Let the result and closing verdict finish before ending the session.
                        const timer = setTimeout(() => setSpeaking(agentId, false), 20000);
                        flushTimerIds.push(timer);
                    }
                    return result;
                },
            },
            onMessage: function onMsg(msg) {
                const kind = msg && (msg.type || msg.source || "");
                const text = (msg && (msg.text || msg.message || "")) || "";
                if (kind === "user_transcript" || msg?.isFinal === true || kind === "user") {
                    handleUserTextFromSession(agentId, text, msg?.isFinal !== false);
                } else if (kind === "agent_response" || kind === "agent") {
                    handleAgentText(agentId, text);
                } else if (text) {
                    onTranscript({ speaker: agentId, text: String(text), at: now() });
                }
            },
            onModeChange: function onMode(mode) {
                const m = mode && (mode.mode || mode);
                if (m === "speaking") {
                    setSpeaking(agentId, true);
                } else if (m === "listening" || m === "idle") {
                    setSpeaking(agentId, false);
                }
            },
            onStatusChange: function onStat(status) {
                onStatus({ agentId, status, at: now() });
            },
            onError: function onErr(err) {
                onError({ agentId, error: err, at: now() });
            },
        });
        if (!running) { await session.endSession(); throw new Error('Call cancelled.'); }
        sessions.set(agentId, session);
        if (primaryAgentId === null) {
            primaryAgentId = agentId;
        }
        applyAudioGate();
    }

    async function start() {
        if (running) {
            return { ok: true, retried: retryCount > 0 };
        }
        running = true;
        onStatus({ agentId: "all", status: "connecting", at: now() });
        try {
            const Conversation = await loadSdk();
            await resolveMic();
            const usable = AGENT_ORDER.filter(function hasId(k) { return Boolean(agentIds[k]); });
            if (usable.length !== 4) {
                throw new Error("Missing investor IDs. Check the root .env file.");
            }
            primaryAgentId = null;
            for (let i = 0; i < usable.length; i += 1) {
                if (!running) throw new Error('Call cancelled.');
                const key = usable[i];
                await startOneSession(Conversation, key, agentIds[key]);
            }
            retryCount = 0;
            onStatus({ agentId: "all", status: "live", at: now() });
            return { ok: true, agents: usable };
        } catch (err) {
            await endPartialSessions();
            running = false;
            onError({ agentId: "all", error: err, fallbackToMock: true, at: now() });
            throw err;
        }
    }

    async function stop() {
        running = false;
        clearFlushTimers();
        speakQueue = [];
        if (activeSpeaker !== null) {
            const who = activeSpeaker;
            activeSpeaker = null;
            lastSpokeAt = now();
            onSpeaking({ agentId: who, speaking: false, at: now() });
        }
        const entries = Array.from(sessions.entries());
        for (let i = 0; i < entries.length; i += 1) {
            const session = entries[i][1];
            try {
                if (session && typeof session.endSession === "function") {
                    await session.endSession();
                }
            } catch (err) {
                void err;
            }
        }
        sessions.clear();
        primaryAgentId = null;
        if (micStream) {
            try {
                const tracks = micStream.getTracks();
                for (let t = 0; t < tracks.length; t += 1) {
                    tracks[t].stop();
                }
            } catch (err2) {
                void err2;
            }
            micStream = null;
        }
        onStatus({ agentId: "all", status: "stopped", at: now() });
    }

    function setActiveAgent(agentId) {
        activeAgentHint = agentId;
        pendingAddressed = agentId;
        onStatus({ agentId, status: "active_hint", at: now() });
    }

    function trySendText(session, input) {
        if (session === null || session === undefined) {
            return false;
        }
        try {
            if (typeof session.sendUserMessage === "function") {
                session.sendUserMessage(input);
                return true;
            }
            if (typeof session.sendMessage === "function") {
                session.sendMessage(input);
                return true;
            }
        } catch (err) {
            void err;
        }
        return false;
    }

    async function sendUserText(text) {
        const input = String(text || "");
        handleUserText(input, true);
        for (const [id, session] of sessions) {
            if (!terminal.has(id)) trySendText(session, input);
        }
    }

    function setMicMuted(muted) {
        for (const session of sessions.values()) session.setMicMuted?.(Boolean(muted));
    }

    function getState() {
        return { running, activeSpeaker, activeAgentHint, sessionCount: sessions.size, retryCount, founderTurn, repliesThisTurn, queueLength: speakQueue.length };
    }

    return { start, stop, setActiveAgent, setMicMuted, sendUserText, requestSpeech, getState };
}
