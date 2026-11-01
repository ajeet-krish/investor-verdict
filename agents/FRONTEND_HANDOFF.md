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

Zero to two investors can give ordinary replies to the same founder message. Every newly-zero investor gets an additional priority farewell, even if all four leave together. Only one speaks at a time. Every active investor privately decides whether to contribute, and may sit out. After at most two replies the founder answers, possibly addressing both in one message. Each investor independently checks its pending question; partial or unanswered concerns lower its confidence. See [TWO_INVESTOR_ROUNDS.md](../docs/TWO_INVESTOR_ROUNDS.md). The server selects the next willing investor by relevance priority, with a previous-speaker penalty and random tie-breaking. There is no fixed rotation or requirement for all four to talk. Each contributes at most once per message. Confidence starts at 50 and can change even when an investor stays silent. All four agents use `deepseek-v41-flash` through ElevenLabs.

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
    assessmentStatus: "valid" | "repaired" | "unavailable" | null;
    pendingConcern: { text: string; askedRound: number } | null;
    status: "out" | "offered" | "nearly-out" | "concerned" | "engaged";
  }>;
  speakingOrder: InvestorRole[]; // Farewells first, then at most two ordinary contributors.
  departureOrder: InvestorRole[]; // Newly-zero roles, a prefix of speakingOrder.
  departedRoles: InvestorRole[]; // All zero-score roles, including earlier departures.
  speaker: InvestorRole | null; // Legacy alias for the FIRST contributor only.
  selectionReason: string | null; // First contributor's metadata, not dialogue.
  turn: number;
  source: "elevenlabs";
  initialScore: 50;
  maxSpeakers: 2;
}
```

The response array always contains four entries in the requested tile order, which is not the speaking order. `speakingOrder` must match exactly the roles with `spoke: true`, without duplicates, with every newly-zero farewell first and at most two additional ordinary replies. Empty order means silence. The server maintains scores and conversation history using the HttpOnly `verdict_session` cookie. A new or expired session starts at 50. A returned `turn: 1` after earlier turns means the display baseline must reset.

| Role | Tile |
| --- | --- |
| `technical_expert` | The CTO |
| `market_signals_researcher` | The VP |
| `interrogator` | The Interrogator |
| `sympathizer` | The Sympathizer |

## Implemented frontend flow

1. Validate scores, role identities, replies, and `speakingOrder`. Update all four scores from the server.
2. Iterate `speakingOrder`. Append each corresponding reply with `textContent`, highlight that investor, and await its audio completion before moving on. If the role is in `departureOrder`, remove its tile after playback or Skip and resize the grid. Never render private bids or score explanations as dialogue.
3. Request `GET /api/reply-audio?turn=N&role=ROLE` with the same cookie. The server authorizes only contributors in the latest completed round and chooses their voice. Arbitrary text and voice IDs are not accepted.
4. Pause the live microphone during the entire evaluation and playback sequence. Resume only after the full round if any investor remains. A single audio element prevents overlapping voices.
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

## Inputs available from the start

The coach now shows three editable opening choices immediately, before any pitch or API request: introduce the idea, explain the problem, or ask for guidance. These initial templates use placeholders rather than fabricated business facts. Reset restores the choices. `/api/reset` returns the current `bridgeRevision`, allowing the founder to add a coach note and request tailored opening options before the first investor round.

OpenAI recommendations now return `suggestions: [{label, reply}, ...]` with exactly three varied inputs, alongside summary/focus/revision. After a panel round, choices offer distinct approaches rather than a single draft. Choosing an option fills the editable draft; Add to chat remains a separate action and never auto-submits. Existing cancellation, human takeover, caching and credential rules remain unchanged.

Validation: 64 tests and the build pass, including immediate opening choices without network access, reset behavior, choosing alternatives, empty-history coach requests and malformed option rejection. `npm run test:coach:live -- --opening` validates tailored opening suggestions against OpenAI without computer use.

## Current sidebar: hardcoded and read-only

The latest user instruction supersedes the interactive reply-coach sections above. The right side now shows three fixed example inputs (introduce the idea, explain the problem, ask for guidance). Its markup lives directly in `frontend/confidence-panel/index.html`. There are no right-side text fields, option buttons, notes, automatic generation controls or transcript. Only the main chat/microphone accepts founder input; the conversation remains in the main chat.

The frontend no longer imports or invokes `reply-coach.ts`, so this sidebar does not request OpenAI recommendations. Earlier coach modules, endpoint and explicit test commands remain available as a prototype, but are not part of the active sidebar flow. No key or environment changes were needed.

## Current sidebar: three selectable product pitches

The latest refinement replaces the three generic read-only inputs with hardcoded fictional pitches for PantryPal (meal planning), BorrowBox (neighbourhood tool rental), and StudySprint (student study planning). Each card fills the main chat input for editing; the user must press Send. There is still no separate sidebar chat or text field. Choosing a card opens the main chat if hidden, pauses coding-agent control and stops microphone capture. Cards are disabled while the panel is busy. This feature makes no OpenAI requests. TypeScript and production build pass.

## Current flow: starter pitch, transcript, Terra suggestions

The sidebar starts with the three hardcoded product pitches. Selecting one only fills the main composer. Once the founder sends text, commits microphone speech or submits an approved coding-agent draft, the actual founder message and selected investor responses are retained in the server-owned room transcript. The main chat is labelled Conversation transcript. History is in memory for the current call (up to 10 completed rounds); reset, provider-session expiry or a server restart clears it. This is not permanent transcript storage.

After each completed evaluation, `pitch-suggestions.ts` requests three new cards from `/api/coach` using the returned room revision. The server supplies the latest six completed transcript rounds and pending public questions to OpenAI. It does not use unsent composer text or trust a client-supplied transcript. The follow-ups replace the starter cards. They can be prepared during playback but cannot be selected while investors are speaking; clicking one afterward fills the main chat and the user presses Send. The sidebar remains cards and status text only, with no separate chat, textarea or transcript.

Confirmed the exact model `gpt-6.1-terra` via the official model documentation and the account's `GET /v1/models/gpt-6.1-terra` response (HTTP 200). The Responses request explicitly uses `reasoning: {effort: "medium"}`. Updated defaults and the private local environment to `OPENAI_COACH_MODEL=gpt-6.1-terra` and `OPENAI_COACH_REASONING_EFFORT=medium`. No fallback model is silently substituted. The output budget is 4096 tokens, allowing reasoning plus the structured result, with a 45-second server timeout.

A real OpenAI test used the recorded fictional pitch and questions and returned three grounded alternatives: a direct answer, a practical next step and a clarification. It admitted missing reliability measurements, demand evidence and budget ownership rather than inventing answers. The repeated request returned the cached result. Existing investor voices, intelligence and confidence scoring are unchanged; Terra is the founder-suggestion model only.

Validation: production build and 67 tests pass, including exact model/reasoning settings, use of server-owned transcript, cards that never auto-submit, playback locking, and cancellation of stale/reset results. `npm run test:coach:live` verifies the live transcript-to-Terra HTTP path without computer use. [Official GPT-6.1 Terra documentation](https://developers.openai.com/api/docs/models/gpt-6.1-terra).

## Fixed fictional facts, no placeholder replies

`agents/server/practice-cases.mjs` now supplies a stable fact sheet for each built-in product, including named fictional interviewees, payment feedback, abandoned alternatives, pilot counts, revenue, technology, reliability, costs, team, funding ask, next experiment and known unknowns. The sidebar explicitly identifies these as fictional practice cases. The initial pitches include concrete numbers. This is authored scenario data, not real business traction or real customer information.

PantryPal: 12 parent interviews, 8 willing to pay $5/month for plans/shopping lists, 6 abandoned other planners, 20 pilot households, 14 week-two returnees and 5 actual payers ($25/month). Maya Chen and Jordan Reed are named fictional interviewees with specific feedback; Alex Morgan prefers the free option. BorrowBox: 15 interviews, 30 pilot residents, 12 rentals averaging $8, 20% fee and $19.20 platform revenue. StudySprint: 18 interviews, 40 pilot students, 26 week-two returnees and 8 payers at $4 ($32/month). See the source for all fixed details and limits.

The bridge records `practiceCaseId` from a completed founder pitch, keeps it across the 10-round history limit, changes it for a newly named product and clears it on Reset. Terra receives the matching fixed fact sheet alongside the transcript. These facts can fill answers before the founder has mentioned them; earlier placeholder text is not evidence. Unmeasured details get an honest, complete explanation instead of new invented numbers. Custom products receive no unrelated case facts. Suggestions containing square-bracket placeholders, TODO or TBD are rejected before reaching the composer.

Reproduction: `npm run test:coach:live -- --case pantrypal` supplies the same VP and Sympathizer questions reported by the user. The live Terra response produced three complete alternatives with the fixed interview counts, $5 price, six abandoned planners, and named interviewees. No blanks were returned. Repeat requests used the cache. Automated coverage includes scenario isolation, pinning across history truncation, switching/reset and placeholder rejection.


## Invalid-assessment recovery and larger confidence changes

Owner: Arjun Behl. Branch: `feat/live-reply-coach`. The reported failure came from a bid-only provider response missing the assessment fields. The backend now repeats the full response contract, requests at most one correction for that investor on the same turn, and then lets it sit out if still invalid. Other investors continue. No score or pending concern is lost and no extra deduction is applied. `assessmentStatus` exposes valid/repaired/unavailable results; unavailable has `answerStatus: null`, unchanged confidence and an explanatory private `reason`. No frontend payload change is required to keep rendering scores and speech. This limited correction can consume one extra ElevenLabs response per affected investor; connection failures/timeouts and speech are not retried.

Meaningful score movements now have magnitude 10-20. Prompt targets are +10/+15/+20 for increasingly strong evidence; partial answers lose at least 10 and unanswered concerns at least 15. Neutral/repeated evidence and pauses stay at zero. Endpoint clamping may produce a smaller final movement. All four isolated app branch prompts match the new policy. Start a fresh call after restarting the server to load them.


## Zero-confidence exits and adaptive grid

Owner: Arjun Behl. Branch: `feat/live-reply-coach`. Newly-zero investors now receive mandatory farewell grants before all normal bids, even if they passed or more than two are leaving. Each statement explains its actual score reason and ends without a question. Provider sessions for departed roles close after generation; saved farewell audio remains available. All four scores/responses remain in the API for stable role indexing, while `departureOrder` and `departedRoles` tell the UI who is leaving now versus already gone. `maxSpeakers` continues to be 2 for ordinary replies only.

`src/investor-call.ts` validates the expanded contract, maintains call membership and sequences display/playback/departure. `main.ts` removes each tile after its own audio completes, fails or is skipped, retaining its statement in the transcript. The grid changes through four/three/two/one/zero visible tiles. The empty call retains feedback and offers Try a new pitch; human input, microphone, agent submissions and suggestion generation stop until reset. Reset restores all investors and discards late playback/suggestion callbacks. A fresh provider session also restores the grid.

83 tests cover backend priority, four audio streams, UI removal timing, reset during farewell and stale suggestions. A live six-turn ElevenLabs run confirmed all four hit zero together on turn three, gave final statements with nonempty audio, and stayed silent afterward. See [investor-farewells.json](../docs/test-results/investor-farewells.json). No computer use was needed; actual browser rendering/device playback was not re-certified.


### Founder exits after the final farewell

When the final remaining investor's farewell completes or is skipped, the UI automatically takes the founder out of the call and shows the welcome screen with **Call ended. Start a new pitch**. Microphone capture stops and coding-agent control pauses. The transition runs only after sequential playback finishes and only for the current call, so a reset cannot be overridden by an old completion. The completed transcript remains in memory until the next Start/Reset; Start follows the existing reset path and restores all four investors at 50. A single investor leaving while others remain does not end the founder's call.


### Fixed call area and animated departures

The call stage now retains its height as the participant count changes: 16:9 on desktop and 3:4 on narrow screens. The remaining tiles fill that fixed stage, so two departures cannot collapse the call area into a shorter row. The layout still adapts to the available viewport width.

After farewell playback, the departing tile glows with a scanline, compresses into a thin line, blurs and fades over 620 ms. The next investor waits for this effect before speaking. After the final effect, the founder returns to the welcome screen as before. Reduced-motion users skip the effect. Reset cancels active animations and prevents a delayed completion from hiding a restored investor. No provider/backend changes or paid calls were needed. Seven frontend sequencing/cancellation tests and the production build pass.
