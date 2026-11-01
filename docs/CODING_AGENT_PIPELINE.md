# Coding agent collaboration pipeline

Owner: Arjun Behl
Date: November 1, 2026
Branch: `test/investor-integration`

## What is connected

A coder can approve their existing coding agent once in the live app. That agent can then propose founder replies from its terminal tools; the app automatically submits them into the same investor conversation and plays the investors' real replies. The coding agent reads those results back through the connection. It does not impersonate investors or generate their dialogue locally.

```text
Coder approves connection once in the app
                  |
Coding agent reads current questions, scores and recent conversation
                  |
Coding agent sends a founder suggestion through the CLI
                  |
Live app receives it and submits when the current audio is finished
                  |
Existing ElevenLabs panel evaluates it, at most two investors reply
                  |
App displays scores and plays voices; CLI receives the same panel result
```

The existing two-investor cap, per-investor concern memory and confidence deductions still apply. There is one browser-owned conversation, not a second session created by the coding agent. The connection is an HTTP/CLI interface usable by Claude Code, Codex or another coding agent that can run terminal commands. It does not install an IDE extension or automatically discover another person's running agent.

## Coder setup

1. Fetch `origin` and switch to `test/investor-integration`, then run locally with the existing ignored `.env`: `npm run dev`. Open http://127.0.0.1:5173 and start a call.
2. Expand **Coding agent collaboration** and click **Allow coding agent**. This is the initial approval for automatic founder replies.
3. Click **Copy connection**. Give that private JSON to the coding agent working with you, or save it outside Git, for example `/tmp/verdict-connection.json`.
4. In the same checkout, connect the terminal client:

```sh
npm run agent:connect -- --file /tmp/verdict-connection.json
npm run agent:context
```

The CLI writes `.verdict-agent.local.json` with mode 0600. It is ignored by Git. The connection contains a revocable app token, not the ElevenLabs key. Do not paste it into an issue, public chat, commit or terminal command argument. Keep it available only to the intended coding agent.

Give your coding agent this instruction:

> Read AGENTS.md and agents/CODING_AGENT_HANDOFF.md. Connect using the private connection file I supplied. Use the current live-app context to help draft founder answers, and send them through agent:suggest. I approved agent control in the app. Let the actual investors reply, then read and report their results. Respect Pause/Disconnect and do not invent business facts or investor responses.

Each coder can run their own local call and pair their own agent. A cloud coding agent cannot reach a laptop's `127.0.0.1`; this change does not expose the app publicly or deploy the separate Render server. Connecting across machines requires an appropriately hosted HTTPS app with this API and its session routing. Do not expose port 8787 publicly as a shortcut. The current verified scope is the local root launcher and its existing Vite proxy.

## Chat, voice and takeover

- After initial approval, new agent suggestions run automatically when the app is open, active in the call, and ready for the next founder turn. No approval is required for every suggestion.
- Typing in the pitch field or starting the microphone immediately pauses agent control. The coder can then chat or speak using the existing flow. A committed human reply makes an older pending agent suggestion stale.
- **Pause agent** stops future automatic submissions. The current investor evaluation or audio can finish. **Skip reply** still interrupts current playback.
- While paused, the suggested text stays visible and the coder can click **Send suggestion to investors** or **Dismiss suggestion**.
- **Resume agent** re-enables automatic submission, including a still-pending suggestion. Starting voice again pauses it.
- **Disconnect agent**, Reset and Leave revoke the token and cancel waiting suggestions. A new call requires another initial approval. Investor audio still uses one player, and microphone capture is paused during investor turns.

The bridge does not add talk-over or simultaneous user/investor speech. Chat and voice become available between investor rounds, as before. The human can always pause agent control during a round to reserve the next turn.

Keep the live app open. If the page is closed, no browser is there to submit or play a queued suggestion. Connection state expires after 30 minutes without browser activity. Agent polling alone does not prolong it. The underlying investor conversations retain their existing two-minute idle timeout; after that, a submitted message may begin a fresh pitch at 50, with the existing expiry notice in the app.

## Coding agent commands

```sh
# Read current scores, lastResult, unanswered concerns and last 10 public rounds:
npm run agent:context

# Write grounded founder text to a file, then send a suggestion:
npm run agent:suggest -- --file /tmp/founder-reply.txt --author "My coding agent"

# The previous command prints a suggestion ID. Read its actual outcome:
npm run agent:wait -- --id THE_SUGGESTION_ID --timeout 180
npm run agent:result -- --id THE_SUGGESTION_ID
```

`--text TEXT` is also available for short messages, but a file avoids shell-quoting problems. `--config PATH` overrides the private connection-file location. `--request-id UNIQUE_ID` supplies an idempotency key for a suggestion. Reusing that ID with identical input retrieves the existing job; it never starts another investor round. Reusing it with different text, author or revision returns 409.

