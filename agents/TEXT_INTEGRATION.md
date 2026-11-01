# Text integration with the current frontend

Contributor: **Arjun Behl**
Date: November 1, 2026
Worktree: `LarpHacks/investor-verdict-text`
Branch: `feat/agents/text-integration`
Frontend baseline: `375ea41` (`origin/main`, images and text pitch UI).

## What is connected

The existing frontend already posts `{ pitch, panelists, scores }` to `${VITE_API_URL}/evaluate`. The backend now implements that interface with four authenticated ElevenLabs text conversations. Every response returns `scores` in the requested panelist order, plus `responses` containing each investor's reply, reason, role, and status.

## Dynamic turn-taking and intelligence

The user's latest requirement replaces fixed-order speaking: an investor can request the floor, another investor can take the next turn, and investors with nothing useful to add stay silent. `PANEL` defines identity and response-array mapping only, not a speaking schedule.

For each founder message:

1. All active investors privately assess the message in text-only sessions and submit `{ wants_turn, priority, reason }`. They can update their confidence even when choosing silence. These assessments run concurrently and are never returned as dialogue.
2. The backend chooses one willing investor with the highest priority. A 10-point penalty for the previous speaker gives another investor a chance when priorities are close, but a much more relevant contribution can win consecutive turns. Exact ties use a random tie-break, not panel order. Priority is the model's relevance/urgency judgment, separate from investment confidence.
3. Only the winner receives the `speak` grant. The backend waits for its final `agent_response_complete` event. Intermediate acknowledgements are not final dialogue. The same message cannot change that investor's score a second time during speech.
4. All other investors are silent. If everyone passes, `speaker` is null and every reply is empty. At most one investor replies per founder submission; the next founder message opens fresh bids, so there is no compulsory round of four speeches.

The backend shares the last founder/speaker exchange with all investors on the next assessment, alongside their own ongoing history, so they can follow the discussion and avoid repeating each other. Investors already at 0 or 100 stop bidding; their old replies are not replayed. A newly terminal investor can bid for its final verdict, but a non-winning terminal investor does not get a forced extra speaking turn. The researcher's startup greeting is consumed internally before evaluation. Invalid bids fail the request and close its sessions, without guessing a speaker or automatically starting a paid retry.

Verified against all four live ElevenLabs agent configurations on November 1, 2026: `conversation_config.agent.prompt.llm` is **`deepseek-v41-flash`** for every investor. No custom LLM endpoint is configured. The role prompts now include the conditional protocol from `agents/prompts/turn-taking.md`, synchronized to all four remote agents. The model judges willingness, priority, replies, and proposed confidence; the backend grants exclusive speaking rights and validates scores. The model was not changed. Legacy voice behavior without protocol packets is unchanged; this implementation covers the backend-managed text panel.

No files under `frontend/` were edited. The development launcher supplies `VITE_API_URL=/api` and loads a proxy overlay from `agents/server/vite.integration.mjs`. That overlay preserves the frontend's existing asset settings. The root build script also supplies the API URL without changing frontend files.

The original `LarpHacks/investor-verdict` checkout, including all its uncommitted work, was preserved. This worktree starts from the latest main, merges the agents branch, and carries over the previously authorized backend/key setup. Its ignored `.env` links to the original local credential file; the key was not copied into code or Git.

## Current tile mapping

| Frontend title | Actual investor | Credential variable |
|---|---|---|
| The CTO | Technical Expert | `ELEVENLABS_AGENT_ID_TECH_BRO` |
| The VP | Market Signals Researcher | `ELEVENLABS_AGENT_ID_CTO` |
| The Interrogator | Interrogator | `ELEVENLABS_AGENT_ID_INTERROGATOR` |
| The Sympathizer | Sympathizer | `ELEVENLABS_AGENT_ID_SYMPATHIZER` |

The old credential names are kept for compatibility. The mapping follows the current frontend's portraits, not the older internal `cto` alias.

## Run

From this worktree:

```sh
npm install
npm --prefix frontend/confidence-panel ci
npm run dev
```

Open **http://127.0.0.1:5173**, click Get started, type a pitch, and Send. No microphone is needed. These requests use the ElevenLabs account and consume text-conversation credits.

The API runs at 127.0.0.1:8787. Vite proxies `/api` to it. The browser receives scores and replies, not the API key or signed connection URLs for the text adapter. The API obtains signed URLs and runs the four text-only sessions server-side using the installed SDK.

## API contract

`POST /api/evaluate` (also available as `/evaluate` directly on the backend):

