# Text integration with the current frontend

Contributor: **Arjun Behl**
Date: November 1, 2026
Worktree: `LarpHacks/investor-verdict-text`
Branch: `test/investor-integration` (extends the text baseline merged in PR #3)
Frontend baseline: `375ea41` (`origin/main`, images and text pitch UI).

## What is connected

The existing frontend already posts `{ pitch, panelists, scores }` to `${VITE_API_URL}/evaluate`. The backend now implements that interface with four authenticated ElevenLabs text conversations. Every response returns `scores` in the requested panelist order, plus `responses` containing each investor's reply, reason, role, and status.

## Dynamic turn-taking and intelligence

The user's latest requirement replaces fixed-order speaking: an investor can request the floor, another investor can take the next turn, and investors with nothing useful to add stay silent. `PANEL` defines identity and response-array mapping only, not a speaking schedule.

For each founder message:

1. All active investors privately assess the message in text-only sessions and submit `{ wants_turn, priority, reason }`. They can update their confidence even when choosing silence. These assessments run concurrently and are never returned as dialogue.
2. The backend chooses one willing investor with the highest priority. A 10-point penalty for the previous speaker gives another investor a chance when priorities are close, but a much more relevant contribution can win consecutive turns. Exact ties use a random tie-break, not panel order. Priority is the model's relevance/urgency judgment, separate from investment confidence.
3. Only the winner receives the `speak` grant. The backend waits for its final `agent_response_complete` event. Intermediate acknowledgements are not final dialogue. The same message cannot change that investor's score a second time during speech.
4. Remove that investor from the remaining bids and repeat selection until no willing investors remain. Each may speak once, and passers remain silent. All-pass rounds have an empty `speakingOrder`. There is no compulsory round of four speeches. Later speakers receive the earlier replies as context; willingness is assessed once per founder message.

The backend shares the full last founder/investors exchange with all investors on the next assessment, alongside their own ongoing history, so they can follow the discussion and avoid repeating each other. Investors already at 0 or 100 stop bidding; their old replies are not replayed. A newly terminal investor can bid for its final verdict, but a terminal investor who passed does not get a forced extra speaking turn. The researcher's startup greeting is consumed internally before evaluation. Invalid bids fail the request and close its sessions, without guessing a speaker or automatically starting a paid retry.

Verified against all four live ElevenLabs agent configurations on November 1, 2026: `conversation_config.agent.prompt.llm` is **`deepseek-v41-flash`** for every investor. No custom LLM endpoint is configured. The role prompts now include the conditional protocol from `agents/prompts/turn-taking.md`, synchronized to all four remote agents. The model judges willingness, priority, replies, and proposed confidence; the backend grants exclusive speaking rights and validates scores. The model was not changed. Legacy voice behavior without protocol packets is unchanged; this implementation covers the backend-managed text panel.

The frontend now consumes the full response, displays replies in `speakingOrder` and highlights only the currently playing investor, and connects Start/Reset/Leave to the session API. The existing layout and portraits are preserved. The development launcher supplies `VITE_API_URL=/api` and loads a proxy overlay from `agents/server/vite.integration.mjs`. That overlay preserves the frontend's existing asset settings. The root build script also supplies the API URL without changing frontend files.

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
  "speakingOrder": ["technical_expert"],
  "speaker": "technical_expert",
  "selectionReason": "A specific technical follow-up is needed.",
  "turn": 1,
  "source": "elevenlabs",
  "initialScore": 50
}
```

The actual `responses` array has four entries in frontend order. Every contributor has `spoke: true` and a nonempty `reply`; passers have an empty reply. `speakingOrder` contains each contributor once in speaking order and is the frontend authority. The legacy `speaker` and `selectionReason` identify the first contributor only. `speaker` and `selectionReason` are null when nobody speaks. Private bid text is never displayed as dialogue. Input is limited to 4,000 characters, four known unique panelists, and four finite scores. Submitted scores are validated for compatibility but do not override authoritative server scores.

An HttpOnly, SameSite=Strict cookie associates follow-up requests with the same four agent conversations and score controller. Scores start at 50, can move up or down by at most 20 per substantive turn, and freeze at 0 or 100. Each investor reports scores through `report_investor_interest`. Intermediate tool acknowledgements are not treated as final answers; the adapter waits for `agent_response_complete`, now enabled on all four remote agents.

Sessions close after two idle minutes, on explicit `POST /api/reset`, on an evaluation error, or on server shutdown. A subsequent request starts a new pitch at 50. Concurrent evaluation in the same session is rejected. The service limits simultaneous pitch sessions and does not automatically retry paid conversations. An assessment or selected-speaker failure returns an error and closes that pitch's sessions.

## Frontend integration

`frontend/confidence-panel/src/main.ts` now validates and consumes the full response, updates all four scores, and renders only `spoke: true` dialogue via `textContent`. The responding tile is highlighted; silence clears highlighting without inventing another message. Confidence starts at 50, with terminal labels for passed and simulated offer.

Start/Reset/Leave call `/api/reset`. Controls are disabled during evaluation/reset, and there is no request queue, so stale work cannot enter a new pitch. Failures preserve text for manual retry. The Freeze control and silent heuristic fallback are removed from the live flow. See `agents/FRONTEND_HANDOFF.md` for the full contract and validation record.

This branch also plays each reply sequentially and pauses the live microphone for the full round. See [REALTIME_AUDIO_TEST.md](../docs/REALTIME_AUDIO_TEST.md) for current tests and controls. Public deployment remains outside this change. The separate Render deployment files from main are preserved, but that server does not yet host these text endpoints. The verified root launcher uses the loopback API and Vite proxy.

## Historical text-baseline verification

These checks predate the multi-speaker audio branch. The current automated suite has 35 passing tests; see the audio test document for the latest browser validation.

- Frontend source changes are limited to `main.ts` and four CSS rules; no HTML layout or portrait changes.
- 20 automated tests pass, including relevance selection, consecutive-speaker penalty, random tie-breaking, all-pass silence, shared context, exclusive speaker grants, terminal silence, invalid bids, score gating, error cleanup, persistent sessions, and API credential handling.
- A live three-message backend test with the updated remote prompts selected the Technical Expert for an architecture question, then the Market Signals Researcher for demand validation, then nobody when the founder requested quiet. Non-speakers returned empty replies. During the quiet message, all four passed and confidence stayed unchanged at 50/55/55/55. All test sessions were closed afterward.
- The current frontend builds successfully with the API URL supplied externally.
- Before dynamic turn selection was added, a real synthetic text pitch reached all four ElevenLabs agents and returned 55, 55, 55, and 60 in frontend order.
- Before reply rendering was connected, the frontend's text form was exercised in Chrome and visibly updated all four score tiles from the backend response. No microphone permission or audio generation was used.
- In that earlier browser verification, a second browser turn preserved the conversation and returned 55, 55, 55, and 65. The visible result is saved in `agents/text-integration-preview.jpg`.

The integration and minimal frontend connection are on `feat/agents/text-integration` for PR #3, addressing issue #4. See `agents/FRONTEND_HANDOFF.md` for the frontend developer's task. The earlier original-checkout handoff describes that checkout, not this newer frontend-compatible adapter.
