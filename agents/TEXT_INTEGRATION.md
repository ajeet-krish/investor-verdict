# Text and voice panel integration

Contributor: Arjun Behl
Date: November 1, 2026
Worktree: `LarpHacks/investor-verdict-text`
Branch: `test/investor-integration`

The text baseline was merged through PR #3. This local test branch extends it with live transcription, sequential speech, and at most two investor replies per founder message. The latest policy, tests and provider setup are in [TWO_INVESTOR_ROUNDS.md](../docs/TWO_INVESTOR_ROUNDS.md). The earlier completion report is [SETUP_HANDOFF.md](../docs/SETUP_HANDOFF.md); its single-speaker and text-only statements are historical.

## Conversation flow

1. The founder submits one complete message, by typing or microphone transcription. It may answer both previous investors in any order.
2. Four persistent, text-only ElevenLabs sessions privately assess the message and bid for a turn. Each receives its own authoritative pending concern and the previous public exchange. Terminal investors do not assess further.
3. The backend validates every structured assessment, then applies one bounded score change per investor. It enforces at least -5 for a partially resolved concern and at least -10 for an unanswered concern. Deferred conversation-control messages produce no change. It clears concerns only on resolution or a terminal verdict.
4. At most two willing investors receive exclusive sequential speech grants, selected by priority, a 10-point previous-speaker penalty and random tie-breaking. There is no fixed rotation. Passers and volunteers outside the cap remain silent. The same investor cannot speak twice in a round.
5. Each public reply contains at most one question or concern. The backend records only a concern copied verbatim from the public reply. An unresolved older concern cannot be silently replaced. The next founder message is its next opportunity for resolution.
6. The frontend plays those replies in `speakingOrder` through one audio element, then returns the floor to the founder. The microphone stays muted throughout evaluation and playback. Investors may bid again on the next founder message.

Protocol instructions are in `agents/prompts/two-investor-rounds.md`. The remote models remain `deepseek-v41-flash`. The LLM interprets answers and proposes deltas; `round-policy.mjs` validates the structured result and enforces deductions. In v2, client score-tool calls are rejected to prevent double scoring. The existing interest controller still validates identity, monotonic score turns, integer scores and the 20-point maximum change.

## Running and contract

Use root `npm run dev` with the ignored `.env`. Open http://127.0.0.1:5173. The root launcher proxies `/api` to 127.0.0.1:8787. The root build also supplies the API URL. The separate Render server is not deployed or changed by this experiment.

`POST /api/evaluate` accepts `{ pitch, panelists, scores }`. Pitch is 1-4,000 characters, all four known panelists must be supplied once, and supplied scores must be four finite values from 0 to 100. Client scores never override the server. The HttpOnly `verdict_session` cookie retains memory. See [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) for the full response type and tile mapping.

The response has four tile-ordered `responses` and `scores`, plus zero to two unique roles in `speakingOrder`. A response includes `spoke`, public `reply`, confidence/reason, `answerStatus` and `pendingConcern`. Silent replies are empty, including bids that did not receive a slot. The legacy `speaker` and `selectionReason` describe only the first speaker. `maxSpeakers` is 2. Private assessment JSON is never spoken.

`GET /api/reply-audio?turn=N&role=ROLE` authorizes the requested contributor in the latest completed round, then streams their configured voice. `POST /api/reset` closes all four sessions, clears concerns and returns scores of 50. Scores 0 and 100 are terminal. Sessions expire after two idle minutes. Reset/new session starts without pending questions.

Concurrent evaluations with the same cookie return 409. Clients should submit batches sequentially and preserve the cookie. Assessment, speech-format or provider failures close the session without an automatic paid retry. No extra speech is generated without a new founder message.

## Testing and status

`npm test` covers rules, HTTP batches, overlapping requests, score isolation and audio behavior. `npm run test:panel` runs a readable free multi-message rehearsal. `npm run test:panel:live` uses actual ElevenLabs agents and credits; add `--audio` to validate streamed MP3 output without a browser. See the testing document for custom batch files and recorded evidence.

The original `LarpHacks/investor-verdict` checkout and its uncommitted work remain separate. The ignored `.env` is still a symlink to the existing credential file. No key is included in Git. Remote test branch IDs are non-secret configuration; shared main prompts and traffic allocation remain unchanged.