```json
{
  "pitch": "We are building reporting software for repair shops...",
  "panelists": ["The CTO", "The VP", "The Interrogator", "The Sympathizer"],
  "scores": [62, 41, 78, 55]
}
```

Example response shape:

```json
{
  "scores": [55, 55, 55, 60],
  "responses": [
    {
      "panelist": "The CTO",
      "role": "technical_expert",
      "confidence": 55,
      "reason": "Concrete customer evidence.",
      "reply": "Which customers have paid?",
      "spoke": true,
      "wantsTurn": true,
      "status": "concerned"
    }
  ],
  "speaker": "technical_expert",
  "selectionReason": "A specific technical follow-up is needed.",
  "turn": 1,
  "source": "elevenlabs",
  "initialScore": 50
}
```

The actual `responses` array has four entries in frontend order. Only the winner has `spoke: true` and a nonempty `reply`; non-winners have an empty reply, even if they bid. `speaker` and `selectionReason` are null when nobody speaks. Private bid text is never displayed as dialogue. Input is limited to 4,000 characters, four known unique panelists, and four finite scores. Submitted scores are validated for compatibility but do not override authoritative server scores.

An HttpOnly, SameSite=Strict cookie associates follow-up requests with the same four agent conversations and score controller. Scores start at 50, can move up or down by at most 20 per substantive turn, and freeze at 0 or 100. Each investor reports scores through `report_investor_interest`. Intermediate tool acknowledgements are not treated as final answers; the adapter waits for `agent_response_complete`, now enabled on all four remote agents.

Sessions close after two idle minutes, on explicit `POST /api/reset`, on an evaluation error, or on server shutdown. A subsequent request starts a new pitch at 50. Concurrent evaluation in the same session is rejected. The service limits simultaneous pitch sessions and does not automatically retry paid conversations. An assessment or selected-speaker failure returns an error and closes that pitch's sessions.

## Frontend work intentionally left for its owner

1. Display only replies with `responses[].spoke === true`, and use `speaker` to identify that investor. Respect `speaker: null` as silence. Confidence reasons can be shown separately, but must not appear as spoken dialogue. The current frontend consumes only `scores`, so the backend's conversational replies and brief feedback are not yet visible in chat.
2. Change the four initial display values to 50. Until then, the existing 62/41/78/55 seeds remain visible before the first real result, and the first displayed deltas compare against those seeds.
3. Call `/api/reset` from Reset/New pitch/Leave as appropriate. The current Reset and Leave buttons do not notify the backend; server sessions expire after two idle minutes. A local Reset by itself does not reset investor memory.
4. Decide how Freeze scores should interact with evaluation. Currently the UI still sends a request while frozen and discards the returned values, while the backend's conversation and scores advance.
5. Add terminal-state and timeout feedback. Backend statuses and errors are available, but the UI currently shows only numeric score changes or its generic failure message.

No voice or microphone path was exercised. No frontend layout, styling, labels, controls, seed values, or source files were changed. Public deployment still requires user authentication before exposing paid API operations; this server binds only to loopback.

## Verification

- `git diff --exit-code origin/main -- frontend` passes, confirming the entire frontend matches the pulled baseline.
- 20 automated tests pass, including relevance selection, consecutive-speaker penalty, random tie-breaking, all-pass silence, shared context, exclusive speaker grants, terminal silence, invalid bids, score gating, error cleanup, persistent sessions, and API credential handling.
- A live three-message backend test with the updated remote prompts selected the Technical Expert for an architecture question, then the Market Signals Researcher for demand validation, then nobody when the founder requested quiet. Non-speakers returned empty replies. During the quiet message, all four passed and confidence stayed unchanged at 50/55/55/55. All test sessions were closed afterward.
- The current frontend builds successfully with the API URL supplied externally.
- Before dynamic turn selection was added, a real synthetic text pitch reached all four ElevenLabs agents and returned 55, 55, 55, and 60 in frontend order.
- The unchanged frontend's text form was exercised in Chrome and visibly updated all four score tiles from the backend response. No microphone permission or audio generation was used.
- In that earlier browser verification, a second browser turn preserved the conversation and returned 55, 55, 55, and 65. The visible result is saved in `agents/text-integration-preview.jpg`.

The integration is prepared on `feat/agents/text-integration` for review and frontend handoff, without changing frontend files or merging into main. See `agents/FRONTEND_HANDOFF.md` for the frontend developer's task. The earlier original-checkout handoff describes that checkout, not this newer frontend-compatible adapter.
