# investor-verdict

## Coding agents in the live app
Read [agents/CODING_AGENT_HANDOFF.md](agents/CODING_AGENT_HANDOFF.md) and [docs/CODING_AGENT_PIPELINE.md](docs/CODING_AGENT_PIPELINE.md). The coder approves once in the live app, then a connected coding agent can send founder drafts with `npm run agent:suggest` and read actual investor replies with `agent:wait`. Typing or starting voice pauses automatic agent control. Never impersonate investors, bypass Pause/Disconnect, or commit `.verdict-agent.local.json`. Run `npm run test:bridge` for the free CLI-to-app regression.

## Current integration
The user authorized merging `test/investor-integration` into `main` on November 1, 2026. The current implementation includes the Working_MVP layout, visible confidence scores, real-time founder transcription, sequential investor speech and the coding-agent bridge. Read [agents/FRONTEND_HANDOFF.md](agents/FRONTEND_HANDOFF.md) and [docs/REALTIME_AUDIO_TEST.md](docs/REALTIME_AUDIO_TEST.md). The separate Render deployment has not been integrated or verified for these endpoints.

Investor replies use plain language, usually 10-20 words and one simple question, aiming for under roughly 10 seconds per investor without a hard audio cutoff. These prompts are saved on the isolated ElevenLabs branches in `agents/panel-test-branches.json`; provider main prompts and default traffic remain unchanged.

## Two-investor rounds and testing
Read [docs/TWO_INVESTOR_ROUNDS.md](docs/TWO_INVESTOR_ROUNDS.md). The latest rule is at most two replies, then the founder answers; each investor evaluates its own pending concern. Incomplete answers deduct at least 5 and unanswered concerns at least 10, once per substantive message. Pauses do not lower confidence. Never reinstate the four-speaker loop.
Use `npm test` and `npm run test:panel` for free deterministic checks. `npm run test:panel:live` explicitly uses credits and isolated ElevenLabs test branches configured in `agents/panel-test-branches.json`. The runner exercises actual HTTP sessions without computer use. Do not change agent main prompts or default traffic when testing.

## Historical baseline
[docs/SETUP_HANDOFF.md](docs/SETUP_HANDOFF.md) describes the earlier text-only release. Its single-speaker and missing-audio statements are historical. Current behavior: zero to two investors may reply per founder message, one voice at a time, with dynamic selection and optional silence. Scores start at 50 and can rise or fall. Earlier fixed-order and start-at-100 instructions are superseded.

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
