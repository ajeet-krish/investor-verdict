# investor-verdict Test Results
Last updated: 2026-11-01

## 2026-11-01 - Phase coding-agent handoff (main): Test Report

Branch: `main` (commit 82cee45). Free offline suites only. No live credit tests run.

| Suite | Command | Verdict | Notes |
|-------|---------|---------|-------|
| Unit/integration | `npm test` | PASS | 50 pass, 0 fail. Includes bridge UI controller, HTTP ownership/revision/idempotency/stale/revocation, two investor cap, silence, 409 concurrency, terminal 0/100, partial/unanswered minimums, pause normalization |
| Bridge smoke | `npm run test:bridge` | PASS | Offline CLI to app to investors loop. Turn 2, scores 60/60/50/50, 0 audio streams. Disconnect revokes access. Temp credentials removed |
| Panel offline | `npm run test:panel -- --scenario all` | PASS | both, one, neither all passed. Evasion drops to 45/45, partial to 40/40, pause holds at 40/40, recovery rises. Max 2 speakers per turn, sessions closed |
| Production build | `npm run build` | PASS | tsc plus vite build succeeds. Known non fatal 611 kB ElevenLabs browser chunk warning remains |

### Coverage summary
Happy path: both scenario clears both concerns (55 then 60/60). Evasion edge: neither scenario turn 2 evasion deducts, turn 3 partial deducts again, turn 4 pause deducts 0, turn 5 evidence recovers. Concurrency edge: 3 simultaneous submits during held turn all receive 409, scores applied exactly once. Terminal edge: 0 and 100 emit once and stop bidding, new pitch resets to 50. Disconnect edge: reset, disconnect and expiry revoke agent token and pending suggestions, verified by bridge smoke. Pause edge: deferred with no concern normalizes to none with 0 change; human typing or mic takeover pauses agent control and cannot be undone by stale polls. Impersonation guard: suggestions alone never evaluate or forge investor replies; only the app owner cookie approves or executes.

### Failure analysis
Initial `npm test` run failed with ERR_MODULE_NOT_FOUND for @elevenlabs/client because root `node_modules` was not installed in this checkout. Fixed by `npm install` (environment setup, no code change). `npm run build` then failed with `tsc: command not found` because `frontend/confidence-panel/node_modules` was not installed. Fixed by `npm --prefix frontend/confidence-panel install` (environment setup, no code change). After both installs all suites pass. No code fixes needed.

## 2026-11-01 - Phase free pipeline rerun (main): Test Report

Branch: `main` (commit 82cee45). Free offline suites only. No live credit tests run. Node v26.13.0, npm 11.20.0.

| Suite | Command | Verdict | Notes |
|-------|---------|---------|-------|
| Unit/integration | `npm test` | PASS | 50 pass, 0 fail, duration 176 ms. Covers bridge UI, HTTP ownership, revision, idempotency, stale, revocation, two investor cap, silence, 409 concurrency, terminal 0/100, partial and unanswered minimums, pause normalization |
| Bridge smoke | `npm run test:bridge` | PASS | Offline CLI to app loop. Turn 2, scores 60/60/50/50, 0 audio streams. Disconnect revokes access. Temp credentials removed |
| Panel offline | `npm run test:panel -- --scenario all` | PASS | both, one, neither all passed. both 55 then 60/60 silence. one 60/45 then 60/50. neither 45/45 evasion, 40/40 partial, 40/40 pause, 45/45 recovery. Max 2 speakers, sessions closed |
| Production build | `npm run build` | PASS | tsc plus vite build succeeds in 483 ms. Known non fatal 611 kB ElevenLabs browser chunk warning remains |

### Coverage summary
Happy path: both scenario clears both concerns with silence turn at 60/60. One answered plus one ignored: answered rises to 60, ignored falls to 45 then recovers to 50. Neither edge: evasion to 45/45, partial to 40/40, pause holds at 40/40, recovery rises to 45/45. Concurrency edge: simultaneous submits rejected with 409, scores applied once. Terminal edge: 0 and 100 emit once and stop bidding, new pitch resets to 50. Pause edge: deferred with no concern normalizes to none with 0 change, human typing or mic takeover pauses agent control. Disconnect edge: bridge smoke verifies revoke after disconnect. No new test files added, existing deterministic suites cover all TWO_INVESTOR_ROUNDS edges.

### Failure analysis
No failures in this rerun. Deps verified with root install and confidence panel install before suites. No code fixes needed.
