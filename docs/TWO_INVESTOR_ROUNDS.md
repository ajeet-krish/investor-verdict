# Two-investor rounds, concern scoring and command-line tests

Owner: Arjun Behl
Date: November 1, 2026
Git branch: `test/investor-integration`

## Current rule

At most **two distinct investors respond per completed founder message**, and only one voice plays at a time. After those replies, the founder gets the floor again. There is no automatic chain of investor replies. The founder can answer both investors in one message, in either order, without having to name them. Each investor evaluates only its own open question. Investors may stay silent, and may bid to follow up after the next founder message. Order remains dynamic rather than a fixed rotation.

This supersedes both the original one-reply limit and the later four-volunteer loop. Scores still start at 50, range from 0 to 100, and change by at most 20 per investor per founder message. Zero and 100 are terminal.

## What happens to unanswered doubts

Each investor has at most one authoritative pending concern, stored as `{text, askedRound}`. It is created only after that investor actually receives a speaking slot, and its text must occur verbatim in the public reply. A volunteer who misses the two-person cutoff cannot create a hidden question the founder is expected to answer.

| Assessment | Meaning | Score behavior | Concern state |
| --- | --- | --- | --- |
| `none` | No pending question from this investor | Normal evidence rubric | No old concern to resolve |
| `resolved` | The answer sufficiently clears this investor's actual doubt | Model proposes evidence-based change, bounded to 20 | Clear the old concern |
| `partial` | Answer attempted but a material part remains unclear, unsupported or unsafe | At least -5, up to -20 | Keep the concern |
| `unanswered` | A completed substantive answer ignores, evades or contradicts this concern | At least -10, up to -20 | Keep the concern |
| `deferred` | Thinking time, quiet request, greeting or microphone problem | 0 | Keep the concern |

The LLM classifies the answer; the server enforces the minimum deduction for partial/unanswered results, even if the model proposes a gain. It applies one net change, not an extra deduction on top of a model change. A new substantive evasion can lose points again, but waiting, playback and a second speech cannot deduct again. Resolved evidence is not automatically rewarded twice. Merely admitting a broken process does not clear the reliability concern or earn an honesty bonus.

An answer to the Technical Expert does not resolve the Market Researcher's doubt. The reverse also holds. Confidence may change even when that investor does not receive a speaking slot. If the investor follows up while its original concern is unresolved, the server preserves that original concern instead of replacing it with an unrelated one. Once resolved, a genuinely new spoken question may create a new concern for the next founder message.

For control messages the model occasionally uses `deferred` despite having no pending question. The server normalizes that harmless combination to `none`, only when `substantive` is false and the proposed change is zero. It does not fabricate a question or discard an existing one. Other invalid classifications fail the round rather than silently guessing scores.

The meaning of an answer is still a model judgment. Passing these scenarios is regression evidence, not a guarantee that every possible pitch is classified correctly. The reported `answerStatus`, score `reason` and `pendingConcern` make such errors inspectable.

## Instruction and implementation files

- `agents/prompts/two-investor-rounds.md`: complete v2 instructions, including two-speaker limit, independent resolution, pauses and honest-but-unresolved gaps.
- `agents/server/round-policy.mjs`: assessment/speech validators, cap constant and minimum deductions.
- `agents/server/text-panel.mjs`: persistent concerns, concurrent private assessments, one score application and at most two sequential speech grants.
- `agents/server/panel-provider.mjs` and `agents/panel-test-branches.json`: signed connections to isolated ElevenLabs test branches.
- `frontend/confidence-panel/src/main.ts`: rejects response lists above two and retains sequential audio playback before returning input to the founder.
- `agents/testing/`: reusable HTTP batch runner, explicit mock provider and synthetic founder scenarios.
- `agents/server/round-policy.test.mjs`: policy, multi-message HTTP and concurrent-submission regression tests.

The backend uses `investor_panel_v2`. Assessments return private JSON with bid, answer status, substantive flag, proposed delta and score reason. Speech returns `{reply, concern}`. The server extracts only `reply` for public text and voice. Direct `report_investor_interest` tool calls are rejected in v2; the backend applies the validated assessment through the existing interest controller. This prevents tool calls and speech from double-scoring one answer.

The response adds `answerStatus` and `pendingConcern` per investor and `maxSpeakers: 2` globally. `speakingOrder` is authoritative; the four-entry response array remains in tile order. The legacy `speaker` field refers only to the first contributor. See [FRONTEND_HANDOFF.md](../agents/FRONTEND_HANDOFF.md) for the full contract.

## Free routine tests, no browser

From the repository root, using Node 22.6 or newer:

```sh
npm test
npm run test:panel
npm run test:panel -- --scenario one --audio --out /tmp/investor-panel-offline.json
npm run build
```

`npm test` includes the deterministic multi-message HTTP scenarios. `test:panel` prints each round's speakers, confidence scores and assertion result. It starts a temporary loopback API on a random port, preserves the session cookie, and closes all sessions afterward. No running development server, microphone, browser or API key is required.

Offline mode uses explicit provider fixtures. It tests orchestration, HTTP contracts, concern persistence, score enforcement and audio-route plumbing, not model intelligence. Its `--audio` bytes are fixtures, not real MP3. The live mode below checks the real agent judgments and optionally real MP3 streams.

Built-in scenarios:

| Name | Sequence |
| --- | --- |
| `both` | Two questions, one founder message answers and clears both |
| `one` | Two questions, answer only one, ignored investor loses confidence and follows up, later answer clears it |
| `neither` | Two questions, evasion, incomplete answers, thinking pause, evidence-based recovery |

