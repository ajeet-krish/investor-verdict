# Coding-agent handoff: participate in the live investor call

Read [the pipeline guide](../docs/CODING_AGENT_PIPELINE.md). This is the contract for the coding agent working alongside a human coder.

1. The coder clicks **Allow coding agent** once and supplies the copied private connection JSON. Save it privately and run `npm run agent:connect -- --file PATH`. Never print, commit or post its token. The standard `.verdict-agent.local.json` file is ignored by Git.
2. Read `npm run agent:context`. Check `connected`, `autoSend`, `busy`, `ready`, revision, recent history and each investor's pending concern. Do not use guessed or stale questions.
3. Help the coder compose a founder response grounded in facts they supplied. A single message may answer both investors. Ask for missing facts rather than fabricating traction, revenue, customers or test results. You are drafting founder input, not pretending to be an investor.
4. If agent control is enabled and the coder has authorized the work, write the draft to a temporary text file and run `npm run agent:suggest -- --file PATH --author "YOUR_AGENT_LABEL"`. The approved live app automatically handles submission, scoring and sequential voice playback. There is no need to type into the browser or ask the coder to approve each message again.
5. Read `npm run agent:wait -- --id ID`, or `agent:result`. Report only the actual returned investor replies, scores and concerns. Do not synthesize or claim an investor response yourself. If everyone passes, report silence accurately.
6. Stop autonomous submissions when `autoSend` is false. The coder typing or starting voice pauses agent control. Do not programmatically resume it, copy browser cookies, bypass a pause, or retry rejected/stale jobs as fresh paid rounds. A pending draft can be reviewed by the coder in the app.
7. After a completed result, read updated context before another proposal. Use a new request ID for a new approved founder message. Only one waiting proposal is allowed. Respect the requested number of rounds; do not run an endless paid loop.
8. On 409, refresh context and reconsider the draft. On failed results, do not retry automatically. On 401/410, stop and have the coder reconnect if they want to continue. Reset/Leave/Disconnect revoke the old token.

Use `npm test` and `npm run test:bridge` for free checks. `npm run test:bridge:live -- --audio` consumes credits. The server-generated results must preserve the at-most-two-ordinary-replies rule, with all newly-zero investors receiving priority farewells outside that limit, and independent concern scoring documented in [TWO_INVESTOR_ROUNDS.md](../docs/TWO_INVESTOR_ROUNDS.md).

This CLI connects to the app, not directly to ElevenLabs. It shares the live call's backend context and does not require the coding agent to receive the ElevenLabs API key. Another coder's app on another machine is a separate connection; localhost addresses cannot be reached from an unrelated cloud session.

When every investor has zero confidence, the call is complete. The app plays all farewells, removes tiles sequentially and pauses agent control. Preserve the transcript and wait for the coder to reset; do not keep proposing inputs to an empty panel.
