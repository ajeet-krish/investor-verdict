# Sentry setup (frontend drop in plus optional server)

This guide is for the frontend owner. The confidence panel lives on another
branch, so copy the snippet instead of editing that branch here.

## Frontend (required for judged demo)

1. Install the browser SDK in `frontend/confidence-panel`:
   `npm i @sentry/browser`
2. Copy `deploy/sentry-snippet.mjs` into the panel source folder, or import it
   from its current path.
3. Call `initSentry()` once at startup, before `createInvestorCall`. Pass the
   DSN from env, never paste the real DSN into source:
   `initSentry({ dsn: import.meta.env.VITE_SENTRY_DSN })`
4. Bridge call errors so live voice failures reach Sentry:
   `bridgeCallErrors(call)` right after creating the investor call. This wraps
   the existing `call.onError` callback.
5. Set `VITE_SENTRY_DSN` in the Render dashboard (listed in `render.yaml`
   with sync false). It is the frontend DSN for the Vite panel. Use
   `SENTRY_DSN` only for the optional deploy server. Leave it empty in
   local dev to disable reporting.

What the snippet does:

* Samples all traces during the demo (`tracesSampleRate 1.0`), fine for a short
  judged session.
* Scrubs `signedUrl` and `transcript` fields in `beforeSend` so private URLs and
  full pitch text never upload.
* Sends SDK errors through `captureCallError` with the same scrubbing.

## Server (optional)

The deploy server has no Sentry dependency by default to keep installs instant.
To enable server reporting:

1. In `deploy`, run `npm i @sentry/node`.
2. Uncomment the two lines at the bottom of `deploy/sentry-snippet.mjs` and wire
   them in `deploy/server.js` startup, using `process.env.SENTRY_DSN`.
3. Set `SENTRY_DSN` in the Render dashboard. Empty value keeps it disabled.

## Verify

1. Start the deploy server: `npm start` from `deploy/`.
2. Open `GET /health` locally plus `GET https://investor-verdict-1.onrender.com/health` on the live host, expect `ok true` on both.
3. Trigger a test error in the panel, confirm it appears in the Sentry project
   with `signedUrl` shown as `[removed]`.
