import { DELTA_MAX, DELTA_MIN, LEAVE_AT, OFFER_AT, PERSONAS, START_SCORES } from "./config.js";

const SHARED_POSITIVE = [
    "customers",
    "pricing",
    "traction",
    "paying",
    "retention",
    "growth",
    "profit",
    "million",
    "thousand",
    "percent",
];

const SHARED_NEGATIVE = ["vague", "hype", "maybe", "sort of", "everyone", "hopefully", "probably", "kind of"];

const LEO_POSITIVE = ["story", "energy", "vision", "mission", "passion", "excited", "love", "users love", "change"];

const PRIYA_POSITIVE = [
    "architecture",
    "tradeoff",
    "trade off",
    "stack",
    "latency",
    "scalable",
    "infrastructure",
    "api",
    "system",
    "built",
    "technical",
];

const SOFIA_POSITIVE = [
    "unit",
    "economics",
    "burn",
    "cac",
    "ltv",
    "runway",
    "margin",
    "cost",
    "pricing",
];

const MARCUS_POSITIVE = ["revenue", "moat", "tam", "market", "defensible", "arr", "share", "monopoly"];

const NUMBER_PATTERN = /\d/;

function countHits(lower, phrases) {
    let hits = 0;
    for (let i = 0; i < phrases.length; i += 1) {
        if (lower.includes(phrases[i])) {
            hits += 1;
        }
    }
    return hits;
}

function clampDelta(raw) {
    const mag = Math.abs(raw);
    const bounded = Math.min(DELTA_MAX, Math.max(DELTA_MIN, mag));
    return raw < 0 ? 0 - bounded : bounded;
}

function trimReason(text) {
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (clean.length <= 140) {
        return clean;
    }
    return clean.slice(0, 137) + "...";
}

function scoreOneAgent(agentId, lower, hasNumber) {
    const persona = PERSONAS[agentId];
    const sensitivity = persona && persona.sensitivity ? persona.sensitivity : 1;
    let score = 0;
    const notes = [];

    const sharedPos = countHits(lower, SHARED_POSITIVE);
    const sharedNeg = countHits(lower, SHARED_NEGATIVE);
    if (hasNumber) {
        score += 4;
        notes.push("numbers cited");
    }
    if (sharedPos > 0) {
        score += 2 + sharedPos;
        notes.push("specifics on traction or pricing");
    }
    if (sharedNeg > 0) {
        score += 0 - (2 + sharedNeg);
        notes.push("vague or hype phrasing");
    }

    if (agentId === "leo") {
        const hits = countHits(lower, LEO_POSITIVE);
        if (hits > 0) {
            score += 2 + hits;
            notes.push("story and energy landed");
        } else if (lower.length < 24) {
            score += 0 - 3;
            notes.push("flat pitch, low energy");
        }
    }

    if (agentId === "priya") {
        const hits = countHits(lower, PRIYA_POSITIVE);
        if (hits > 0) {
            score += 2 + hits;
            notes.push("tech depth with architecture detail");
        } else if (sharedNeg > 0) {
            score += 0 - 2;
            notes.push("missing how it works");
        }
    }

    if (agentId === "sofia") {
        const hits = countHits(lower, SOFIA_POSITIVE);
        if (hits > 0) {
            score += 2 + hits;
            notes.push("unit economics and cost clarity");
        } else if (hasNumber === false) {
            score += 0 - 3;
            notes.push("no numbers for math check");
        }
    }

    if (agentId === "marcus") {
        const hits = countHits(lower, MARCUS_POSITIVE);
        if (hits > 0) {
            score += 2 + hits;
            notes.push("revenue, moat, or market sized");
        } else if (sharedNeg > 0) {
            score += 0 - 2;
            notes.push("no moat or market proof");
        }
    }

    let delta;
    let reason;
    if (score > 0) {
        const scaled = Math.round((DELTA_MIN + score) * sensitivity);
        delta = clampDelta(scaled);
        reason = "Plus " + String(delta) + ": " + notes.slice(0, 2).join(", ");
    } else if (score < 0) {
        const scaled = Math.round((DELTA_MIN + Math.abs(score)) * sensitivity);
        delta = clampDelta(0 - scaled);
        reason = "Minus " + String(Math.abs(delta)) + ": " + notes.slice(0, 2).join(", ");
    } else {
        delta = 0 - DELTA_MIN;
        reason = "Minus " + String(DELTA_MIN) + ": no specifics yet, add traction or numbers";
    }

    return { delta, reason: trimReason(reason) };
}

function clampStartScore(value, fallback) {
    const num = Number(value);
    const safe = Number.isFinite(num) ? num : fallback;
    if (safe < LEAVE_AT) {
        return LEAVE_AT;
    }
    if (safe > OFFER_AT) {
        return OFFER_AT;
    }
    return safe;
}

export function createConfidenceEngine(startScores) {
    const base = startScores || START_SCORES;
    return {
        scores: {
            marcus: clampStartScore(base.marcus, 50),
            priya: clampStartScore(base.priya, 50),
            leo: clampStartScore(base.leo, 50),
            sofia: clampStartScore(base.sofia, 50),
        },
        outcome: {
            marcus: null,
            priya: null,
            leo: null,
            sofia: null,
        },
    };
}

export function scoreTurn(text, state) {
    const input = String(text || "");
    const lower = input.toLowerCase();
    const hasNumber = NUMBER_PATTERN.test(input);
    void state;
    return {
        marcus: scoreOneAgent("marcus", lower, hasNumber),
        priya: scoreOneAgent("priya", lower, hasNumber),
        leo: scoreOneAgent("leo", lower, hasNumber),
        sofia: scoreOneAgent("sofia", lower, hasNumber),
    };
}

export function apply(state, results) {
    const events = [];
    const agents = ["marcus", "priya", "leo", "sofia"];
    for (let i = 0; i < agents.length; i += 1) {
        const id = agents[i];
        if (state.outcome[id] !== null) {
            continue;
        }
        const entry = results[id];
        if (!entry) {
            continue;
        }
        const current = state.scores[id] ?? 50;
        let next = current + entry.delta;
        if (next < LEAVE_AT) {
            next = LEAVE_AT;
        }
        if (next > OFFER_AT) {
            next = OFFER_AT;
        }
        state.scores[id] = next;
        if (next <= LEAVE_AT && state.outcome[id] === null) {
            state.outcome[id] = "leave";
            events.push({ type: "leave", agentId: id, score: next, reason: entry.reason });
        }
        if (next >= OFFER_AT && state.outcome[id] === null) {
            state.outcome[id] = "offer";
            events.push({ type: "offer", agentId: id, score: next, reason: entry.reason });
        }
    }
    return events;
}
