# Architecture (MVP, multi conversational agents, realtime)

## Overview

investor-verdict runs one founder mic against 4 live ElevenLabs sessions plus a pure scoring core. One shared mic stream fans out to CTO, Tech Bro, Interrogator, Sympathizer. Transcripts dedupe to a single founder turn. The confidence engine scores all 4 every turn. A speaker arbiter lets max 2 investors reply. Frontend tiles show scores, visuals avatars react, outcomes exit at 0 (leave) or 100 (offer). Mock mode rehearses the same loop with no key and no network.

## Components

* `agents/config.js`: Title IDs (`cto`, `tech_bro`, `interrogator`, `sympathizer`), start scores (50 each), sensitivities, thresholds, deal ranks and labels
* `agents/confidence-engine.js`: pure scorer, `createConfidenceEngine` plus `scoreTurn` plus `apply`, clamps deltas 5 to 15, clamps scores 0 to 100, freezes terminal investors, emits leave or offer once each
* `agents/elevenlabs-client.js`: 4 live sessions, one cached mic stream, primary session transcript dedupe (2500ms normalized repeat guard), speaker arbiter (2000ms cooldown, 12s stale drop, addressed Title priority, largest delta next, round robin tiebreak), audio gating across sessions, retry once then throw, flush timers tracked and cleared on stop
* `agents/index.js`: `createInvestorCall` facade, modes `mock`, `live`, `auto` (live with mock fallback), echo suppression for simulated turns, score plus transcript plus speaking plus leave plus offer plus status plus error events
* `agents/mock-client.js`: timed persona lines plus `simulateUtterance` replies, single active speaker, pending timeouts cleared on stop
* `agents/event-emitter.js`: tiny pub sub backing all callbacks
* Frontend confidence panel (`frontend/confidence-panel/src/main.ts` plus `index.html`, from commit `8fc2a39`): call grid tiles, score bars, leave and offer states, mic grant, mock or live picker, wires `onScoreUpdate`, `onTranscript`, `onAgentSpeaking`, `onLeave`, `onOffer`
* Visuals confidence demo (`visuals/confidence/demo.html`): avatar motion and reaction staging for rehearsal
* Visuals investors (`visuals/investors/` plus `investors.mjs`): portrait art and motion helpers consumed by tiles
* Visuals preview (`visuals/confidence/preview.jpg`): still used in README while screenshots are pending
* Pinned client note (`agents/package-note.md`): frontend installs `npm i @elevenlabs/client@0.3.1`, mock bundles never load it (dynamic import only)

Note: frontend confidence panel and visuals confidence plus investors paths are expected on their branches (see Branch map). They were not present in the local checkout during this docs pass, so treat those file refs as the integration contract and confirm on merge.

## Data flow

1. Founder speaks, `resolveMic` caches one `MediaStream`, each session starts with that stream as its input
2. Sessions emit user transcripts, only the primary session forwards text, normalized repeats inside 2500ms drop
3. `handleUserText` runs `scoreTurn` (keyword plus number plus length signals per persona) then `apply` (deltas 5 to 15, clamp 0 to 100)
4. One `score` event carries all 4 results, `leave` fires once at 0, `offer` fires once at 100, each with deal rank and label
5. Frontend tiles update bars and states, visuals avatars play reactions
6. Arbiter queues up to 2 replies per founder turn, grants the floor after cooldown, gates session audio so one voice leads
7. `sendUserText` routes typed or simulated lines to the hinted session when set, else the first connected session that accepts text
8. Interrupts clear the active speaker and reschedule the queue, stale entries drop after 12s

## Env vars

* `ELEVENLABS_API_KEY`: server only, used to mint signed URLs for private agents, never placed in browser code
* `ELEVENLABS_AGENT_ID_CTO`: public ID, browser safe, live voice auth by ID
* `ELEVENLABS_AGENT_ID_TECH_BRO`: public ID, browser safe
* `ELEVENLABS_AGENT_ID_INTERROGATOR`: public ID, browser safe
* `ELEVENLABS_AGENT_ID_SYMPATHIZER`: public ID, browser safe
* Template lives at `agents/.env.example`, local copy is `.env`, never commit either with real values

## Failure modes

