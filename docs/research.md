# investor-verdict Research Notes
Last updated: 2026-11-01

## 2026-11-01 - Featherless AI, Render, Sentry feasibility (6pm deadline)
Hackathon project: Teams-style call with 4 live ElevenLabs voice agents (cto, tech_bro, interrogator, sympathizer), vanilla ES modules in /agents, frontend confidence-panel, visuals portraits. MVP is multi conversational agents realtime interaction with local keyword confidence engine (deltas 5 to 15, 0 leaves 100 offers). Team of 3, branches for agents frontend visuals.

### Featherless AI
- OpenAI-compatible LLM inference, base URL https://api.featherless.ai/v1, key via dashboard. Chat $25/mo is human-typed chat only, NOT for app or API traffic (ToS). Legit API path is Developer $50 credits/mo, per-token metered, 100 concurrent units, up to 256K context. No free tier found. Verdict: DEFER (cost plus ToS plus cold-start latency risk before 6pm). Keep keyword engine; leave fetch stub for post-hackathon judge.
### Render
- Static sites free on global CDN; Node web services free (750 hrs/mo, 512 MB, spin down after 15 min idle, ~1 min cold start, ephemeral FS). Fits demo URL for judges plus tiny Node server for ElevenLabs signed URLs (GET /v1/convai/conversation/get-signed-url?agent_id=... with xi-api-key, 15-min expiry). Verdict: INCLUDE (highest demo value). Mitigate cold start with keep-alive ping and pre-warm before judging.
### Sentry
- Browser JS via npm @sentry/browser plus Sentry.init({dsn}) or Loader/CDN script tag, ~10 min setup. Free Developer plan 5k errors/mo, 1 user. Verdict: INCLUDE-IF-TIME (optional, low risk, helps live-demo stability; ad-blockers may block events).

Sources: featherless.ai/docs/quickstart-guide, featherless.ai/docs/plans, featherless.ai/pricing, render.com/docs/free, docs.sentry.io/platforms/javascript, elevenlabs.io/docs/eleven-agents/customization/authentication.
