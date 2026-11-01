# SDK dependencies

Use `npm install` at the repository root. The root package.json and package-lock.json pin `@elevenlabs/client` for browser sessions and `@elevenlabs/elevenlabs-js` for server authentication. The previous suggested client version 0.3.1 was unavailable from npm and has been replaced with 1.32.1.

Run `npm --prefix frontend/confidence-panel ci` for the frontend build tools. Keep the API key only in the ignored root `.env`. See [README.md](README.md).
