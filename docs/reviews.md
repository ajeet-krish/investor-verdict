# Larphacks 2026 Reviews

Last updated: 2026-11-01

## 2026-11-01 - Phase 1: Agents 4-agent live system review

Verdict: FAIL

| Severity | File:Line | Issue | Fix |
| --- | --- | --- | --- |
| High | agents/index.js:149-157 | simulateUtterance never calls mock simulateUtterance (void out no-op) nor live sendUserText, so README promised agent reply never happens, live agents never hear text | Delegate to backend-dev: forward to client without double scoring (suppress duplicate user transcript) and add live sendUserText path |
| High | agents/elevenlabs-client.js:28-73 | Single speaker arbiter only suppresses onSpeaking UI events, underlying 4 ElevenLabs sessions can still play audio simultaneously, queued agents never actually gated or resumed | Delegate to backend-dev: gate session audio or mute non-active sessions, resume queued speaker on flush |
| Medium | agents/elevenlabs-client.js:155-185 | start retry leaks partial sessions (sessions map overwritten without endSession) and index.js:98-115 keeps started=true after live start throws, so retry returns wrongly as started | Delegate to backend-dev: end partial sessions before retry, reset started on live failure, reset retryCount on success |
| Medium | agents/index.js:102, agents/elevenlabs-client.js:187-215 | Live stop clears activeSpeaker without emitting speaking false, frontend avatar can stay stuck speaking | Delegate to backend-dev: emit speaking false for activeSpeaker in stop before clearing |
| Medium | all agents/*.js files, e.g. config.js:8-13 and index.js:8-14 | 2-space indent throughout instead of project 4-space convention | Delegate to backend-dev: reformat JS to 4 spaces, no logic change |
| Low | agents/confidence-engine.js:188-213, agents/config.js:1-13 | Scores continue moving after leave or offer (outcome blocks repeat event only), and custom startScores are not clamped to 0-100 before first turn | Delegate to backend-dev: freeze terminal agents or document rebound, clamp startScores in createConfidenceEngine |
| Low | agents/elevenlabs-client.js:96, repository root | Dynamic import of @elevenlabs/client has no package.json anywhere declaring or pinning that dependency | Delegate to backend-dev: declare pinned dependency or document bundler alias expected by frontend |
| Low | agents/mock-client.js:39-52,75-96 | Timed lines and simulateUtterance replies can overlap, stop only silences last activeAgent so speaking flags can leak | Delegate to backend-dev: share single speaker state in mock, clear pending timeouts on stop |

Notes: Passed checks included scoring clamp 0 to 100 (confidence-engine.js:199-204), delta clamp 5 to 15 (confidence-engine.js:60-64), leave once and offer once guards (confidence-engine.js:206-213), dynamic SDK import (elevenlabs-client.js:92-99), vanilla ES modules, no em dashes or double hyphens found in agents scope.

## 2026-11-01 - Phase 1: Agents 4-agent live system re-review

Verdict: FAIL

| Severity | File:Line | Issue | Fix |
| --- | --- | --- | --- |
| Medium | agents/elevenlabs-client.js:96-105,67-81 | Queued speaker is removed from speakQueue when its own speaking false arrives before flushQueue runs, and flushQueue only unmutes in-progress audio, so queued speech can be lost rather than resumed. Audio muting itself is implemented at lines 39-65. | Delegate to backend-dev: keep queued speaker state until flush, or do not generate queued speech until granted the floor. |
| Medium | agents/elevenlabs-client.js:281-300,276-279 | Live sendUserText breaks after the first capable session and ignores activeAgentHint, so simulated live text always reaches only the first usable agent rather than the hinted or intended agent. | Delegate to backend-dev: route to activeAgentHint session when present, else document the single-recipient choice. |
| Low | agents/elevenlabs-client.js:46-47,61-63 | Audio gate tries setVolume(number) first and swallows errors without trying the next mute method in the else-if chain; if the pinned @elevenlabs/client 0.3.1 expects a different signature, gating silently no-ops. Unverified against installed SDK because no package.json exists in repo. | Delegate to backend-dev: verify against pinned SDK docs or installed types and fall through to the next gate method on throw. |
| Low | agents/elevenlabs-client.js:75,104,121 and 241-249 | flushQueue setTimeout handles are not tracked or cleared in stop, so stale timers can fire after stop or restart. | Delegate to backend-dev: track and clear flush timers in stop. |

Notes: Verified fixed: simulateUtterance forwarding with echo suppression (agents/index.js:159-185, mock echo at agents/mock-client.js:119, live echo at agents/elevenlabs-client.js:283), retry cleanup and retryCount reset (agents/elevenlabs-client.js:149-163,223,227-237) plus started reset (agents/index.js:119-124), stop speaking false (agents/elevenlabs-client.js:244-249, agents/mock-client.js:110-114), 4-space indent, clamp startScores and freeze terminal (agents/confidence-engine.js:157-167,200-207), pinned dependency doc (agents/README.md:21, agents/package-note.md:5-8), mock timeout cleanup (agents/mock-client.js:31,41-55,103-115).
