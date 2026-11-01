export const LEAVE_AT = 0;
export const OFFER_AT = 100;
export const DELTA_MIN = 5;
export const DELTA_MAX = 15;

export const AGENT_ORDER = ["cto", "tech_bro", "interrogator", "sympathizer"];

export const START_SCORES = {
    cto: 50,
    tech_bro: 50,
    interrogator: 50,
    sympathizer: 50,
};

export const PERSONAS = {
    cto: {
        id: "cto",
        displayName: "Market Signals Researcher",
        archetype: "Market and Finance",
        voiceIntent: "Calm, commercial, direct. Probes TAM, pricing, and paid traction.",
        judgingCriteria: {
            up: [
                "Names TAM with wedge and customer math",
                "States who pays plus pricing with numbers",
                "Shows revenue or paid traction",
            ],
            down: [
                "Uses vague claims with no numbers",
                "Hides behind tech jargon with no finance",
                "Leans on hype with no business model",
            ],
        },
        upSensitivity: 1.0,
        downSensitivity: 1.0,
        upThreshold: 2,
        dealProfile: {
            rank: 2,
            label: "Solid Terms",
        },
    },
    tech_bro: {
        id: "tech_bro",
        displayName: "Technical Expert",
        archetype: "Skeptic VC",
        voiceIntent: "Fast, playful, blunt. Loves novel builds, scale talk, and tradeoffs.",
        judgingCriteria: {
            up: [
                "Explains architecture and what is novel",
                "Names scale plan and failure points",
                "States tradeoffs with clear reasons",
            ],
            down: [
                "Offers finance talk with no build detail",
                "Claims magic with no mechanism",
                "Dodges how it works",
            ],
        },
        upSensitivity: 1.15,
        downSensitivity: 1.0,
        upThreshold: 2,
        dealProfile: {
            rank: 3,
            label: "Creative Bet",
        },
    },
    interrogator: {
        id: "interrogator",
        displayName: "Interrogator",
        archetype: "Veteran",
        voiceIntent: "Mean, dry, blunt. Old school grilling, short sentences, cash only.",
        judgingCriteria: {
            up: [
                "States profit per unit with numbers",
                "Names price and margin clearly",
                "Shows cash payback in short answers",
            ],
            down: [
                "Gives vague claims with no numbers",
                "Hides behind tech with no payback",
                "Rambles long with no profit logic",
            ],
        },
        upSensitivity: 0.55,
        downSensitivity: 1.35,
        upThreshold: 3,
        dealProfile: {
            rank: 1,
            label: "Best Deal",
        },
    },
    sympathizer: {
        id: "sympathizer",
        displayName: "Sympathizer",
        archetype: "Hype Angel",
        voiceIntent: "Warm, kind, upbeat. Listens fully, celebrates users and mission.",
        judgingCriteria: {
            up: [
                "Tells founder story with heart",
                "Shares a moment of user love",
                "Shows mission and momentum",
            ],
            down: [
                "Sounds flat or cold",
                "Hides behind jargon",
                "Shows no spark about users",
            ],
        },
        upSensitivity: 1.25,
        downSensitivity: 0.55,
        upThreshold: 1,
        dealProfile: {
            rank: 4,
            label: "Smallest Warm Check",
        },
    },
};