The agent should read context before each proposal and use `lastResult.responses[].pendingConcern` to address each investor's actual doubts. The CLI attaches the latest conversation revision. If the coder spoke or another request changed the conversation, stale suggestions are rejected or marked stale. There is at most one waiting suggestion per call. A completed job can be read again without paid requests.

Job states: `pending`, `running`, `completed`, `failed`, `rejected`, `stale`, `cancelled`. Completed jobs contain the panel's real `result`, including public replies, `speakingOrder`, confidence and concern assessments. Completion means text generation finished; the app may still be playing audio, represented by `ready: false` in context. Another draft can wait, but the app will not submit it before playback ends.

Only the app's owner cookie can approve, dismiss, pause, resume or execute its suggestion. An agent token can read context, send a suggestion and read jobs. It cannot manufacture a result or request arbitrary speech text/voice IDs. An agent never receives the browser cookie or ElevenLabs key.

No autonomous LLM loop is started inside this server. The coder's existing agent decides what to propose and invokes these tools. Work within the user's requested testing scope; do not run an unbounded paid loop. Failed jobs are not automatically retried. After a failure, inspect context and ask the coder how to proceed when additional business facts are needed.

## API contract

Browser routes use the HttpOnly `verdict_room` cookie plus the existing investor session cookie:

| Route | Purpose |
| --- | --- |
| POST `/api/agent-bridge/connect` `{}` | Initial approval, rotate token, enable automatic control |
| GET `/api/agent-bridge/session` | Poll connected state and pending suggestion |
| POST `/api/agent-bridge/mode` `{autoSend}` | Pause/resume automatic control |
| POST `/api/agent-bridge/reject` `{id}` | Dismiss a pending suggestion |
| POST `/api/agent-bridge/ready` `{revision}` | Playback finished for this revision |
| POST `/api/agent-bridge/disconnect` `{}` | Revoke connection token |
| POST `/api/evaluate` | Existing pitch request, optionally with `bridgeJobId` and `bridgeAuto` |

Agent routes require `Authorization: Bearer TOKEN`:

| Route | Purpose |
| --- | --- |
| GET `/api/agent-bridge/context` | Read revision, scores, recent public history and pending concerns |
| POST `/api/agent-bridge/suggest` | Send `{pitch, author, revision, requestId}` |
| GET `/api/agent-bridge/job?id=ID` | Read suggestion state and actual result |

Pitch limit is 4,000 characters; author is 1-80 characters; requestId is 8-100 letters, digits, `_` or `-`. Room history is bounded to 10 rounds, 100 jobs per connection, and 16 rooms per server. Restart clears in-memory connections. Browser-origin checks and same-origin proxy behavior remain in place. CLI refuses non-local plain HTTP URLs and redirects to avoid sending the token elsewhere.

## Testing without computer use

```sh
npm test
npm run test:bridge
npm run build

# Explicitly uses ElevenLabs credits and optionally validates real audio:
npm run test:bridge:live -- --audio --out /tmp/verdict-bridge-live.json
```

The bridge smoke starts a temporary API, creates one synthetic browser approval, invokes the actual CLI as a separate process, sends a founder draft, acts as the approved browser to consume it, and verifies turn 2 comes from the same panel session. It then reads the result through the CLI and verifies disconnect revokes access. Offline mode uses explicit provider fixtures; live mode uses the configured isolated ElevenLabs branches. The test cleans up temporary tokens and conversations afterward.

UI-controller tests run without a browser using small DOM/event adapters. They cover automatic submission after approval, waiting for busy playback, safe text rendering, human takeover during an in-flight pause, and reset during a pending poll. HTTP tests cover ownership, revisions, idempotency, stale drafts, failure handling and revocation. Existing tests cover microphone pause/resume and exclusive voice playback.

These tests avoid routine computer use. They do not replace an occasional real-browser check of microphone permission, clipboard access or device audio.

## Validation and delivery

- 50 automated tests pass, including the new UI-controller and HTTP bridge checks.
- The TypeScript/Vite production build passes. The existing browser-SDK chunk-size warning remains non-fatal.
- The free smoke test runs the actual CLI as a separate process and verifies it cannot read context after disconnect.
- The live smoke used the configured real ElevenLabs test branches. The CLI read the first round's concerns, submitted a synthetic founder answer, and received turn 2 from the same panel session with scores 60/60/50/50. Both addressed concerns were resolved. Two actual audio streams were fetched successfully.
- Synthetic live evidence: [test-results/coding-agent-bridge.json](test-results/coding-agent-bridge.json). No connection token or provider credential is in that file.
- The local app was restarted with the bridge at http://127.0.0.1:5173. These checks used no computer automation. Device microphone/clipboard behavior still depends on the browser and its permissions.

The implementation and agent handoff are on `test/investor-integration`; no main merge or production deployment is included.
