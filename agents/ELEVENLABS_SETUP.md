# ElevenLabs setup and private key handoff

Owner: Arjun Behl
Updated: November 1, 2026

This is the current setup for Investor Verdict. Older text-only setup notes are historical. The implementation and detailed contracts are in [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md).

## What was set up

- Four persistent ElevenLabs conversational agents: Technical Expert (The CTO), Market Signals Researcher (The VP), Interrogator and Sympathizer. The configured investor intelligence model is `deepseek-v41-flash`.
- Separate app branches for each investor, with the `investor_panel_v2` instructions from [two-investor-rounds.md](prompts/two-investor-rounds.md). These branches are explicitly selected for signed connections; the agents' main prompts and default traffic were preserved.
- Server-side authentication using one `ELEVENLABS_API_KEY`. The browser receives short-lived signed connections or speech-to-text tokens, never the API key.
- Private text-only assessments and public speech grants. Investors bid dynamically; normally at most two speak. Scores start at 50 and meaningful changes are 10-20 points. Incomplete answers lose at least 10, unanswered concerns at least 15, and pauses do not change scores.
- Real-time founder transcription through Scribe `scribe_v2_realtime`, with voice activity detection. The microphone pauses during investor replies to avoid submitting their audio as founder input.
- Sequential investor speech through `eleven_v4_turbo`. The backend synthesizes only a granted public reply; private bids and scoring explanations are never spoken. Voices are mapped in [reply-audio.mjs](server/reply-audio.mjs).
- Mandatory farewells at zero and mandatory offers at 100, both outside the ordinary two-speaker cap. A decline gives that investor a goodbye and removes it. Acceptance gives the chosen investor and everyone still present closing statements, then ends the game.
- Human-owned Accept/Decline buttons, animated departures, a constant-size call area, and automatic founder exit after the final statement/effect.
- Bounded format correction for incomplete assessments or wrong-format speech. Scores are not applied twice. A malformed assessment that cannot be corrected makes that investor sit out unchanged; repeated invalid speech fails explicitly.
- A CLI bridge so an approved coding agent can submit founder suggestions without browser automation. That bridge has its own temporary connection token, separate from the ElevenLabs key. It cannot make the human's offer decision.

OpenAI `gpt-6.1-terra` at medium reasoning supplies the optional founder suggestion cards. It uses a separate `OPENAI_API_KEY` (the local `openai_key` spelling is also supported). It does not decide investor scores. Investor/voice requests use ElevenLabs credits; founder suggestions use the OpenAI API.

## Agent IDs and branches

The IDs below are configuration identifiers already present in the repository, not API credentials. The account/key must have access to these agents.

| UI title | Investor | Environment variable | Configured agent ID |
| --- | --- | --- | --- |
| The CTO | Technical Expert | `ELEVENLABS_AGENT_ID_TECH_BRO` | `agent_9801m6c1mv71e4dr3qjq5ztk524m` |
| The VP | Market Signals Researcher | `ELEVENLABS_AGENT_ID_CTO` | `agent_4601m6c1gyd6e3fbs0k07r30r4k7` |
| The Interrogator | Interrogator | `ELEVENLABS_AGENT_ID_INTERROGATOR` | `agent_5201m6c1mwkgejk83byf18qwp79j` |
| The Sympathizer | Sympathizer | `ELEVENLABS_AGENT_ID_SYMPATHIZER` | `agent_4101m6c1my0bfge9cwscnp9gv2p0` |

The CTO/TECH_BRO environment names are legacy aliases; use the mapping above. Exact app branch IDs live in [panel-test-branches.json](panel-test-branches.json). [panel-provider.mjs](server/panel-provider.mjs) passes the matching `branchId` when obtaining a signed URL. A missing mapping fails instead of silently connecting to an agent's main branch.

For a different ElevenLabs account, create equivalent agents and app branches, apply the local v2 protocol after each role's base prompt, and update both the four environment IDs and the branch mapping. `ELEVENLABS_PANEL_BRANCHES_FILE` can point to a different mapping file. Preserve the final-response-completion event used by the SDK. Start a new call after changing provider prompts or environment settings.

## Start locally

Use Node 22.6 or newer. From the repository root:

```sh
npm ci
npm --prefix frontend/confidence-panel ci
```

Preserve an existing `.env`. On a new checkout only:

```sh
if [ ! -e .env ]; then
  (umask 077; cp .env.example .env)
fi
chmod 600 .env
git check-ignore .env
```

In your local editor, set `ELEVENLABS_API_KEY` and replace the four placeholder IDs with the correct account's IDs. Keep `PORT=8787` and `APP_ORIGIN=http://127.0.0.1:5173` for the default local launcher. The key must support the configured agents, real-time Scribe token creation and text-to-speech calls.

