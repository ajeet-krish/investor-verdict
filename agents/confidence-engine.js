import { AGENT_ORDER, DELTA_MAX, DELTA_MIN, LEAVE_AT, OFFER_AT, PERSONAS, START_SCORES } from "./config.js";

const CTO_POSITIVE = [
    "tam",
    "market",
    "pricing",
    "revenue",
    "paying",
    "traction",
    "customers",
    "share",
    "arr",
    "monopoly",
    "growth",
    "retention",
];

const TECH_BRO_POSITIVE = [
    "architecture",
    "built",
    "novel",
    "scale",
    "scalable",
    "tradeoff",
    "trade off",
    "stack",
    "latency",
    "api",
    "system",
    "infrastructure",
    "innovation",
    "creative",
];

const INTERROGATOR_POSITIVE = [
    "profit",
    "price",
    "pricing",
    "margin",
    "cash",
    "payback",
    "revenue",
    "cost",
];

const SYMPATHIZER_POSITIVE = [
    "story",
    "mission",
    "love",
    "users love",
    "vision",
    "passion",
    "excited",
    "heart",
    "change",
    "journey",
];

const SHARED_NEGATIVE = ["vague", "hype", "maybe", "sort of", "everyone", "hopefully", "probably", "kind of"];

const CTO_JARGON = [
    "kubernetes",
    "microservice",
    "latency",
    "stack",
    "api",
    "infrastructure",
    "refactor",
    "algorithm",
];

const TECH_BRO_FINANCE_PENALTY = [
    "cac",
    "ltv",
    "burn",
    "runway",
    "spreadsheet",
    "unit economics",
    "unit",
    "economics",
];

const POSITIVE_BY_AGENT = {
    cto: CTO_POSITIVE,
    tech_bro: TECH_BRO_POSITIVE,
    interrogator: INTERROGATOR_POSITIVE,
    sympathizer: SYMPATHIZER_POSITIVE,
};

const NUMBER_PATTERN = /\d/;
const SHORT_PROXY_MAX = 500;

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
    if (raw < 0) {
        return 0 - bounded;
    }
    return bounded;
}

function trimReason(text) {
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (clean.length <= 140) {
        return clean;
    }
    return clean.slice(0, 137) + "...";
}

function getPersona(agentId) {
    const persona = PERSONAS[agentId];
    if (persona) {
        return persona;
    }
    return { upSensitivity: 1, downSensitivity: 1, upThreshold: 2 };
}

