const SCRIPT = [
    { agentId: "leo", text: "Love that spark. Tell me the moment a user lit up using this." },
    { agentId: "marcus", text: "Okay, but who pays, and why do you win against incumbents." },
    { agentId: "priya", text: "Walk me through the stack. What breaks first at scale." },
    { agentId: "sofia", text: "Give me pricing, cost per user, and runway in plain numbers." },
    { agentId: "leo", text: "That vision could sing. What story will users retell tomorrow." },
    { agentId: "marcus", text: "Size the wedge for me. TAM today, first ten customers next." },
    { agentId: "priya", text: "Name one tradeoff you made and why it was worth it." },
    { agentId: "sofia", text: "Tie it to math. CAC, LTV, and margin on each plan." },
];

const FLAVOR_PREFIX = {
    leo: "Leo jumps in, upbeat: ",
    marcus: "Marcus cuts in, dry: ",
    priya: "Priya probes, curious: ",
    sofia: "Sofia checks the math: ",
};

export function createMockClient(options) {
    const opts = options || {};
    const onTranscript = opts.onTranscript || function noop() {};
    const onSpeaking = opts.onSpeaking || function noop2() {};
    const intervalMs = opts.intervalMs || 9000;
    const script = opts.script || SCRIPT;

    let timer = null;
    let index = 0;
    let running = false;
    let activeAgent = null;
    let hintAgent = null;
    const pendingTimeouts = new Set();

    function emitSpeaking(agentId, speaking) {
        onSpeaking({ agentId, speaking, at: Date.now() });
    }

    function emitTranscript(speaker, text) {
        onTranscript({ speaker, text, at: Date.now() });
    }

    function later(fn, ms) {
        const id = setTimeout(function fire() {
            pendingTimeouts.delete(id);
            fn();
        }, ms);
        pendingTimeouts.add(id);
        return id;
    }

    function clearPendingTimeouts() {
        for (const id of pendingTimeouts) {
            clearTimeout(id);
        }
        pendingTimeouts.clear();
    }

    function endSpeech(agentId) {
        if (activeAgent !== agentId) {
            return;
        }
        activeAgent = null;
        emitSpeaking(agentId, false);
    }

    function beginSpeech(agentId, text, endMs) {
        if (running === false) {
            return false;
        }
        if (activeAgent !== null) {
            return false;
        }
        activeAgent = agentId;
        emitSpeaking(agentId, true);
        emitTranscript(agentId, text);
        later(function endTurn() {
            endSpeech(agentId);
        }, endMs || 2500);
        return true;
    }

    function playNext() {
        if (running === false) {
            return;
        }
        if (activeAgent !== null) {
            return;
        }
        const line = script[index % script.length];
        index += 1;
        const flavored = (FLAVOR_PREFIX[line.agentId] || "") + line.text;
        beginSpeech(line.agentId, flavored, 2500);
    }

    function start() {
        if (running) {
            return;
        }
        running = true;
        playNext();
        timer = setInterval(playNext, intervalMs);
    }

    function stop() {
        running = false;
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        clearPendingTimeouts();
        if (activeAgent) {
            const who = activeAgent;
            activeAgent = null;
            emitSpeaking(who, false);
        }
    }

    function simulateUtterance(text) {
        const input = String(text || "");
        emitTranscript("user", input);
        const replyOrder = ["leo", "priya", "sofia", "marcus"];
        const pick = replyOrder[index % replyOrder.length];
        index += 1;
        function attemptReply() {
            if (running === false) {
                return;
            }
            if (activeAgent !== null) {
                later(attemptReply, 1200);
                return;
            }
            activeAgent = pick;
            emitSpeaking(pick, true);
            const ack =
                (FLAVOR_PREFIX[pick] || "") +
                "Heard that. " +
                "Say more about numbers, tech, and story.";
            emitTranscript(pick, ack);
            later(function done() {
                endSpeech(pick);
            }, 2200);
        }
        later(attemptReply, 900);
        return { queued: pick, text: input };
    }

    function setActiveAgent(agentId) {
        hintAgent = agentId;
    }

    function getState() {
        return { running, activeAgent, hintAgent, pendingCount: pendingTimeouts.size };
    }

    return { start, stop, simulateUtterance, setActiveAgent, getState };
}