```sh
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the loopback backend. Start a fresh call, then send text or enable the microphone. In deployment, set the same credentials in the hosting service's private environment settings. The Render adapter includes offer and coaching routes, but local tests do not certify a hosted deployment or its environment configuration.

## Instructions for a coding agent: give the user their key through the clipboard

When the user requests this key handoff, use the existing authorized project's `.env` as the source. Copy only `ELEVENLABS_API_KEY`, not the whole file. The user can then paste it into their password manager, a local environment editor, or their hosting service's private environment field.

1. Confirm `.env` is ignored by Git and locally private. It may be a symlink shared by this project's worktrees; preserve the existing file and other settings.
2. Run the command below **on the user's Mac**. It reads the value directly from the file and sends it to `pbcopy` through standard input. The key never appears in the command text, process arguments, terminal output or chat.
3. Report only success or failure. Do not print the key to prove that copying worked, and never put it in this Markdown file, a commit, issue, screenshot or frontend `VITE_*` variable.
4. The key remains stored in the ignored `.env`. Let the user paste it into their password manager if they want a separate saved copy. Do not create another plaintext export or overwrite `.env` just to hand it off.

Run from the repository root:

```sh
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

const key = parseEnv(readFileSync('.env', 'utf8')).ELEVENLABS_API_KEY?.trim();
if (!key) throw new Error('No ElevenLabs key is stored in this project .env.');

const copied = spawnSync('/usr/bin/pbcopy', [], {
  input: key, encoding: 'utf8', timeout: 5000,
});
if (copied.status !== 0) throw new Error('Clipboard unavailable; run this command in your local Mac terminal.');

console.log('ElevenLabs key copied to your clipboard without displaying it.');
JS
```

The user can now paste with Command-V. To remove it from the current clipboard after saving it:

```sh
printf '' | pbcopy
```

### If the agent cannot access the user's clipboard

A cloud agent or remote container's clipboard is not the user's local clipboard. Do not claim to have copied the key to the user's computer from there. Give the user the local command above, or these manual steps:

1. Open the project's `.env` in your local editor.
2. Find `ELEVENLABS_API_KEY=` and copy only the value after `=`, excluding any surrounding quotes.
3. Paste it into your password manager or the private environment field where you need it. Keep the project's `.env` in place for the app.

If the key is absent, use the account owner's authorized ElevenLabs key and enter it directly into the local `.env` or hosting service's private environment settings. The repository, an agent ID, a branch ID and a coding-agent connection token cannot recover that secret. Ask the user to enter it locally rather than asking them to post it in chat.

## Verification and tests

Free checks, no microphone or computer automation:

```sh
npm test
npm run build
npm run test:panel
npm run test:offers -- --audio
npm run test:bridge
```

The offline `--audio` streams are fixtures. Actual provider checks consume credits and use separate synthetic sessions, not the user's active call:

```sh
npm run test:panel:live -- --scenario neither --audio --out /tmp/panel-test.json
npm run test:offers:live -- --audio --out /tmp/offer-test.json
```

The current integration passed 99 automated tests, the frontend build, and earlier live offer/decline/acceptance audio tests. Evidence is in [offer-decisions.json](../docs/test-results/offer-decisions.json). No new paid calls are needed merely to read this guide or copy the key.

To connect a coding agent to the actual live app, use **Coding agent collaboration → Allow coding agent → Copy connection** and follow [CODING_AGENT_HANDOFF.md](CODING_AGENT_HANDOFF.md). That copied JSON contains a revocable app connection token, not the ElevenLabs API key. Reset, Leave or a server restart can require a new connection.

## Source map

| File | Responsibility |
| --- | --- |
| `agents/server/panel-provider.mjs` | SDK client, server API key and branch-specific signed URLs |
| `agents/server/text-panel.mjs` | Persistent conversations, private assessments, public grants and offer decisions |
| `agents/server/round-policy.mjs` | Strict response validation and score bounds |
| `agents/server/reply-audio.mjs` | Voice mapping, authorized speech synthesis and per-reply audio cache |
| `agents/server/app.mjs` | Local same-origin API, Scribe token route, cookies and offer/coach routes |
| `frontend/confidence-panel/src/realtime-voice.ts` | Microphone transcription, turn commits and pause/resume |
| `frontend/confidence-panel/src/offer-choices.ts` | Human Accept/Decline buttons |
| `agents/server/agent-bridge.mjs` | Approved coder connection, transcript context and suggestion workflow |
| `deploy/server.js` | Hosting adapter with origin, cookie and rate-limit checks |
