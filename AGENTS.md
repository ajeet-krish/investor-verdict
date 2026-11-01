# investor-verdict

## Starter pitches and transcript-based follow-ups
The right sidebar starts with three hardcoded fictional product pitches (PantryPal, BorrowBox, StudySprint). Their fixed scenario facts live in `agents/server/practice-cases.mjs`: named fictional interviewees, counts, prices, paid pilot results, technical limits, costs and next steps. The server pins the chosen case to the call so it survives transcript truncation; Reset clears it. Use these supplied facts consistently for roleplay, never as claims about real people or businesses. Unknown facts should produce a complete admission and next step, not placeholders.

After a completed investor round, `pitch-suggestions.ts` requests three cards from OpenAI `gpt-6.1-terra` with `reasoning.effort: medium`, based on the sent founder text, actual investor replies and fixed case facts. The older `reply-coach.ts` editor is not used. Selecting a card fills the main chat without sending. There is no separate sidebar chat or editable field. Keep credentials server-side and reject stale or unfinished suggestions. See [the current handoff](agents/FRONTEND_HANDOFF.md).

## Coding agents in the live app
Read [agents/CODING_AGENT_HANDOFF.md](agents/CODING_AGENT_HANDOFF.md) and [docs/CODING_AGENT_PIPELINE.md](docs/CODING_AGENT_PIPELINE.md). The coder approves once in the live app, then a connected coding agent can send founder drafts with `npm run agent:suggest` and read actual investor replies with `agent:wait`. Typing or starting voice pauses automatic agent control. Never impersonate investors, bypass Pause/Disconnect, or commit `.verdict-agent.local.json`. Run `npm run test:bridge` for the free CLI-to-app regression.

## Current integration
The user authorized merging `test/investor-integration` into `main` on November 1, 2026. The current implementation includes the Working_MVP layout, visible confidence scores, real-time founder transcription, sequential investor speech and the coding-agent bridge. Read [agents/FRONTEND_HANDOFF.md](agents/FRONTEND_HANDOFF.md) and [docs/REALTIME_AUDIO_TEST.md](docs/REALTIME_AUDIO_TEST.md). The separate Render deployment has not been integrated or verified for these endpoints.

Investor replies use plain language, usually 10-20 words and one simple question, aiming for under roughly 10 seconds per investor without a hard audio cutoff. These prompts are saved on the isolated ElevenLabs branches in `agents/panel-test-branches.json`; provider main prompts and default traffic remain unchanged.

## Two-investor rounds and testing
Read [docs/TWO_INVESTOR_ROUNDS.md](docs/TWO_INVESTOR_ROUNDS.md). The latest rule is at most two ordinary replies, plus mandatory farewells for EVERY investor newly reaching zero, then the founder answers; each investor evaluates its own pending concern. Incomplete answers deduct at least 10 and unanswered concerns at least 15, once per substantive message. Meaningful gains/losses have a 10-point minimum, bounded to 20 and the 0-100 endpoints; neutral evidence and pauses do not change confidence. Invalid completed assessments receive one correction request for the same turn, then that investor abstains with unchanged score and preserved concern. Other investors continue. Zero-confidence farewells come first, even for pass bids, and never consume ordinary reply slots. Frontend tiles leave only after each farewell finishes or is skipped; the grid resizes and the all-left state stops input until reset. Never reinstate a four-speaker ordinary loop.
Use `npm test` and `npm run test:panel` for free deterministic checks. `npm run test:panel:live` explicitly uses credits and isolated ElevenLabs test branches configured in `agents/panel-test-branches.json`. The runner exercises actual HTTP sessions without computer use. Do not change agent main prompts or default traffic when testing.

## Historical baseline
[docs/SETUP_HANDOFF.md](docs/SETUP_HANDOFF.md) describes the earlier text-only release. Its single-speaker and missing-audio statements are historical. Current behavior: zero to two ordinary replies plus all newly-zero investors' farewells, one voice at a time, with dynamic selection and optional silence. Scores start at 50 and can rise or fall. Earlier fixed-order and start-at-100 instructions are superseded.

## Quick Commands
* Clone: `git clone <repo url>`
* New branch: `git checkout -b feat/frontend/task`
* Commit: `git commit -m "feat: short message"`
* Push: `git push -u origin feat/frontend/task`
* Env setup: `cp .env.example .env`

## Conventions
* Use conventional commits: `feat:`, `fix:`, `docs:`, `style:`, `chore:`
* Use commas, colons, parentheses in prose (no em dashes in any file)
* One feature branch per member, merge via fast review
* Work only inside your folder, ask before touching shared files
* Never commit `.env` or ElevenLabs keys

## Project Map
* `/frontend`: video call UI and score state (frontend owner)
* `/agents`: ElevenLabs agent configs and realtime wiring (agents owner)
* `/visuals`: animations, effects, avatar motion (visuals owner)
* `README.md`: concept, roles, quickstart
* `CONTRIBUTING.md`: hackathon workflow

## Status
<table>
<tr><th>Phase</th><th>Description</th><th>Status</th></tr>
</table>

## Deep Docs
* Architecture: [docs/architecture.md](docs/architecture.md)
* Decisions: [docs/decisions.md](docs/decisions.md)
* Research: [docs/research.md](docs/research.md)
* Reviews: [docs/reviews.md](docs/reviews.md)
* Tests: [docs/tests.md](docs/tests.md)