function scoreOneAgent(agentId, lower, hasNumber, fullLength) {
    const persona = getPersona(agentId);
    const upSensitivity = Number(persona.upSensitivity) || 1;
    const downSensitivity = Number(persona.downSensitivity) || 1;
    const upThreshold = Number(persona.upThreshold) || 2;
    let score = 0;
    const notes = [];

    const positiveList = POSITIVE_BY_AGENT[agentId] || [];
    const sharedNeg = countHits(lower, SHARED_NEGATIVE);

    if (agentId === "cto") {
        const financeHits = countHits(lower, CTO_POSITIVE);
        const jargonHits = countHits(lower, CTO_JARGON);
        if (financeHits > 0) {
            score += 2 + financeHits;
            notes.push("market and finance signals landed");
        }
        if (hasNumber) {
            score += 3;
            notes.push("numbers cited");
        }
        if (jargonHits > 0 && financeHits === 0) {
            score += 0 - (3 + jargonHits);
            notes.push("tech jargon with zero finance");
        }
        if (sharedNeg > 0) {
            score += 0 - (2 + sharedNeg);
            notes.push("vague or hype phrasing");
        }
    }

    if (agentId === "tech_bro") {
        const hits = countHits(lower, TECH_BRO_POSITIVE);
        const financeHits = countHits(lower, TECH_BRO_FINANCE_PENALTY);
        if (hits > 0) {
            score += 2 + hits;
            notes.push("build detail and novel choices");
        }
        if (financeHits > 0) {
            score += 0 - (2 + financeHits);
            notes.push("spreadsheet talk, yawns at finance");
        }
        if (sharedNeg > 0) {
            score += 0 - (2 + sharedNeg);
            notes.push("vague or hype phrasing");
        }
    }

    if (agentId === "interrogator") {
        const hits = countHits(lower, INTERROGATOR_POSITIVE);
        const shortEnough = fullLength <= SHORT_PROXY_MAX;
        const gatePass = hasNumber && hits > 0 && shortEnough;
        if (gatePass) {
            score += 2 + hits + 2;
            notes.push("profit plus numbers, short and blunt");
        } else {
            if (hasNumber === false) {
                score += 0 - 3;
                notes.push("no numbers for cash check");
            }
            if (hits === 0) {
                score += 0 - 2;
                notes.push("no profit price margin cash proof");
            }
            if (shortEnough === false) {
                score += 0 - 2;
                notes.push("too long, blunt answer missing");
            }
        }
        if (sharedNeg > 0) {
            score += 0 - (2 + sharedNeg);
            notes.push("vague or hype phrasing");
        }
    }

    if (agentId === "sympathizer") {
        const hits = countHits(lower, SYMPATHIZER_POSITIVE);
        if (hits > 0) {
            score += 2 + hits;
            notes.push("story and user love landed");
        } else if (lower.length < 24) {
            score += 0 - 2;
            notes.push("flat pitch, low warmth");
        }
        if (hasNumber) {
            score += 1;
            notes.push("traction hint helps");
        }
        if (sharedNeg > 0) {
            score += 0 - (1 + sharedNeg);
            notes.push("vague phrasing cools warmth");
        }
    }

    let delta;
    let reason;
    if (score > 0) {
        if (score < upThreshold) {
            delta = 0 - DELTA_MIN;
            reason = "Minus " + String(DELTA_MIN) + ": below yes bar, add specifics";
        } else {
            const scaled = Math.round((DELTA_MIN + score) * upSensitivity);
            delta = clampDelta(scaled);
            reason = "Plus " + String(delta) + ": " + notes.slice(0, 2).join(", ");
        }
    } else if (score < 0) {
        const scaled = Math.round((DELTA_MIN + Math.abs(score)) * downSensitivity);
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
    const scores = {};
    const outcome = {};
    for (let i = 0; i < AGENT_ORDER.length; i += 1) {
        const id = AGENT_ORDER[i];
        scores[id] = clampStartScore(base[id], 50);
        outcome[id] = null;
    }
    return { scores, outcome };
}

export function scoreTurn(text, state) {
    const input = String(text || "");
    const lower = input.toLowerCase();
    const hasNumber = NUMBER_PATTERN.test(input);
    void state;
    const results = {};
    for (let i = 0; i < AGENT_ORDER.length; i += 1) {
        const id = AGENT_ORDER[i];
        results[id] = scoreOneAgent(id, lower, hasNumber, input.length);
    }
    return results;
}

function dealFor(agentId) {
    const persona = PERSONAS[agentId];
    const profile = persona ? persona.dealProfile : null;
    if (profile) {
        return { dealRank: profile.rank, dealLabel: profile.label };
    }
    return { dealRank: 0, dealLabel: "Pending" };
}

export function apply(state, results) {
    const events = [];
    for (let i = 0; i < AGENT_ORDER.length; i += 1) {
        const id = AGENT_ORDER[i];
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
        const deal = dealFor(id);
        if (next <= LEAVE_AT && state.outcome[id] === null) {
            state.outcome[id] = "leave";
            events.push({ type: "leave", agentId: id, score: next, reason: entry.reason, dealRank: deal.dealRank, dealLabel: deal.dealLabel });
        }
        if (next >= OFFER_AT && state.outcome[id] === null) {
            state.outcome[id] = "offer";
            events.push({ type: "offer", agentId: id, score: next, reason: entry.reason, dealRank: deal.dealRank, dealLabel: deal.dealLabel });
        }
    }
    return events;
}
