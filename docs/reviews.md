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

## 2026-11-01 - Phase 1: Security Review (4-agent live system)

Verdict: FAIL

| Severity | File:Line | Issue | Fix |
| --- | --- | --- | --- |
| High | agents/elevenlabs-client.js:402-414, agents/index.js:138-151 | Final live start failure calls endPartialSessions but never stops micStream tracks, and auto fallback abandons the live client without stop(), so the microphone can stay live after failure or fallback | Delegate to backend-dev: stop mic tracks in endPartialSessions or call live.stop() on all failure paths before mock fallback |
| High | agents/elevenlabs-client.js:407-408 | Retry wait uses an untracked 800ms setTimeout, stop() during the wait cannot cancel it and the recursive start() can reopen mic and sessions after the user stopped | Delegate to backend-dev: track and clear the retry timer in stop(), and recheck running after the wait |
| Medium | agents/index.js:39-46,170-176, agents/elevenlabs-client.js:269-287,479-494, agents/confidence-engine.js:270-280 | No transcript length cap on any entry path, unbounded text is scored, emitted, retained in score payloads, and forwarded to ElevenLabs, enabling CPU, memory, and API cost abuse | Delegate to backend-dev: enforce a shared max length (for example 2000 chars) with truncation or rejection at handleUserText, simulateUtterance, and sendUserText |
| Medium | agents/elevenlabs-client.js:348-372,417-452 | SDK session callbacks have no running guard, stale onMessage or onModeChange after stop() can emit transcripts, score user text, and schedule new flush timers after teardown | Delegate to backend-dev: guard all session callbacks with running and a session generation check, ignore callbacks from removed sessions |
| Medium | agents/index.js:8-14,163-168, agents/elevenlabs-client.js:390-397,454-457, agents/mock-client.js:23,100 | Env and option validation gaps: agentIds are accepted on truthiness only with no string format or length check, mode and setActiveAgent are not allowlisted, and mockIntervalMs is not range checked (a 1ms interval enables busy loop load) | Delegate to backend-dev: validate agent IDs against AGENT_ORDER keys and an ID pattern, allowlist mode and agentId, clamp mockIntervalMs to a safe range |
| Low | agents/index.js:70-73,175, agents/elevenlabs-client.js:287,479-481, agents/confidence-engine.js:93-101,270-280 | Prompt and scoring injection: user text is forwarded verbatim to live agents (intended conversation input) and keyword stuffing with repeated identical phrases scores every turn on the simulate path with no dedupe, so players can game scores to offer or leave; raw transcript text is also emitted unsanitized to consumers | Delegate to backend-dev: dedupe repeated simulate turns, consider diminishing returns for repeated phrases, document that frontend must render transcripts with textContent not innerHTML; tech-lead to confirm keyword gaming is accepted game design |
| Low | agents/event-emitter.js:13-42, agents/index.js:154-161,198-224 | Listener hygiene: emit has no per listener error isolation so one throwing listener blocks later listeners and propagates into SDK callbacks, and stop() never clears bus listeners (unsubscribe handles exist but callers must use them) | Delegate to backend-dev: isolate listener errors in emit, document unsubscribe use, optionally clear or expose listener counts on stop |
| Low | agents/elevenlabs-client.js:370-372,410-413, agents/index.js:145,191-193 | Error events forward raw SDK error objects which may embed signed URL or request detail, minor information disclosure to any error listener | Delegate to backend-dev: emit a sanitized error message and code only, never signed URLs or headers |

Notes: PASS checks: key exposure (no ELEVENLABS_API_KEY referenced in any client JS, only placeholder in agents/.env.example:4 and server only warning at agents/README.md:18, signed URLs arrive via opaque getSignedUrl callback at agents/elevenlabs-client.js:339-344), path traversal (no filesystem, path, fetch, or shell APIs in agents code), code injection (no eval, exec, system, popen, or innerHTML in agents code), mock timer cleanup (agents/mock-client.js:41-55,103-115), live flush timer cleanup (agents/elevenlabs-client.js:36-49,419), mic track stop on normal stop (agents/elevenlabs-client.js:440-450), session end on normal stop and retry partial cleanup (agents/elevenlabs-client.js:320-335,427-438). Recurring pattern to avoid: async retry and fallback paths must run the same teardown (mic, timers, sessions) as the normal stop path.
