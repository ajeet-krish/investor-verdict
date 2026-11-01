# Contributing: investor-verdict hackathon workflow

## Branch naming

* Frontend: `feat/frontend/short-task`
* Visuals: `feat/visuals/short-task`
* Agents: `feat/agents/short-task`
* Fixes: `fix/frontend/bug-name` (same pattern per area)

## How to avoid merge conflicts

* Work only in your folder (`/frontend`, `/visuals`, `/agents`)
* Shared files (`README.md`, `AGENTS.md`) need a quick chat before editing
* Pull main before starting: `git checkout main` then `git pull`
* Push your branch early so others can see it
* Keep PRs small: one task per branch

## PR checklist for speed

* [ ] Title uses conventional commit prefix (`feat:`, `fix:`, `docs:`)
* [ ] Change is limited to your folder
* [ ] No `.env` or keys included
* [ ] Screenshots or short clip for UI and visual changes
* [ ] One teammate approves, then merge
* [ ] Delete branch after merge

## Commit format

* Format: `type: short summary`
* Types: `feat`, `fix`, `docs`, `style`, `chore`
* Examples:
  * `feat: add score bar layout`
  * `fix: correct leave call threshold`
  * `docs: update agents setup notes`
