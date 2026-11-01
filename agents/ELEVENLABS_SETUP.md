# ElevenLabs setup and private key handoff

Owner: Arjun Behl
Updated: November 1, 2026

This is the current setup for Investor Verdict. Older text-only setup notes are historical. The implementation and detailed contracts are in [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md).

**Setting up another account? Start with [New-account setup and manual fallback](#new-account-setup-and-manual-fallback).** The saved IDs below belong to the original account. Reading this document or exporting its prompts does not create agents in your account.

## New-account setup and manual fallback

Use this section when a coding agent only describes the setup, cannot discover the correct MCP tools, connects to the wrong account, or cannot save the settings. There are two separate logins: the ElevenLabs MCP connection and the server's `ELEVENLABS_API_KEY`. Changing the key in `.env` does not switch the MCP workspace. The destination account must own, or have access to, all four newly configured agents.

### Copy this instruction to your coding agent

> Set up Investor Verdict in my destination ElevenLabs account. Read `agents/ELEVENLABS_SETUP.md`, `agents/elevenlabs-agent-snapshot.json` and `agents/prompts/two-investor-rounds.md`. Actually create/configure the four investors and verify them, rather than only updating documentation. First establish which account the MCP connector is using; stop remote mutations if it is the original or wrong account, and tell me how to reconnect to the destination account. Discover the available tools and their schemas. List existing agents first and reuse only confirmed agents for this app so retries do not create duplicates. Use the snapshot as a behavior reference, never as a request to reuse its agent, branch, version or tool IDs. On a fresh account, the simplest supported path is four dedicated agents with the complete app prompt on each MAIN branch; branches are optional. Set the model, voices, authentication, text-only override and completion events described below. If preserving the legacy scoring tool, recreate its schema in this workspace and attach the NEW tool ID. Read back every saved setting. Store the new four agent IDs and destination key privately in the local/server environment, preserve other values, and configure the correct branch file. Never print credentials or signed URLs. Verify that the app's server key can read these agents and obtain signed URLs without starting conversations, then run the free local checks. Report the new non-secret IDs, selected branches, verified settings and any untested live behavior. If MCP cannot do this correctly, give me the manual fallback below and identify the exact unfinished step; do not claim setup succeeded.

Tool discovery matters: on the connector used for this snapshot, `agents_update` only changes metadata. System prompts, models, voices, authentication and conversation settings use separate `agents_update_*` tools. Read each current schema instead of guessing arguments or treating a rename as configuration. An error or missing tool is not evidence that a setting was saved.

### Manual fallback: create four dedicated agents in your account

1. Sign in to the destination ElevenLabs account and open ElevenAgents. Create four blank agents named `Investor Verdict - Technical Expert`, `Investor Verdict - Market Signals Researcher`, `Investor Verdict - Interrogator`, and `Investor Verdict - Sympathizer`. If matching agents already exist for this app, inspect them before creating duplicates. Use their **Main** branches for this fresh-account path. Leave unrelated agents alone. The [official quickstart](https://elevenlabs.io/docs/eleven-agents/quickstart/) describes blank-agent creation and the Agent tab.
2. Export the four complete app prompts with the command below, run from this repository's root. It only writes a new temporary folder on the computer running the command. It makes no network requests, reads no key and creates no remote agents. On a remote coding machine, have the coding agent provide the generated text files for download. For each agent, open its corresponding `.prompt.txt` file, copy the whole file into **System prompt**, and save. Do not paste the JSON snapshot itself or stop at the role paragraph: the complete prompt ends with the v2 assess/speak rules.

```sh
node --input-type=module <<'JS'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const snapshot = JSON.parse(readFileSync('agents/elevenlabs-agent-snapshot.json', 'utf8'));
const directory = mkdtempSync(join(tmpdir(), 'investor-verdict-setup-'));
for (const entry of snapshot.agents) {
  const branch = entry.branches.find(item => item.name === 'test-two-investor-followups');
  if (!branch?.agent.prompt.prompt.includes('PANEL TURN PROTOCOL V2')) throw new Error('Missing v2 prompt.');
  const filename = entry.name.replace('Investor Verdict - ', '').toLowerCase().replaceAll(' ', '-');
  writeFileSync(join(directory, `${filename}.prompt.txt`), branch.agent.prompt.prompt);
  writeFileSync(join(directory, `${filename}.settings.json`), JSON.stringify({
    first_message: branch.agent.first_message, language: branch.agent.language,
    llm: branch.agent.prompt.llm, temperature: branch.agent.prompt.temperature,
    max_tokens: branch.agent.prompt.max_tokens, voice_id: branch.tts.voice_id,
    tts_model: branch.tts.model_id, client_events: branch.conversation.client_events,
    requires_auth: branch.requires_auth, text_only_override: true,
    legacy_client_tool_schema: branch.agent.prompt.tools.find(tool => tool.name === 'report_investor_interest'),
  }, null, 2));
}
writeFileSync(join(directory, 'main-branches.json'), '[]\n');
console.log(`Copy-ready prompts and settings are in: ${directory}`);
JS
```

3. Match each agent's first message, English language, model (`deepseek-v41-flash`), temperature (`0.3`), token limit (`600`) and voice to its exported `.settings.json`. Only the researcher has an opening message. Choose Alice for Researcher, Will for Technical Expert, George for Interrogator and Sarah for Sympathizer using the voice IDs in the table below. If the destination account cannot use a model or voice, record that limitation and select an available replacement deliberately; do not report exact parity. A voice change must also update `INVESTOR_VOICES` in `agents/server/reply-audio.mjs`, because the app synthesizes replies separately. A replacement TTS model must also be reflected in `agents/server/index.mjs` and `deploy/server.js`.
4. Enable authentication in the agent's Security settings (`platform_settings.auth.enable_auth: true`). Allow the text-only conversation override (`platform_settings.overrides.conversation_config_override.conversation.text_only: true`). Preserve the exported client events, especially `agent_response_complete`, in the conversation configuration. Keep the default maximum duration at 600 seconds. If the dashboard does not expose a required setting, ask the coding agent to set that exact field using the official API/SDK against your new agent and read it back. Do not skip it. See [authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication) and [client events](https://elevenlabs.io/docs/eleven-agents/customization/events/client-events).
5. For exact compatibility with the saved default conversations, create a **client** tool named `report_investor_interest` in the destination workspace using the exported `legacy_client_tool_schema`, then attach that new tool to each agent. It expects a response, has a 10-second timeout, and requires integer `turn_number`, integer `confidence`, and string `reason`. Do not copy the original `tool_...` ID or make a webhook tool. The v2 app does not call this tool for scoring; its structured assessment is authoritative. If you intentionally omit this legacy tool for a v2-only setup, document the difference and test using v2 packets, not ordinary dashboard chat.
6. Save the configuration on each new agent's Main branch, then copy the four **new agent IDs** into your local `.env` or the hosting service's private environment editor. Preserve all other settings. Use a destination-account API key with access to those agents, TTS and real-time Scribe. Never put the key into a prompt, Git, browser source or a `VITE_` variable. The IDs map as follows:

```dotenv
# Set actual values in the private environment, not in this documentation.
ELEVENLABS_API_KEY=<destination-account-key-entered-privately>
ELEVENLABS_AGENT_ID_TECH_BRO=<new-technical-expert-agent-id>
ELEVENLABS_AGENT_ID_CTO=<new-market-signals-researcher-agent-id>
ELEVENLABS_AGENT_ID_INTERROGATOR=<new-interrogator-agent-id>
ELEVENLABS_AGENT_ID_SYMPATHIZER=<new-sympathizer-agent-id>
```

7. For these dedicated v2 Main agents, use an existing JSON file containing `[]` as the branch mapping. Copy the exported `main-branches.json` to a stable location on the server, then set `ELEVENLABS_PANEL_BRANCHES_FILE` to its absolute path. Do not leave it pointing at a temporary folder for deployment. The provider reads this file at startup, then intentionally uses Main for IDs with no mapping. A missing or invalid JSON file fails startup; a stale mapping that matches an agent can select the wrong branch. If you prefer isolated app branches, create new branches in the destination account and put their actual `{ "agentId": "...", "branchId": "..." }` pairs in this file instead of `[]`.
8. Restart the local server or redeploy with the updated private environment. Start a **new pitch**, since existing sessions keep their old agent connections. Keep `PORT=8787` and `APP_ORIGIN=http://127.0.0.1:5173` for the standard local setup. Follow the normal install/start steps below.

### Proof required before calling setup complete

The coding agent should return a non-secret table containing each role, its new agent ID, Main or its explicit new branch ID, and read-back results for the full v2 prompt, model, voice, authentication, text-only override and `agent_response_complete`. It should use the **server key** to verify access to those same agents and signed-URL creation, discard signed URLs without logging them, and keep configuration checks separate from paid conversation checks. A successful MCP read in another account does not prove the server can connect.

Run `npm test`, `npm run build` and `npm run test:panel` for free local checks. They use fixtures and do not prove that the destination account works. For a live check, deliberately start a fresh app call in the destination account, submit a short pitch, and verify private scoring plus no more than two ordinary public replies, followed by a relevant answer and a request for thinking time. Scores must start at 50, change only from validated substantive assessments, and stay unchanged for the thinking-time control. Verify microphone and spoken replies separately if needed. This consumes provider credits. The new account is not live-validated until an actual app round succeeds; ordinary dashboard conversation is not a test of the v2 packet contract.

| Symptom | What to check next |
| --- | --- |
| Only a Markdown file changed, no new agents visible | Setup was not performed. Follow the manual creation steps or give the coding agent the instruction above. |
| MCP lists the original account, but the app uses a different key | Reconnect MCP to the destination account or use the dashboard/API there; changing `.env` does not switch MCP. |
| Unauthorized, forbidden, or agent not found | Check destination key permissions and all four new IDs. Never substitute an old account's agent ID. |
| Connection opens but replies are prose, bids only, or scores never change | Inspect the selected branch's saved prompt for the complete v2 suffix. Main fallback does not install a prompt. |
| Text arrives but the turn hangs | Verify `agent_response_complete` is enabled and emitted; do not treat partial text as a finished assessment. |
| Researcher has no opening greeting | The current backend waits up to 10 seconds, then proceeds. Check the first actual pitch round before treating this as a fatal error. |
| Text works but audio fails or uses the wrong voice | Check destination voice/model access and the separate server TTS mapping; agent voice settings alone do not change it. |
| No two-speaker round on a fresh account | Check available conversation concurrency for four persistent agent sessions, as well as protocol validation. |

If setup still fails, report the exact unfinished setting or sanitized error and keep the working IDs/configuration. Do not repeatedly create replacement agents, silently switch to mock scoring, or mark a failed live test as passed.

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

The CTO/TECH_BRO environment names are legacy aliases; use the mapping above. Exact app branch IDs live in [panel-test-branches.json](panel-test-branches.json). [panel-provider.mjs](server/panel-provider.mjs) passes the matching `branchId` when obtaining a signed URL. A missing mapping currently falls back to main with a log message; see the MCP-verified specification below before relying on that fallback.

For a different ElevenLabs account, create equivalent agents and app branches, apply the local v2 protocol after each role's base prompt, and update both the four environment IDs and the branch mapping. `ELEVENLABS_PANEL_BRANCHES_FILE` can point to a different mapping file. Preserve the final-response-completion event used by the SDK. Start a new call after changing provider prompts or environment settings.

## MCP-verified agent specification for coding agents

Verified November 1, 2026 using ElevenLabs MCP `agents_list`, `agents_list_branches`, `agents_get` for all eight branch configurations, and `agents_get_tool`. This is a configuration read-back, not a new live conversation test. No remote settings were changed.

Read this section before implementing. The machine-readable [agent snapshot](elevenlabs-agent-snapshot.json) contains exact main/app prompts, branch and version IDs, tool schemas, voices, model settings, events and allowed overrides. It excludes credentials, signed URLs and account-owner metadata. It is a dated reference, not an automatically loaded runtime configuration. The existing [visuals configuration](../visuals/confidence/elevenlabs-config.json) alone is insufficient to reconstruct the current app protocol.

### Identity, personality and visual mapping

| App role | Legacy environment suffix | UI title | Voice name / verified voice ID | UI portrait in `visuals/investors/` |
| --- | --- | --- | --- | --- |
| `technical_expert` | `TECH_BRO` | The CTO | Will / `bIHbv24MWmeRgasZH58o` | `02_technical_expert_zoom.png` |
| `market_signals_researcher` | `CTO` | The VP | Alice / `Xb7hH8MSUJpSbSDYk0k2` | `01_market_signals_researcher_zoom.png` |
| `interrogator` | `INTERROGATOR` | The Interrogator | George / `JBFqnCBsd6RMkjVDRZzb` | `03_interrogator_zoom.png` |
| `sympathizer` | `SYMPATHIZER` | The Sympathizer | Sarah / `EXAVITQu4vr4xnSDxMaL` | `04_sympathizer_zoom.png` |

The full environment names are `ELEVENLABS_AGENT_ID_<suffix>`. Voice names come from the repository's existing mapping; voice IDs were verified by MCP. Portraits and UI titles are application assets, not remote ElevenLabs avatar configuration. Do not infer investor identity from the confusing legacy `CTO` suffix.

- **Market Signals Researcher:** observant, analytical, curious, mildly skeptical. Tests customer segments, urgent pain, interviews, buying behavior, retention, competition, timing and bottom-up demand. Rewards first-hand validation; challenges unsupported market size. Does not demand mature-company metrics from a prototype or take over technical architecture questions.
- **Technical Expert:** practical, inquisitive, slightly dry, approachable. Separates working features from plans; probes architecture, data access, reliability, latency, compute costs, security, dependencies and feasible milestones. Accepts honest prototype limits and sensible tradeoffs. Avoids trivia and elaborate stack prescriptions.
- **Interrogator:** composed, direct, skeptical, respectful. Tests consistency, pricing, unit economics, traction definitions, funding use and defensibility. Uses the founder's actual earlier claims and asks one precise question. Accepts evidence; does not invent objections or use arbitrary harsher scoring.
- **Sympathizer:** warm, empathetic, encouraging, discerning. Tests customer empathy, founder insight, clarity, learning speed, resilience and practical next steps. Helps clarify without answering for the founder. Does not confuse confident delivery with business merit or give empty praise.

All four are fictional investors, have no research/browsing tools, and must distinguish evidence from assumptions. Do not fabricate traction or promise real investment. The researcher alone has a configured opening: "Let's start with the market. Who urgently needs this, and what have you seen that proves the demand?" The other three have an empty first message. The backend treats a missing researcher greeting as best effort after 10 seconds.

### Main versus the explicitly selected app branches

Each agent has a `Main` branch receiving 100% of default traffic and a `test-two-investor-followups` branch receiving 0% of default traffic. The app nevertheless reaches the latter by passing its explicit `branchId` to signed-URL creation. Zero default traffic does not mean the app branch is unused.

| Investor | Explicit app branch ID | MCP-verified app version ID |
| --- | --- | --- |
| Sympathizer | `agtbrch_1901m6c87cr6f8nvp7yddsneaekm` | `agtvrsn_9801m6cf9xwsew3tz04hrrkfm376` |
| Interrogator | `agtbrch_4401m6c87bbnecqvbphez1vf18tv` | `agtvrsn_9501m6cf9vgje1n9k4xj9apkkfrk` |
| Technical Expert | `agtbrch_2701m6c878nzf88rb2z213by95b6` | `agtvrsn_6301m6cf9q3ef0c83y98r7fx8dhr` |
| Market Signals Researcher | `agtbrch_7401m6c879ztf50twjghqbsm9bt5` | `agtvrsn_6301m6cf9rqmea0b5afv0572s215` |

[panel-test-branches.json](panel-test-branches.json) matches these four app branches. Exact main branch/version IDs are in the snapshot. Each app prompt is exactly its current main prompt plus the local [two-investor-rounds.md](prompts/two-investor-rounds.md) suffix, verified for all four.

**Protocol precedence matters:** main contains the base conversational rubric plus `investor_panel_v1`. The app branch appends `investor_panel_v2`, which overrides earlier instructions only for v2 packets. Main uses the `report_investor_interest` client tool and can make 5-point adjustments. The current v2 application instead consumes structured deltas, enforces meaningful changes of at least 10, and must not score through that tool.

**Current fallback behavior:** [panel-provider.mjs](server/panel-provider.mjs) logs once and connects to main if the configured agent ID lacks a branch mapping. It does not fail closed. The four MCP-verified main prompts do not contain v2, so removing their mappings can connect successfully while violating the app's response contract. For replacement agents in another account, either create/map a v2 branch or deliberately configure their main prompt with the role and v2 protocol before using fallback. Do not copy these account-specific branch IDs onto unrelated agents.

### Shared remote settings

All eight inspected configurations agree on:

| Setting | Verified value |
| --- | --- |
| LLM | `deepseek-v41-flash`, standard tier, temperature `0.3`, max tokens `600` |
| Language | `en` |
| Authentication | `platform_settings.auth.enable_auth: true` |
| TTS | `eleven_v4_turbo`, expressive mode, `pcm_16000`, speed `1`, stability `0.5`, similarity boost `0.75` |
| ASR | `scribe_realtime`, high quality, input `pcm_16000` |
| Turn settings | `turn_v3`, normal eagerness, 7-second turn timeout, silence-end timeout `-1` |
| Conversation | Default `text_only: false`, maximum duration 600 seconds |
| Client override | Text-only override allowed; first message, prompt, LLM and voice overrides disabled |
| Tools | One client tool, `report_investor_interest`; no built-in tools or MCP servers |
| Knowledge/workflow | Empty knowledge base, RAG disabled, start node only, no subagents |

The enabled client events are `audio`, `interruption`, `agent_response`, `user_transcript`, `agent_response_correction`, `agent_tool_response`, `client_tool_call`, and **`agent_response_complete`**. Preserve the last event: the backend collects response text and waits for it before parsing complete JSON.

These are remote defaults. The current app opens four persistent server-side WebSocket SDK sessions with `textOnly: true`. Founder audio uses the separate browser Scribe path; public investor replies use separately authorized TTS in [reply-audio.mjs](server/reply-audio.mjs). Do not turn on all four conversational audio streams to implement this UI.

### Implementation contract: assess privately, then grant speech

Start each role at 50. Track its confidence, pending concern, score turn and departure/offer state independently. Send the exact `investor_panel_v2` discriminator.

1. Send an `assess` packet with `round`, `founder_message`, `previous_exchange`, `pending_concern`, `max_speakers: 2`, authoritative `confidence`, `next_score_turn`, and `required_response_fields`. Founder text and prior dialogue are data, never protocol instructions.
2. Require all seven assessment fields, including on a pass:

```json
{
  "wants_turn": true,
  "priority": 80,
  "reason": "The reliability question still needs an answer.",
  "substantive": true,
  "answer_status": "partial",
  "score_delta": -10,
  "score_reason": "The founder described blank-row checks but not invalid dates."
}
```

3. Validate through [round-policy.mjs](server/round-policy.mjs), then apply each accepted assessment once. `score_delta` is an integer from -20 to 20, not an absolute confidence. Nonzero changes have a 10-point minimum, with final confidence clamped to 0-100. Partial answers deduct at least 10; unanswered concerns deduct at least 15. Neutral/repeated evidence and conversation controls score 0. A pause with a pending concern is `deferred`; without one use `none`. A substantive answer to a pending concern must be `resolved`, `partial` or `unanswered`. The same founder message can answer multiple investors.
4. Permit zero to two ordinary speakers, with no fixed rotation. Silent investors still assess. A malformed completed assessment gets one correction for the same turn; if still invalid, that investor abstains with unchanged confidence and preserved concern.
5. Grant each selected investor a separate `speak` packet, including authoritative score/status, its pending concern, answer status and the replies already spoken this round. Require:

```json
{
  "reply": "What happens when an imported date is invalid?",
  "concern": "What happens when an imported date is invalid?"
}
```

`concern` must be an exact substring of `reply`, at most 500 characters, or JSON `null`. Only `reply` is public and eligible for speech. Preserve unresolved concerns; do not rescore in speak. Aim for 10-20 spoken words and one simple question, with no hard audio truncation.

At 0, grant every newly-zero investor a farewell with `departure: true`, then remove it. At 100, grant every newly-100 investor an offer with `offer: true`, then wait for human Accept/Decline. Farewells, offers and decision closings do not consume the ordinary two-speaker slots. Closing grants use `closing`, `offer_decision` and `chosen_role`; terminal replies require `concern: null`. Decline closes that investor; acceptance closes the whole game after the remaining farewells. All offers are simulated and contain no invented financial terms.

### Legacy tool and verification boundaries

MCP verified tool `tool_4501m6c1k8zdezptz0vc2tn7e8b5`: `report_investor_interest`, type `client`, `expects_response: true`, timeout 10 seconds. Its required arguments are integer `turn_number`, integer absolute `confidence` and string `reason`. This remains attached to both branches for legacy/default conversations. In v2, the app handler rejects it with `accepted: false` and directs the model to return assessment JSON. Do not apply a tool score as well as a v2 delta.

For an implementation, reuse [text-panel.mjs](server/text-panel.mjs), [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) and [the exact v2 prompt](prompts/two-investor-rounds.md). Keep signed URLs and API keys server-side. Use free `npm test`, `npm run build` and `npm run test:panel` checks before any deliberately requested live test. This read-back confirms configuration and local prompt parity, not current live audio quality, replacement-account access or hosted deployment behavior.

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
