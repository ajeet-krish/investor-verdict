const COOLDOWN_MS = 2000;

export function createLiveClient(options) {
    const opts = options || {};
    const agentIds = opts.agentIds || {};
    const getSignedUrl = opts.getSignedUrl || null;
    const textOnly = opts.textOnly === true;
    const onTranscript = opts.onTranscript || function noop() {};
    const onSpeaking = opts.onSpeaking || function noopSpeaking() {};
    const onStatus = opts.onStatus || function noopStatus() {};
    const onError = opts.onError || function noopError() {};

    const agentKeys = ["marcus", "priya", "leo", "sofia"];
    const sessions = new Map();
    let micStream = null;
    let running = false;
    let activeSpeaker = null;
    let lastSpokeAt = 0;
    let speakQueue = [];
    let retryCount = 0;
    let ConversationRef = null;
    let activeAgentHint = null;
    let flushTimerIds = [];

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

    function canSpeak(agentId) {
        void agentId;
        if (activeSpeaker !== null) {
            return false;
        }
        if (now() - lastSpokeAt < COOLDOWN_MS) {
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
                session.setVolume(targetVolume);
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
        const next = speakQueue.shift();
        setSpeaking(next.agentId, true);
        applyAudioGate();
    }

    function setSpeaking(agentId, speaking) {
        if (speaking) {
            if (canSpeak(agentId) === false) {
                if (speakQueue.some(function has(entry) { return entry.agentId === agentId; }) === false) {
                    speakQueue.push({ agentId, at: now() });
                }
                applyAudioGate();
                return;
            }
            activeSpeaker = agentId;
            lastSpokeAt = now();
            speakQueue = speakQueue.filter(function keep(entry) { return entry.agentId !== agentId; });
            onSpeaking({ agentId, speaking: true, at: now() });
            applyAudioGate();
        } else {
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
        if (activeSpeaker !== null) {
            const interrupted = activeSpeaker;
            activeSpeaker = null;
            onSpeaking({ agentId: interrupted, speaking: false, at: now(), interrupted: true });
            applyAudioGate();
            scheduleFlush(COOLDOWN_MS);
        }
        onTranscript({ speaker: "user", text: String(text), at: now() });
    }

    async function loadSdk() {
        if (ConversationRef) {
            return ConversationRef;
        }
        const mod = await import("@elevenlabs/client");
        ConversationRef = mod.Conversation;
        return ConversationRef;
    }

    async function resolveMic() {
        if (textOnly) {
            return null;
        }
        if (micStream) {
            return micStream;
        }
        if (typeof navigator === "undefined" || !navigator.mediaDevices) {
            return null;
        }
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return micStream;
    }

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
        const session = await Conversation.startSession({
            ...baseConfig,
            ...(micStream ? { userMediaStream: micStream } : {}),
            onMessage: function onMsg(msg) {
                const kind = msg && (msg.type || msg.source || "");
                const text = (msg && (msg.text || msg.message || "")) || "";
                if (kind === "user_transcript" || msg.isFinal === true || kind === "user") {
                    handleUserText(text, msg.isFinal !== false);
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
        sessions.set(agentId, session);
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
            const usable = agentKeys.filter(function hasId(k) { return Boolean(agentIds[k]); });
            if (usable.length === 0) {
                throw new Error("Missing agentIds map, provide 4 public agent IDs");
            }
            for (let i = 0; i < usable.length; i += 1) {
                const key = usable[i];
                await startOneSession(Conversation, key, agentIds[key]);
            }
            retryCount = 0;
            onStatus({ agentId: "all", status: "live", at: now() });
            return { ok: true, agents: usable };
        } catch (err) {
            if (retryCount < 1) {
                retryCount += 1;
                await endPartialSessions();
                running = false;
                await new Promise(function wait(res) { setTimeout(res, 800); });
                return start();
            }
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
        if (activeAgentHint && sessions.has(activeAgentHint)) {
            const hinted = sessions.get(activeAgentHint);
            if (trySendText(hinted, input)) {
                return;
            }
        }
        const entries = Array.from(sessions.entries());
        for (let i = 0; i < entries.length; i += 1) {
            const session = entries[i][1];
            if (trySendText(session, input)) {
                break;
            }
        }
    }

    function getState() {
        return { running, activeSpeaker, activeAgentHint, sessionCount: sessions.size, retryCount };
    }

    return { start, stop, setActiveAgent, sendUserText, getState };
}