* Mic denied or missing: text only path plus `simulateUtterance` keeps scoring and replies alive, UI should explain the mic prompt
* Missing agent IDs: live start throws a clear error, `auto` mode falls back to mock, judges still see the full loop
* Live start partial failure: partial sessions end before retry, one retry only, then error plus mock fallback, status events narrate each step
* Four voices at once: arbiter plus audio gating serialize replies, cooldown 2000ms, max 2 per turn, queue dedupes per agent
* Stuck speaking avatar: stop emits speaking false for the active speaker, flush timers clear, mock pending timeouts clear
* Transcript storms or repeats: primary session gate plus 2500ms normalized dedupe plus echo suppression on simulated turns
* Score gaming by keyword stuffing: accepted game design for the hackathon, frontend must render transcripts as text (textContent path) and tech lead confirms
* Raw SDK errors: surfaced through `onError` with fallback flags, never include signed URLs or headers in UI
* No network on stage: rehearse in mock, record `docs/demo.mp4` as backup, see `docs/demo.md`

## Appendix: Render hosting plus Sentry monitoring

Live demo: https://investor-verdict-1.onrender.com. Render runs one Web Service
with display name `investor-verdict` and URL slug `investor-verdict-1`.
Runtime is Node, root directory is `deploy`, build command is `npm install`,
start command is `npm start`. Plan is Starter, always on, so the demo has no
cold start. It uses Render credits from the $50 balance. Health check path is
`/health`, so GET https://investor-verdict-1.onrender.com/health must return
ok true. Signed URL check is POST /api/signed-url on the same host with JSON
`{"agentKey": "cto"}`, expect `signedUrl` JSON.

Env vars on the Render dashboard (all values sync false in `render.yaml`):

* `PORT` (set by Render, local default 3000)
* `ELEVENLABS_API_KEY` (server only, mints signed URLs, never sent to browser)
* `ELEVENLABS_AGENT_ID_CTO` plus `TECH_BRO` plus `INTERROGATOR` plus `SYMPATHIZER`
* `SENTRY_DSN` (server optional, empty disables server reporting)

`deploy/server.js` is a zero dependency Node http server:

* `GET /health` returns `ok true` plus service name plus time, used by Render
  and by the judge prewarm check in `docs/demo.md`
* `GET /` serves the built panel from `frontend/confidence-panel/dist` when its
  `index.html` exists, else serves `visuals/confidence/demo.html` when present,
  else returns a small placeholder page with links to `agents/README.md`
* `POST /api/signed-url` accepts JSON `agentKey` (`cto`, `tech_bro`,
  `interrogator`, `sympathizer`), maps it to the matching agent ID env var,
  calls the ElevenLabs signed URL endpoint with `ELEVENLABS_API_KEY` server side
  only, returns `signedUrl` JSON, replies 400 on unknown key and 502 on upstream
  failure without leaking the key
* Agents are public, so the browser can also connect by agent ID alone. The
  signed URL route stays ready for a future private switch with no client change
  except passing the returned URL into the session start call

Sentry uses the $180 credit balance for error plus trace visibility:

* Frontend drop in lives at `deploy/sentry-snippet.mjs`, setup steps at
  `deploy/SENTRY_SETUP.md`. The frontend owner runs `npm i @sentry/browser`,
  calls `initSentry` once with the DSN from env, and bridges `call.onError`
  with `bridgeCallErrors`. Traces sample at 1.0 for the short demo.
  `beforeSend` plus `captureCallError` scrub `signedUrl` and `transcript` so
  private URLs and full pitch text never upload. No DSN is hardcoded, the value
  comes from `VITE_SENTRY_DSN` on Render
* Server monitoring is optional and commented out. Install `@sentry/node` in
  `deploy` only when needed, then init with `process.env.SENTRY_DSN`

No Featherless dependency exists in this path. Deploy plus monitoring touch only
`deploy/`, root `render.yaml`, and docs. They never edit `agents/`,
`frontend/`, or `visuals/` code.

## Branch map

* `feat/agents/4-agent-live-system` (this branch): agents live system, confidence engine, mock client, arbiter, dedupe, env template, this docs pass (README plus `docs/architecture.md` plus `docs/demo.md`)
* Visuals branches (`feat/visuals/*`): confidence demo page, investors portraits and motion helpers, preview still, screenshot capture
* Frontend work (confidence panel): call grid, score bars, leave and offer states, mic and mode controls, state wiring to `createInvestorCall`
* Shared files (`README.md`, `AGENTS.md`): quick chat before editing, conventional commits, one folder per member, never commit `.env` or keys
