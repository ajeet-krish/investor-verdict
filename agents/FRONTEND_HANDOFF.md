# Frontend integration handoff

From: Arjun Behl
To: frontend developer and their coding agent
Date: November 1, 2026
Delivery: user-authorized merge from `test/investor-integration` to `main`, November 1, 2026. Root local app verified; separate Render deployment not integrated.

## Coding-agent collaboration

See [CODING_AGENT_PIPELINE.md](../docs/CODING_AGENT_PIPELINE.md). The app now owns the bridge approval and polls for suggestions, then uses the existing evaluation and audio flow. Human typing or starting voice pauses automatic agent control. The backend ties suggestions to the owner cookie and conversation revision. Keep these guards when redesigning the UI.

## Latest pull and visible scores

On November 1, fetched `origin/Working_MVP` (case-sensitive branch name) at `c12082c` and integrated its frontend changes into `test/investor-integration`. The wider two-column panel and coaching sidebar now use the existing real investor, voice and coding-agent pipeline. Earlier, `origin/main` at `00130b0` was merged for documentation changes. The original dirty `investor-verdict` checkout was left untouched.

Only the three frontend files were imported from `Working_MVP`, without importing that commit into the branch ancestry: its tracked environment examples expose an ElevenLabs credential. Those changes were excluded; the exposed key still needs revocation/replacement by its owner. Never copy that branch's environment examples into a real environment.

The sidebar cycles preset delivery tips every ten seconds and supports Next tip and Tips visibility controls; these are static coaching prompts, not an AI analysis of the pitch. The incoming hidden practice-choice markup remains inactive because there is no hiring-panel backend. The investor start flow remains active. The tiles stack on narrow screens so confidence badges remain readable.

The available frontend now shows a persistent **score out of 100** on every investor tile, with the latest turn's positive, negative or unchanged delta. These are the authoritative `/api/evaluate` values for text, voice and coding-agent submissions. Scores stay visible when photos are hidden; initial/reset state is 50 with no stale delta. Each badge is an accessible meter, and terminal labels remain Passed/Simulated offer.

Validation: TypeScript/build, all 50 tests, `npm run test:panel` and `npm run test:bridge` pass. Browser verification showed the integrated layout, Next tip and Tips toggle, and all four scores at 50/100 with and without portraits. The app is left open for the user's live test at http://127.0.0.1:5173. No paid investor call was made for this frontend integration. Screenshot: `agents/working-mvp-integration.png`.

## Current behavior

The text baseline was merged through PR #3, closing issue #4. This test branch adds live microphone transcription, streamed investor voices, and multiple voluntary replies per founder message. See [REALTIME_AUDIO_TEST.md](../docs/REALTIME_AUDIO_TEST.md) for setup and validation. The user authorized the main merge; production deployment remains separate work.

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

## Live app CLI verification, November 1

The user approved the coding-agent connection in their open app. The CLI submitted two explicitly fictional founder messages into that same session and read real ElevenLabs results without computer use. Round 1 selected CTO then VP, with scores 55/55/50/50. Round 2 answered the CTO's question but explicitly left the VP's demand question unanswered: scores became 65/45/50/55, CTO assessment resolved, VP assessment unanswered. The VP spoke before the CTO in round 2; Interrogator and Sympathizer stayed silent in both rounds. The silent Sympathizer independently raised confidence by 5 for candor in round 2.

The second suggestion was queued while the app reported playback not ready and subsequently completed as turn 2, preserving the conversation. These CLI results verify the live submission/result pipeline and per-investor scoring; they do not independently prove device audio output or microphone capture. Evidence: [live-app-cli.json](../docs/test-results/live-app-cli.json). Connection credentials remain in the ignored private local config and are excluded from this evidence.

## Short, simple investor replies

All four isolated ElevenLabs test branches now use the simple conversation style in `agents/prompts/two-investor-rounds.md`. Prefer everyday words, one small question and an optional tiny reaction, usually 10-20 words and under roughly 10 seconds per investor. This is a soft delivery target, not a word/token rejection rule or an audio cutoff. Investors can acknowledge or pass instead of continually adding questions. Confidence assessment, the two-speaker cap and sequential audio are unchanged. These are provider prompt changes; existing provider conversations take them on their next fresh session. No frontend changes or server restart are required.

Live CLI verification started a fresh provider session and produced two brief replies: CTO 15 words and Interrogator 14 words. No computer use was needed. Audio duration was not measured; the under-10-second goal remains approximate. Evidence: [short-investor-replies.json](../docs/test-results/short-investor-replies.json).

## Conversation-aware reply coach

Implemented on `feat/live-reply-coach` after the main integration release. The right sidebar now replaces rotating tips with a short conversation recap, a suggested next reply, editable coach notes and a transcript. Committed founder text/voice and the investors' actual generated replies populate the transcript; partial microphone text is shown separately and is never sent to the coach before submission. Investor text is already the source for their speech, so it is not transcribed a second time.

After each completed round, the app requests a suggestion from `POST /api/coach`. The founder can turn automatic suggestions off, add facts or a request under Help the coach, and click Update suggestion. Add to chat appends the editable draft to the input and pauses coding-agent control; it never sends automatically. Typed notes/draft edits also pause coding-agent control. Late results cannot overwrite an edited draft or survive a new founder turn/reset.

The server uses OpenAI Responses with a strict JSON schema and `store: false`, default model `gpt-4o-mini` (override `OPENAI_COACH_MODEL`). It accepts `OPENAI_API_KEY`, the user's existing `openai_key`, or `OPENAI_KEY`; only the server reads them. Request data consists of the latest six completed server-owned conversation rounds, pending public questions, and the founder's coach note. No raw audio, private scoring reasons, app connection tokens or provider keys are included. Suggestions use only supplied founder facts and should admit missing evidence, not invent metrics. Review suggestions before sending.

The route requires the same browser room cookie and current revision, rejects cross-origin/stale requests, caches repeated identical requests, bounds paid refinements, cancels on reset/disconnect and sanitizes provider errors. Coaching errors do not block investor text or voice. No automatic retries of paid generations. The private local connection was invalidated by the server restart required to load the new environment. Start a new call; reconnect the coding-agent bridge only if needed for CLI control.

Validation: 60 automated tests pass, production build passes, free coach/bridge HTTP smoke checks pass. Two actual OpenAI calls used the recorded fictional practice transcript: the first exposed a speculative draft, so instructions were tightened; the second produced a brief acknowledgement of unknown measurements and customer motivation, without inventing evidence. Identical repeat requests returned the cached result. No browser/computer control was used for this feature; visual layout and microphone device behavior were not rechecked.

Commands: `npm run test:coach` uses an explicit offline fixture; `npm run test:coach:live` uses the real OpenAI key and consumes API credits. [Structured output API reference](https://developers.openai.com/api/docs/guides/structured-outputs).
