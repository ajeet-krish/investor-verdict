# Handoff: Agents System Build Point

Start point: main at 544aee7. Live demo: https://investor-verdict-1.onrender.com
Audience: teammates adding voice, UI, or deploy work on top of the agents system.
Refs: README.md, agents/README.md, agents/FRONTEND_HANDOFF.md, docs/SETUP_HANDOFF.md.

## 1. What is done

Agents engine: prompts in agents/prompts plus config in agents/config.js.
Live client: agents/elevenlabs-client.js plus facade in agents/index.js.
Mock mode: agents/mock-client.js for no key rehearsal.
Text integration: merged in PR 3. Same origin POST /api/evaluate plus POST /api/reset.
Deploy server: deploy/server.js serves frontend dist plus signed URL API.
Container: deploy/Dockerfile fallback for Render dashboard Docker runtime.
Hosting: render.yaml Starter plan, always on, health path /health.
Observability: deploy/sentry-snippet.mjs plus deploy/SENTRY_SETUP.md.
Demo docs: README.md quickstart plus panel table plus docs/architecture.md with mermaid.
Frontend on main: confidence panel scores plus visuals confidence demo.

## 2. How to start

1. Clone repo, checkout main, pull latest.
2. Copy deploy/.env.example to deploy/.env for server run.
3. Copy frontend panel .env example to .env if present for Vite run.
4. Fill real IDs and keys from Render dashboard (request access, values shared out of band).
5. Install deps in repo root and in deploy folder.
6. Run npm start inside deploy for hosted style server.
7. Run npm run dev from repo root for local text plus panel flow.
8. Open GET /health locally and on live host, expect ok true.
9. Test POST /api/signed-url on live host with agentKey cto, expect signedUrl JSON.
10. Grant mic for live voice, use mock or local rehearsal for no key practice.

## 3. API contract

Health: GET /health returns ok true plus service name plus time.
Signed URL: POST /api/signed-url with JSON body containing agentKey.
agentKey mapping: cto, tech_bro, interrogator, sympathizer to 4 env IDs.
Frontend entry: createInvestorCall in agents live client.
Call events: score, leave, offer, transcript, speaking.
Turn rule: dynamic bidding, max 2 replies per founder turn via arbiter.
Score rule: start 50, 0 leaves call, 100 offers term sheet, terminal state freezes.
Transcript rule: single founder turn, primary session plus repeat guard.
Mic status: transcription wired in main.ts, not manually verified.
Voice reply status: spoken investor replies not connected in current UI.

## 4. Env map

ELEVENLABS_API_KEY: server only, mints signed URLs, never in browser.
ELEVENLABS_AGENT_ID_CTO: public ID, browser safe.
ELEVENLABS_AGENT_ID_TECH_BRO: public ID, browser safe.
ELEVENLABS_AGENT_ID_INTERROGATOR: public ID, browser safe.
ELEVENLABS_AGENT_ID_SYMPATHIZER: public ID, browser safe.
SENTRY_DSN: optional deploy server reporting, empty disables it.
VITE_SENTRY_DSN: frontend panel reporting, set in Render dashboard.
Repo values stay as agent placeholders, real values live in Render dashboard only.

## 5. What remains

1. Frontend Sentry wiring: call initSentry plus bridgeCallErrors in main.ts.
2. Voice reply connection: audio only for selected public reply, keep bidding silent.
3. Mic verification: real browser plus mic rehearsal with headphones.
4. Venue rehearsal: run full pitch arc, confirm max 2 replies and score motion.
5. Backup clip: record docs/demo.mp4, 60 to 90 seconds, plus call grid screenshots.
6. Deploy wiring: host evaluate and reset paths if judged flow needs them.

## 6. Do not rules

1. Never commit .env or real keys or real agent IDs.
2. Never put API key with VITE prefix or in frontend source.
3. Stay in your folder, ask before touching shared files.
4. Placeholders stay in repo, real IDs only in Render dashboard.
5. One feature branch per member, merge via fast review.
6. Use commas, colons, parentheses in prose.
