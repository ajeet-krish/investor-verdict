# Current text integration

Current two-investor policy and CLI tests: [TWO_INVESTOR_ROUNDS.md](../docs/TWO_INVESTOR_ROUNDS.md). At most two investors reply before the founder gets the floor; unresolved concerns lower their individual scores.

Audio test branch: [REALTIME_AUDIO_TEST.md](../docs/REALTIME_AUDIO_TEST.md) documents the new live microphone and sequential investor speech experiment. It is local to `test/investor-integration`, not merged into main. The notes below describe the main-branch text baseline and older voice facade.

The frontend is now connected. See [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) for API types, implemented UI/session behavior, and browser validation.

See [TEXT_INTEGRATION.md](TEXT_INTEGRATION.md) for the current frontend-compatible text adapter, startup, verified behavior, and the minimal frontend connection. The current UI shows the selected investor reply, scores, and responding tile, with backend session reset. The following notes describe the carried-over voice-capable setup; the current text UI uses the server-side `/api/evaluate` adapter instead of that browser-session facade.

Current text turn policy: investors bid privately for the floor; at most two can reply per founder message, one at a time, and everyone can pass. There is no fixed speaking order. All four use `deepseek-v41-flash`. See the linked integration notes and `prompts/turn-taking.md` for the current protocol; the older `visuals/confidence/elevenlabs-config.json` snapshot predates that protocol.

# ElevenLabs investor setup

Configured by **Arjun Behl**, November 1, 2026.

For the complete record of changes, verification, GitHub status, and remaining work, read [docs/SETUP_HANDOFF.md](../docs/SETUP_HANDOFF.md).

The four investors are Market Signals Researcher (Alice), Technical Expert (Will), Interrogator (George), and Sympathizer (Sarah). Existing internal keys `cto` and `tech_bro` map to the researcher and technical expert for compatibility with the pulled agents code.

## Local startup

From the repository root:

```sh
npm install
npm --prefix frontend/confidence-panel ci
npm run dev
```

Open http://127.0.0.1:5173. Choose Live voice, Live text, or Local rehearsal, then Join investor call. Voice requires microphone permission. Live modes use the ElevenLabs account; Local rehearsal is scripted and makes no ElevenLabs requests. No live conversations have been run as part of this setup.

The root `.env` already contains the locally authorized API key and all four agent IDs. It is ignored by Git and restricted to the current user. To configure a fresh checkout, use the root `.env.example` as the template and run `npx -y @elevenlabs/cli@latest onboard init`. Never paste a real key into chat, source code, or a `VITE_` variable.

## Authentication

`npm run dev` loads the root `.env`, starts the API on 127.0.0.1:8787, and starts Vite on 127.0.0.1:5173. The API uses `@elevenlabs/elevenlabs-js` to mint signed WebSocket URLs for the four configured IDs. The browser uses `@elevenlabs/client`, receives only the signed URL, and registers the scoring client tool. The actual API key stays on the server. The remote agents now require authentication.

`APP_ORIGIN` and `PORT` are configured in `.env`. This is a loopback-only development server, not a public deployment. A public deployment needs application user authentication in front of signed URL issuance. Keep the server running when using a Vite preview, and match APP_ORIGIN to the preview origin.

## Scoring and brief feedback

All four begin at **50**. Evidence-based answers can raise confidence and weak answers can lower it, by at most 20 points per substantive turn. At **0** the investor passes; at **100** the investor makes a simulated offer. Both are terminal. The agent gives a brief verdict with its main reason and one practical next step. The founder can also ask for brief feedback at any time.

Live scores come only from the remote `report_investor_interest` tool, validated by `visuals/confidence/interest-controller.mjs`. The client binds each tool to its own investor, rejects stale/duplicate/malformed updates, and uses the latest accepted score as authoritative. The old keyword scorer in `confidence-engine.js` is used only in explicitly selected Local rehearsal mode. There is no random score drift in the application.

The first investor opens the call; the other three wait for the founder. Typed input is broadcast to all active sessions. The pulled audio arbiter gates simultaneous replies, but the current SDK owns each session's microphone stream separately. The obsolete `userMediaStream` option was removed and the SDK's current `setVolume({ volume })` signature is used. Live multi-speaker timing still needs a manual microphone rehearsal. Use headphones for that rehearsal.

Leave ends sessions and preserves the visible scores and brief reasons. New pitch ends all old sessions and resets to 50. Terminal sessions close after the final verdict, with a 20-second fallback cleanup. There is no automatic paid retry or silent mock fallback in the app's explicit Live modes.

## Files and validation

- `server/app.mjs`: local signed URL API, allowlisted investor IDs and origin checks.
- `server/index.mjs`: server-only ElevenLabs SDK client.
- `server/dev.mjs`: development process launcher.
- `elevenlabs-client.js`: live sessions, client tools, audio gating, cleanup.
- `index.js`: mock/live facade and score events.
- `prompts/`: current role prompts, synchronized with the saved configuration.
- `../visuals/confidence/elevenlabs-config.json`: agent IDs, voices, full prompts and tool configuration.
- `../frontend/confidence-panel/`: integrated interface and portraits.

```sh
npm test
npm run build
```

The root package lock pins the installed SDKs. Tests mock ElevenLabs calls and cover key handling, signed URL restrictions, score events, terminal outcomes, SDK arguments, and cleanup. Remote read-back and signed URL checks verify that the actual key can access all four authenticated agents without starting a conversation.

Sources: [ElevenLabs JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script), [client tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools).
