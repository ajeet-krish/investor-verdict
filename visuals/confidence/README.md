# Investor confidence, Arjun Behl

Updated November 1, 2026. The user's accepted rules now start all four investors at **50**, replacing this folder's initial 100-point prototype. Strong evidence increases confidence; concerns reduce it. **0 means pass, 100 means a simulated offer**, with a brief verdict and next step. Neither outcome is a real funding commitment.

The four configured ElevenLabs agents and voices are recorded in `investors.mjs`; full prompts and tool configuration are in `elevenlabs-config.json`. The agents require authenticated signed sessions from the root `.env` setup.

`interest-controller.mjs` maintains one pitch's score state. It validates integer scores, limits each update to 20 points, prevents repeated/stale updates, binds investor identity to the session, and emits terminal outcomes once. Create a fresh controller for every pitch and call `close()` when leaving. `panel.mjs` and `panel.css` provide a reusable portrait display. `demo.html` is a local simulated preview and makes no ElevenLabs calls.

The main frontend is now wired through `agents/index.js` and `agents/elevenlabs-client.js`. Live mode uses agent reports only; the older heuristic scorer is limited to explicit Local rehearsal. See [the current setup and handoff](../../agents/README.md) for startup, API key handling, voice behavior, test status, and limitations.

Tests: `node --test visuals/confidence/interest-controller.test.mjs`.

The earlier `preview.jpg` shows the historical 100-point prototype, not the current starting score. No Unreal or Blender integration is included.
