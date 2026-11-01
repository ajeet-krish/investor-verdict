# Frontend integration handoff

From: Arjun Behl
To: frontend developer and their coding agent
Date: November 1, 2026
Branch: `test/investor-integration`, local experiment, not merged into main

## Coding-agent collaboration

See [CODING_AGENT_PIPELINE.md](../docs/CODING_AGENT_PIPELINE.md). The app now owns the bridge approval and polls for suggestions, then uses the existing evaluation and audio flow. Human typing or starting voice pauses automatic agent control. The backend ties suggestions to the owner cookie and conversation revision. Keep these guards when redesigning the UI.

## Latest pull and visible scores

On November 1, fetched all remote branches, fast-forward checked `test/investor-integration`, and merged `origin/main` at `00130b0` into this test branch. The incoming main changes were documentation/environment examples only; no newer frontend layout was published in the fetched branches. The original dirty `investor-verdict` checkout was left untouched.

The available frontend now shows a persistent **score out of 100** on every investor tile, with the latest turn's positive, negative or unchanged delta. These are the authoritative `/api/evaluate` values for text, voice and coding-agent submissions. Scores stay visible when photos are hidden; initial/reset state is 50 with no stale delta. Each badge is an accessible meter, and terminal labels remain Passed/Simulated offer.

Validation: TypeScript/build and all 50 tests pass. Browser verification showed all four scores at 50/100, both with and without portraits. The app is left open for the user's live test at http://127.0.0.1:5173. No paid investor call was made for this display change. Screenshot: `agents/confidence-scores-ready.png`.

## Current behavior

The text baseline was merged through PR #3, closing issue #4. This test branch adds live microphone transcription, streamed investor voices, and multiple voluntary replies per founder message. See [REALTIME_AUDIO_TEST.md](../docs/REALTIME_AUDIO_TEST.md) for setup and validation. Do not merge or deploy this experiment without a user request.

Zero to two investors can answer the same founder message. Only one speaks at a time. Every active investor privately decides whether to contribute, and may sit out. After at most two replies the founder answers, possibly addressing both in one message. Each investor independently checks its pending question; partial or unanswered concerns lower its confidence. See [TWO_INVESTOR_ROUNDS.md](../docs/TWO_INVESTOR_ROUNDS.md). The server selects the next willing investor by relevance priority, with a previous-speaker penalty and random tie-breaking. There is no fixed rotation or requirement for all four to talk. Each contributes at most once per message. Confidence starts at 50 and can change even when an investor stays silent. All four agents use `deepseek-v41-flash` through ElevenLabs.

## Run locally

Use Node 22.6 or newer:

```sh
npm ci
npm --prefix frontend/confidence-panel ci
npm run dev
```

Keep the existing ignored `.env`; on a new machine, copy `.env.example` and supply credentials securely. Open http://127.0.0.1:5173. The root launcher proxies `/api` to the loopback API at port 8787. Never put keys in frontend code or `VITE_*` variables. The separate Render server remains outside this integration.

## API contract

Send `POST /api/evaluate` with JSON and same-origin cookies:

```ts
const request = {
  pitch: "The founder's text", // 1 to 4,000 characters.
  panelists: ["The CTO", "The VP", "The Interrogator", "The Sympathizer"],
  scores: [50, 50, 50, 50], // Validated but not authoritative.
};

type InvestorRole = "technical_expert" | "market_signals_researcher" | "interrogator" | "sympathizer";
interface Evaluation {
  scores: number[]; // Four values in request.panelists order.
  responses: Array<{
    panelist: string;
    role: InvestorRole;
    confidence: number;
    reason: string; // Score explanation, not public dialogue.
    reply: string; // Empty for a silent investor.
    spoke: boolean;
    wantsTurn: boolean;
    answerStatus: "none" | "resolved" | "partial" | "unanswered" | "deferred" | null;
    pendingConcern: { text: string; askedRound: number } | null;
    status: "out" | "offered" | "nearly-out" | "concerned" | "engaged";
  }>;
  speakingOrder: InvestorRole[]; // Zero to two unique contributors, authoritative order.
  speaker: InvestorRole | null; // Legacy alias for the FIRST contributor only.
  selectionReason: string | null; // First contributor's metadata, not dialogue.
  turn: number;
  source: "elevenlabs";
  initialScore: 50;
  maxSpeakers: 2;
}
```

The response array always contains four entries in the requested tile order, which is not the speaking order. `speakingOrder` must match exactly the roles with `spoke: true`, without duplicates and with at most two entries. Empty order means silence. The server maintains scores and conversation history using the HttpOnly `verdict_session` cookie. A new or expired session starts at 50. A returned `turn: 1` after earlier turns means the display baseline must reset.

| Role | Tile |
| --- | --- |
| `technical_expert` | The CTO |
| `market_signals_researcher` | The VP |
| `interrogator` | The Interrogator |
| `sympathizer` | The Sympathizer |

## Implemented frontend flow

1. Validate scores, role identities, replies, and `speakingOrder`. Update all four scores from the server.
2. Iterate `speakingOrder`. Append each corresponding reply with `textContent`, highlight that investor, and await its audio completion before moving on. Never render private bids or score explanations as dialogue.
3. Request `GET /api/reply-audio?turn=N&role=ROLE` with the same cookie. The server authorizes only contributors in the latest completed round and chooses their voice. Arbitrary text and voice IDs are not accepted.
4. Pause the live microphone during the entire evaluation and playback sequence. Resume only after the full round. A single audio element prevents overlapping voices.
5. Skip reply stops the current audio and advances to the next contributor. Stop live audio cancels current and remaining automatic playback; text replies remain available. Blocked autoplay exposes the player for manual Play or Skip.
6. Reset and Leave stop the sequence and microphone, call `POST /api/reset`, then clear the transcript and restore scores to 50. A generation counter prevents later replies from an old sequence. Reset/Leave are disabled during evaluation to avoid cookie races, but available during playback.
7. Keep input disabled while evaluating or playing. There is no queued founder submission. Provider errors preserve text for explicit retry; never retry paid requests automatically or silently substitute heuristic scores.

The server assesses scores once per founder message, regardless of how many investors speak. It shares the full prior round with the next assessment and earlier replies with each later speaker. Willingness is decided once, before public replies; this is not continuous debate or speech interruption detection. Each `evaluate` response waits until all selected text replies are complete before audio begins.

## Validation

42 tests and the TypeScript/Vite build pass. Coverage includes multiple sequential speech grants, partial and complete silence, once-per-message scoring, shared history, authorized per-investor audio caches, microphone muting, cancellation, and exclusive playback.

Before the new two-speaker policy, a live browser pitch addressed the Technical Expert and Market Researcher and asked the others to sit out. Both requested contributors answered in sequence, the other two stayed silent, and scores were 55/55/50/50. The final audio finished at 15.86 seconds with no playback error, and input became available again. Screenshot: `agents/multi-investor-audio-preview.png`.

The original single-speaker text baseline and historical checks are documented in [SETUP_HANDOFF.md](../docs/SETUP_HANDOFF.md). The test branch supersedes its at-most-one-reply-per-message policy.
