# Investor confidence, Arjun Behl

Owner: **Arjun Behl**, visuals. Updated November 1, 2026.

All four ElevenLabs agents are created and configured. The earlier general pitch-practice agent is now the market researcher, so there is no extra placeholder agent.

| Role | Voice | ElevenLabs agent ID |
|---|---|---|
| Market signals researcher | Alice | `agent_4601m6c1gyd6e3fbs0k07r30r4k7` |
| Technical expert | Will | `agent_9801m6c1mv71e4dr3qjq5ztk524m` |
| Interrogator | George | `agent_5201m6c1mwkgejk83byf18qwp79j` |
| Sympathizer | Sarah | `agent_4101m6c1my0bfge9cwscnp9gv2p0` |

## Current scoring contract

Arjun requested all four investors start at **100**, hold for strong answers, and decline toward **0** as interest is lost. A new pitch resets all four. Confidence here means willingness to continue listening, not a probability of success. It never increases during a pitch. **100 does not trigger an offer. At 0, that investor is out.**

Each agent uses role-specific judgment and reports one score per substantive founder turn, with an evidence-based reason. The rubric is 0, 3, 7, 12, or 20 points lost for, respectively, a credible answer, minor vagueness, a material unsupported claim, repeated evasion or contradiction, and admitted fabrication or confirmed fundamental failure. One penalty at most per turn. An early prototype, honest uncertainty, silence, accent, or delivery style is not itself a reason to lose points.

All four have `report_investor_interest` attached, tool ID `tool_4501m6c1k8zdezptz0vc2tn7e8b5`, with `expects_response: true`. Parameters are `turn_number`, `confidence`, and `reason`. The handler returns the accepted score and next turn number. Score state is maintained by the client, with validation, investor identity bound to the session, duplicate protection, and a terminal zero state. Evaluation remains an LLM judgment, not a deterministic assessment of a business.

Full saved prompts, opening messages, voices, and tool schema are in [elevenlabs-config.json](elevenlabs-config.json). The agent configurations were read back from ElevenLabs and verified after saving. No live voice conversation has been tested yet.

## Handoff to frontend and agents owners

This contribution stays in `visuals/`. It provides the score controller, an importable portrait panel, and public IDs. The existing frontend and the separate agents branch are not wired to this controller yet.

The branch `feat/agents/4-agent-live-system` currently documents CTO / Tech Bro roles, starting scores of 50, and an offer at 100. Update that integration to the four roles above and this 100-to-0 contract before connecting it. Do not combine its existing heuristic scorer or the frontend's random score drift with the new agent reports, or the UI will have competing sources of score updates.

1. Create one `createInterestController()` per new pitch, and mount the panel or subscribe to its snapshots from the existing UI.
2. For each ElevenLabs session, use the matching public agent ID from `INVESTORS`, and register `controller.clientToolsFor(investor.key)` as its `clientTools`. Merge with any other client tools your application needs. The registered name must match exactly.
3. Deliver each completed founder turn to every active investor that should evaluate it. Maintain your existing speech arbitration so four agents do not speak simultaneously. This module does not orchestrate audio or transcribe the microphone.
4. A `subscribe` callback receives `(states, event)`. On `event?.left`, mark that tile out and end or mute only that investor's session after its closing response. Returning the tool result must not be interrupted by immediate session teardown. The score controller itself does not control voice sessions.
5. On disconnect, show connection state separately; do not deduct confidence. Reconnect with the same score and conversation history, or start an explicitly new pitch. On new pitch, end the old sessions, call `controller.close()`, unmount the old panel, and create new sessions and a new controller. Old handlers are invalid after close.

Example for the session owner (inside its existing ElevenLabs session setup):

```js
import { INVESTORS } from './visuals/confidence/investors.mjs';
import { createInterestController } from './visuals/confidence/interest-controller.mjs';
import { mountInvestorPanel } from './visuals/confidence/panel.mjs';
// Also load visuals/confidence/panel.css through the app's stylesheet pipeline.
const controller = createInterestController();
const unmount = mountInvestorPanel(document.querySelector('#investors'), controller);
const investor = INVESTORS[0];
const sessionOptions = {
  agentId: investor.agent_id,
  clientTools: controller.clientToolsFor(investor.key),
};
// Pass sessionOptions to the application's existing ElevenLabs session factory.
// Repeat for each role, using the SAME controller. Keep session handles for cleanup.
```

Client tools require registration in the application, not only the ElevenLabs dashboard. See [ElevenLabs client tool documentation](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools). IDs are public identifiers; never put an API key into browser code. These agents currently use ElevenLabs' default ID-only access; private deployment would need the session owner's server-side authentication setup.

## Preview and checks

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
# Open http://127.0.0.1:8765/visuals/confidence/demo.html
node --test visuals/confidence/interest-controller.test.mjs
```

The demo is explicitly local and simulated. It makes no ElevenLabs calls. It demonstrates all four portraits, scores, reasons, threshold colors, terminal out state, and reset to 100. No Unreal or Blender integration is included.

Validation: all five Node tests passed. Browser checks verified initial 100 scores, an independent decrease to 93, terminal 0 / Out, and reset to 100. [Preview screenshot](preview.jpg).