Pass `--scenario both`, `one`, `neither`, or `all` (default); comma-separated names such as `both,one` also work. Messages in a batch are submitted in order using one cookie per scenario. Each new scenario starts at 50 with no concerns.

The concurrency regression deliberately sends three additional HTTP submissions while an accepted answer is held in progress. All three receive 409, and the accepted turn applies scores exactly once. This is distinct from submitting an ordered batch: clients must wait for the current round before sending the next completed founder answer. The UI already disables input during evaluation and playback.

## Live tests, explicit credit usage

The ignored `.env` must contain the existing ElevenLabs key and four agent IDs. Do not replace it or put a key in frontend code.

```sh
# Real text agents, no microphone or synthesized speech:
npm run test:panel:live -- --scenario all --out /tmp/investor-panel-live.json

# Also fetch each selected investor's streamed MP3 sequentially:
npm run test:panel:live -- --scenario neither --audio --out /tmp/investor-panel-live-audio.json
```

Live mode uses ElevenLabs credits. It performs no automatic retries and stops a scenario when its expectations fail. The JSON report records messages, replies, scores, concern assessments and checks, plus byte counts when audio is enabled. Reports have restrictive file permissions; choose a private location for non-synthetic inputs. Do not commit real founder conversations or credentials.

The audio check verifies authorization, content type and nonempty streamed bytes. Browser/device playback, autoplay permissions and actual microphone capture still require an occasional manual check. Routine turn-taking and scoring changes do not require computer use.

To replay your own batch, save a JSON array:

```json
[
  {
    "name": "my-synthetic-pitch",
    "turns": [
      { "pitch": "We sell reporting software to repair shops. Please ask about demand and reliability." },
      { "pitch": "Twelve shops paid last month; ten use it weekly. Every malformed import is rejected before reports are generated." }
    ]
  }
]
```

Then run:

```sh
npm run test:panel:live -- --file /tmp/my-pitch.json --out /tmp/my-pitch-results.json
```

Each turn can include optional `expect` assertions. `speakers` checks the set, not a fixed order; `includesSpeaker` requires one role; `investors` maps roles to `answerStatus`, `minDelta`, `maxDelta` and optional boolean `concern`. Example:

```json
{
  "pitch": "My answer to the other investor is finished; I have no answer about demand.",
  "expect": {
    "includesSpeaker": "market_signals_researcher",
    "investors": {
      "market_signals_researcher": {
        "answerStatus": "unanswered",
        "minDelta": -20,
        "maxDelta": -10,
        "concern": true
      }
    }
  }
}
```

Custom files require live mode. Even without explicit expectations, the runner checks the two-person cap, unique speakers, four valid scores, bounded deltas and session turn continuity. Exact model wording and speaker order are not asserted.

## Provider isolation and reproduction

All four agents still use `deepseek-v41-flash` and their existing voices. Each now has a `test-two-investor-followups` branch with 0% default live traffic. Main remains at 100% with unchanged prompts. The local signed-URL request explicitly supplies the branch ID, as supported by [ElevenLabs signed URLs](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url).

The branch mapping is committed as non-secret configuration. For another account, create one test branch per agent, append `two-investor-rounds.md` to that agent's existing role prompt, and supply a matching mapping file through `ELEVENLABS_PANEL_BRANCHES_FILE`. Its format is an array of `{agentId, branchId}`. Missing mappings fail instead of connecting to an agent's main version. Keep the existing final-response-completion event enabled. These branches were created and updated through the ElevenLabs connector; no main prompt or traffic deployment was changed.

Git changes remain on `test/investor-integration`. No merge, main push or production deployment is part of this work.

## Validation record

- 42 automated tests pass, including the three offline HTTP batches, partial/all silence, two-speaker cutoff, separate concern scoring, unchanged pauses, preserved follow-up concerns, terminal behavior and concurrent-request rejection.
- TypeScript and the production build pass. The existing non-fatal 606 KB ElevenLabs browser bundle warning remains.
- All three final live scenarios pass across 10 founder messages. In `both`, both investors rose from 50 to 60. In `one`, the answered Technical Expert rose to 60 while the ignored Market Researcher fell to 40, then recovered to 50 after an answer. In `neither`, both fell from 50 to 40 for evasion and to 35 for partial answers, stayed at 35 during the pause, then recovered after evidence.
- The `neither` live run fetched eight real MP3 streams through the authenticated audio route, sequentially, without browser automation. All were nonempty and returned audio/mpeg.
- The current app was restarted on http://127.0.0.1:5173 with the new branch configuration. Main and the separate Render deployment were not changed.

Machine-readable evidence, containing only synthetic founder inputs and model responses: [test-results/two-investor-rounds.json](test-results/two-investor-rounds.json).

The tests caught and fixed two regressions before the final runs: the Technical Expert initially treated a candid admission of broken validation as resolved and awarded points; the instruction now distinguishes an answered question from a cleared concern. Separately, a quiet request caused agents without an open concern to emit `deferred` instead of `none`; the validator now normalizes that zero-change control-message case. These were deliberate fixes followed by regression runs, not automatic paid retries.

Earlier browser screenshots in this repository describe previous audio implementations. No computer use was needed for these new turn-taking, confidence, concurrency or audio-route checks. Actual device microphone and browser playback were verified previously and are not re-certified by the HTTP harness.
