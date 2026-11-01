# Agents

Owner: ElevenLabs agents member (requester). Others please do not edit files here.

What goes here:
* ElevenLabs agent prompts, voices, personalities
* Realtime connection handling and score events
* Env based config using public agent IDs plus server only key for signed URLs

Contract: expose simple score callbacks for frontend, keep keys in local `.env` only.

## Setup

* Copy env: `cp .env.example .env` then fill 4 agent IDs in `.env`
* Dashboard steps: open the frontend, pick mock or live mode, grant mic for live, talk and watch scores move
* Prompts live in `prompts/` (one file per persona, paste into ElevenLabs dashboard)
* Mock mode needs no key. Live mode uses public agent IDs in the browser, no key in client code. Signed URL support is optional for private agents.
* Public agents note: live browser sessions use ID only auth. Never place `ELEVENLABS_API_KEY` in frontend code. Use the key on the server only to mint signed URLs when needed.

## Live voice dependency

Live voice uses dynamic import of `@elevenlabs/client` so mock bundles never load it. There is no root package.json in this repo yet, so the frontend app must install the pinned client before using live mode. From the frontend folder run `npm i @elevenlabs/client@0.3.1`. Keep this version in sync with `agents/package-note.md`. Mock mode needs no install and no key. Live mode uses public agent IDs in the browser, no key in client code.

Files:
* `config.js`: personas plus thresholds
* `event-emitter.js`: tiny pub sub
* `confidence-engine.js`: pure scoring, Node testable
* `mock-client.js`: deterministic rehearsal voices
* `elevenlabs-client.js`: 4 live sessions, one mic, single speaker arbiter
* `index.js`: public `createInvestorCall` facade

## Contract example

```js
import { createInvestorCall } from "./index.js";

const call = createInvestorCall({
    mode: "auto",
    agentIds: {
        cto: "agent_cto_placeholder",
        tech_bro: "agent_tech_bro_placeholder",
        interrogator: "agent_interrogator_placeholder",
        sympathizer: "agent_sympathizer_placeholder",
    },
    startScores: { cto: 50, tech_bro: 50, interrogator: 50, sympathizer: 50 },
});

call.onScoreUpdate((evt) => {
    console.log("scores", evt.scores);
});
call.onTranscript((evt) => {
    console.log(evt.speaker, evt.text);
});
call.onAgentSpeaking((evt) => {
    console.log(evt.agentId, evt.speaking);
});
call.onLeave((evt) => {
    console.log("left", evt.agentId, evt.dealRank, evt.dealLabel);
});
call.onOffer((evt) => {
    console.log("offer", evt.agentId, evt.dealRank, evt.dealLabel);
});

await call.start();
call.simulateUtterance("We charge 49 per seat, 20 paying customers, CAC 30, LTV 900");
```

## Mock mode for frontend dev without key

Use `mode: "mock"` to rehearse with no network and no key. Timed utterances rotate across CTO, Tech Bro, Interrogator, Sympathizer. Use `simulateUtterance(text)` to feed a founder line through the scorer and trigger a reply. Switch to `mode: "auto"` for live with fallback to mock, or `mode: "live"` to force live only. Live uses dynamic import of `@elevenlabs/client` so mock bundles never load it.

## Live client routing notes

* Single mic stream is shared across all 4 sessions. `resolveMic` caches one `MediaStream` and passes it as `userMediaStream` to each session.
* Transcript dedupe: only the primary session forwards user text. Normalized text that repeats within 2500ms is dropped.
* Speaker arbiter allows max 2 verbal replies per founder turn. Queue dedupes per agent, drops stale entries after 12s, enforces 2000ms cooldown, and prioritizes addressed Title first, then largest delta, then round robin.
* `sendUserText` routes to the `setActiveAgent` hint session when that hint is set and connected. If the hinted session is missing or cannot send, it falls back to the first connected session that accepts `sendUserMessage` or `sendMessage`.
* Queued speakers stay queued until `flushQueue` grants the floor. An interim `speaking false` for a queued agent does not drop its queue entry. Only the active speaker triggers a flush on stop speaking, and the queue entry is removed when the floor is granted.
* Audio gating tries `setVolume` first, then falls through to `mute` plus `unmute`, then `setMuted`, then `setAudioEnabled`, then the `volume` property. A throw in one method falls through to the next method for the same session. Order matches pinned client `@elevenlabs/client@0.3.1` noted in `package-note.md`.
* Flush timers are tracked in `flushTimerIds` and cleared in `stop`, so no delayed flush fires after stop. Retry path calls `endPartialSessions` for cleanup. `stop` emits `speaking false` for the active speaker.
* Scoring emits a single `score` event per founder utterance. `leave` fires once at 0 and `offer` fires once at 100, each with `dealRank` and `dealLabel`. Terminal agents freeze and ignore later turns.
