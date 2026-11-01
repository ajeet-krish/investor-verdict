# Render deployment

Owner: Arjun Behl. Verified November 1, 2026.

Live app: https://investor-verdict-uxj7.onrender.com
Dashboard: https://dashboard.render.com/web/srv-dbjrnce7bikc738c91r0

The service is in Arjun Behl's Workspace, on the Free Node plan in Oregon. It uses the public `ajeet-krish/investor-verdict` repository and branch `main`. The older `investor-verdict-1.onrender.com` service was not available in this workspace and was left untouched.

## Build and runtime

- Root Directory: empty, the repository root.
- Node version: 22, selected with `NODE_VERSION=22` and `.node-version`.
- Build: `npm ci --include=dev && npm --prefix frontend/confidence-panel ci --include=dev && npm run build`
- Start: `node deploy/server.js`
- Health check: `/health`

The old deploy-only install did not build the frontend or install the real ElevenLabs SDKs. The new build installs both packages and compiles the Vite app. The Node server serves its built files and the API from the same HTTPS origin. Do not set Root Directory to `deploy`, and do not upload a local `.env` as a public asset.

For Docker, use the repository root as the context: `docker build -f deploy/Dockerfile .`. The Dockerfile uses Node 22 and builds the complete app; `.dockerignore` excludes environment files, keys and local bridge credentials. The live service uses native Node, not Docker.

Render's [root-directory documentation](https://render.com/docs/monorepo-support) and [Node version documentation](https://render.com/docs/node-version) explain these settings.

## Private environment

The live service has `ELEVENLABS_API_KEY`, the four `ELEVENLABS_AGENT_ID_*` variables, `OPENAI_API_KEY`, `OPENAI_COACH_MODEL=gpt-6.1-terra`, `OPENAI_COACH_REASONING_EFFORT=medium` and `NODE_VERSION=22` in Render's private environment settings. No values are stored in this guide.

The local `openai_key` value was normalized to `OPENAI_API_KEY` for deployment. The local loopback `APP_ORIGIN` and local `PORT` were not copied. Render supplies the port; the deployment adapter accepts its own request host as the origin. API keys remain server-side.

Use the correct account's agent IDs and branch mapping. See [ElevenLabs setup](../agents/ELEVENLABS_SETUP.md) before changing accounts.

## Verification

First successful live deployment: commit `798049f753bf960a0996c44356c3bdb40f8bbc59`, deployment `dep-dbjrncm7bikc738c92k0`.

Verified against the hosted service:

- Health returns HTTP 200 and `ok: true`.
- The new monitor lobby, compiled JS/CSS and four portraits load.
- Reset creates a session with all four confidence scores at 50.
- A real PantryPal pitch returns HTTP 200, scores of 60, and two investor replies.
- Authenticated reply audio returns HTTP 200, `audio/mpeg`, 137,552 bytes.
- The OpenAI coach returns three follow-up cards.
- The microphone token endpoint returns a short-lived Scribe token without exposing the provider key.
- The isolated verification session was reset afterward.

The actual user's microphone and speakers were not exercised remotely. The existing 99 automated tests and a clean-checkout production build passed before deployment. Sanitized service evidence is in [render-deployment.json](../docs/test-results/render-deployment.json).

## Continuous deployment

The [GitHub Actions workflow](../.github/workflows/render-deploy.yml) runs for pushes to `main`, pull requests targeting `main`, and manual workflow runs. It installs dependencies, runs the automated tests and builds the frontend. Only successful runs on `main` can request a Render deployment; pull requests never deploy or receive the hook secret.

The workflow sends the tested commit SHA to Render's deploy hook, so a newer untested commit cannot be picked up accidentally. Concurrent runs for the same branch cancel older unfinished workflow runs. `RENDER_DEPLOY_HOOK_URL` is stored as an encrypted GitHub Actions repository secret, never in this file or workflow source. The hook only targets this service; it does not require a workspace-wide Render API key.

For future releases, push the approved changes to `main`. See **Actions > Test and deploy to Render** in GitHub. A successful workflow means validation passed and Render accepted or queued the deployment. Follow the deployment link in the run summary to confirm Render's build and health checks finish. The existing site keeps serving until the new deployment is ready. Use **Run workflow** on `main` to retry, or **Manual Deploy > Deploy latest commit** in Render for a manual recovery.

This service was created using a public repository URL, so the GitHub Actions hook supplies CD without relying on Render's connected-Git-provider auto-deploy. See [Render's deploy-hook guide](https://render.com/docs/deploy-hooks). If the hook is rotated, update the GitHub repository secret before the next push.

Free instances sleep when idle, so the first request can take longer. Active call state is held in memory and resets on restart; no database or persistent disk is required for the current app.
