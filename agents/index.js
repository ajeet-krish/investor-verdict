import { START_SCORES } from "./config.js";
import { createEmitter } from "./event-emitter.js";
import { apply, createConfidenceEngine, scoreTurn } from "./confidence-engine.js";
import { createMockClient } from "./mock-client.js";
import { createLiveClient } from "./elevenlabs-client.js";

export function createInvestorCall(options) {
    const opts = options || {};
    const mode = opts.mode || "auto";
    const agentIds = opts.agentIds || {};
    const startScores = { ...START_SCORES, ...(opts.startScores || {}) };
    const textOnly = opts.textOnly === true;
    const getSignedUrl = opts.getSignedUrl || null;
    const mockIntervalMs = opts.mockIntervalMs || 9000;

    const engineState = createConfidenceEngine(startScores);
    const bus = createEmitter();

    let client = null;
    let clientKind = null;
    let started = false;
    let pendingEchoSuppress = 0;

    function currentScores() {
        return { ...engineState.scores };
    }

    function handleUserText(text) {
        const input = String(text || "");
        if (!input.trim()) {
            return { scores: currentScores(), events: [] };
        }
        const results = scoreTurn(input, engineState);
        const events = apply(engineState, results);
        bus.emit("score", { scores: currentScores(), results, input });
        for (let i = 0; i < events.length; i += 1) {
            const evt = events[i];
            if (evt.type === "leave") {
                bus.emit("leave", evt);
            }
            if (evt.type === "offer") {
                bus.emit("offer", evt);
            }
        }
        return { scores: currentScores(), events, results };
    }

    function wireCommonCallbacks(callbacks) {
        const cbs = callbacks || {};
        return {
            onTranscript: function onT(evt) {
                if (cbs.onTranscript) {
                    cbs.onTranscript(evt);
                }
                if (evt && evt.speaker === "user" && pendingEchoSuppress > 0) {
                    pendingEchoSuppress -= 1;
                    return;
                }
                bus.emit("transcript", evt);
                if (evt && evt.speaker === "user") {
                    handleUserText(evt.text);
                }
            },
            onSpeaking: function onS(evt) {
                if (cbs.onSpeaking) {
                    cbs.onSpeaking(evt);
                }
                bus.emit("speaking", evt);
            },
            onStatus: function onSt(evt) {
                bus.emit("status", evt);
            },
            onError: function onE(evt) {
                bus.emit("error", evt);
            },
        };
    }

    function buildMock() {
        const wired = wireCommonCallbacks({});
        const mock = createMockClient({
            intervalMs: mockIntervalMs,
            onTranscript: wired.onTranscript,
            onSpeaking: wired.onSpeaking,
        });
        return mock;
    }

    function buildLive() {
        const wired = wireCommonCallbacks({});
        const live = createLiveClient({
            agentIds,
            getSignedUrl,
            textOnly,
            onTranscript: wired.onTranscript,
            onSpeaking: wired.onSpeaking,
            onStatus: wired.onStatus,
            onError: wired.onError,
        });
        return live;
    }

    async function start() {
        if (started) {
            return { kind: clientKind, scores: currentScores() };
        }
        started = true;
        bus.emit("status", { agentId: "all", status: "starting", mode, at: Date.now() });
        if (mode === "mock") {
            client = buildMock();
            clientKind = "mock";
            client.start();
            bus.emit("status", { agentId: "all", status: "mock_live", at: Date.now() });
            return { kind: clientKind, scores: currentScores() };
        }
        if (mode === "live") {
            client = buildLive();
            clientKind = "live";
            try {
                await client.start();
            } catch (err) {
                started = false;
                throw err;
            }
            return { kind: clientKind, scores: currentScores() };
        }
        try {
            const live = buildLive();
            await live.start();
            client = live;
            clientKind = "live";
            return { kind: clientKind, scores: currentScores() };
        } catch (err) {
            bus.emit("error", { agentId: "all", error: err, fallbackToMock: true, at: Date.now() });
            client = buildMock();
            clientKind = "mock";
            client.start();
            bus.emit("status", { agentId: "all", status: "mock_fallback", at: Date.now() });
            return { kind: clientKind, scores: currentScores(), fallback: true };
        }
    }

    async function stop() {
        started = false;
        if (client && typeof client.stop === "function") {
            await client.stop();
        }
        client = null;
        bus.emit("status", { agentId: "all", status: "stopped", at: Date.now() });
    }

    function setActiveAgent(agentId) {
        if (client && typeof client.setActiveAgent === "function") {
            client.setActiveAgent(agentId);
        }
        bus.emit("status", { agentId, status: "active_hint", at: Date.now() });
    }

    function simulateUtterance(text) {
        const input = String(text || "");
        if (!input.trim()) {
            return { scores: currentScores(), events: [] };
        }
        bus.emit("transcript", { speaker: "user", text: input, at: Date.now() });
        const out = handleUserText(input);
        try {
            if (client && clientKind === "mock" && typeof client.simulateUtterance === "function") {
                pendingEchoSuppress += 1;
                client.simulateUtterance(input);
            } else if (client && clientKind === "live" && typeof client.sendUserText === "function") {
                pendingEchoSuppress += 1;
                const maybe = client.sendUserText(input);
                if (maybe && typeof maybe.catch === "function") {
                    maybe.catch(function swallow(err) {
                        void err;
                        pendingEchoSuppress = Math.max(0, pendingEchoSuppress - 1);
                    });
                }
            }
        } catch (err) {
            pendingEchoSuppress = Math.max(0, pendingEchoSuppress - 1);
            bus.emit("error", { agentId: "all", error: err, at: Date.now() });
        }
        return out;
    }

    function onScoreUpdate(fn) {
        return bus.on("score", fn);
    }

    function onLeave(fn) {
        return bus.on("leave", fn);
    }

    function onOffer(fn) {
        return bus.on("offer", fn);
    }

    function onTranscript(fn) {
        return bus.on("transcript", fn);
    }

    function onAgentSpeaking(fn) {
        return bus.on("speaking", fn);
    }

    function onStatusChange(fn) {
        return bus.on("status", fn);
    }

    function onError(fn) {
        return bus.on("error", fn);
    }

    return {
        start,
        stop,
        setActiveAgent,
        simulateUtterance,
        onScoreUpdate,
        onLeave,
        onOffer,
        onTranscript,
        onAgentSpeaking,
        onStatusChange,
        onError,
        getScores: currentScores,
        getKind: function kind() { return clientKind; },
    };
}
