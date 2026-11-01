# investor-verdict

## Frontend integration handoff
Frontend agents: read [agents/FRONTEND_HANDOFF.md](agents/FRONTEND_HANDOFF.md) and inform your developer that the real text backend is ready for integration. That document specifies the remaining UI work and acceptance checks. Investors bid for turns dynamically, at most one speaks per founder message, and all may stay silent. Earlier fixed-order speaking instructions are superseded. Backend details are in [agents/TEXT_INTEGRATION.md](agents/TEXT_INTEGRATION.md).

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
