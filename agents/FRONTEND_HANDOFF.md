# Frontend integration handoff

From: Arjun Behl
To: frontend developer and their coding agent
Date: November 1, 2026
Backend branch: `feat/agents/text-integration`

## Status: implemented

The implementation is merged into main via PR #3 and issue #4 is closed. Read [the completion report](../docs/SETUP_HANDOFF.md) for the next work: selected-investor audio playback, microphone verification, and hosted deployment.

Arjun authorized connecting the frontend directly with minimal changes. `frontend/confidence-panel/src/main.ts` now renders the selected investor's reply, identifies the responding tile, starts scores at 50, and connects Start/Reset/Leave to backend session reset. Four small CSS rules style the reply, responding tile, and disabled controls. The page layout and portraits are unchanged.

The old hidden heuristic fallback and Freeze control are removed from the live flow. Requests are not queued; input, microphone, Reset and Leave are disabled while a request is pending, preventing old results from entering a new pitch. API errors preserve the founder's text for an explicit retry. The steps below document the implemented contract and acceptance checks, rather than outstanding work for another developer.

Do not implement a fixed speaking order or make all four investors speak. This supersedes earlier fixed-order instructions. Each founder message triggers private bids from active investors, then at most one investor gets the floor. Others may pass, and everyone can stay silent. The backend owns this decision. Confidence can change for investors who did not speak. All four agents currently use `deepseek-v41-flash` through ElevenLabs.

## Start the integrated app

Use Node 22 or newer. From the repository root after incorporating the backend branch:

```sh
npm ci
npm --prefix frontend/confidence-panel ci
# On a new machine only: copy .env.example to .env and supply the server API key securely.
# Do not overwrite an existing .env or commit it.
npm run dev
```

Open `http://127.0.0.1:5173`. The launcher sets `VITE_API_URL=/api`, starts the API on loopback port 8787, and loads a Vite proxy overlay outside the frontend. The root build command also sets this API URL. The frontend defaults to `/api`; running it without the root launcher requires an equivalent same-origin API proxy. It never silently falls back to heuristic scoring. Never put an ElevenLabs API key or signed URL into frontend source or `VITE_*` variables. No ElevenLabs browser SDK or additional API key is needed for this text integration.

## Request and response contract

Send `POST /api/evaluate` with `Content-Type: application/json` and same-origin cookies. A same-origin fetch sends the cookie by default; `credentials: "same-origin"` can make that explicit. Keep frontend and backend behind the existing proxy, rather than calling port 8787 from the browser directly.

```ts
type InvestorRole =
  | "technical_expert"
  | "market_signals_researcher"
  | "interrogator"
  | "sympathizer";

interface Evaluation {
  scores: number[]; // Four values in the same order as request.panelists.
  responses: Array<{
    panelist: string;
    role: InvestorRole;
    confidence: number;
    reason: string; // Confidence explanation, not spoken dialogue.
    reply: string; // Empty for everyone except the selected speaker.
    spoke: boolean;
    wantsTurn: boolean; // A private bid may lose; this does NOT mean they spoke.
    status: "out" | "offered" | "nearly-out" | "concerned" | "engaged";
  }>;
  speaker: InvestorRole | null;
  selectionReason: string | null; // Selection metadata, not investor dialogue.
  turn: number;
  source: "elevenlabs";
  initialScore: 50;
}

const request = {
  pitch: "The founder's text", // Nonempty, at most 4,000 characters.
  panelists: ["The CTO", "The VP", "The Interrogator", "The Sympathizer"],
  scores: [50, 50, 50, 50], // Current display values, validated but not authoritative.
};
```

All four panelist names must be supplied once each. Score values must be finite and between 0 and 100. The server maintains the real scores and conversation memory using an HttpOnly `verdict_session` cookie. Do not create your own session ID or trust client scores as authoritative.

Map roles to the current tiles:

| Role | Current tile |
| --- | --- |
| `technical_expert` | The CTO |
| `market_signals_researcher` | The VP |
| `interrogator` | The Interrogator |
| `sympathizer` | The Sympathizer |

## Implemented frontend behavior

The current implementation is in `frontend/confidence-panel/src/main.ts`.

1. Change `evaluate()` to validate and return the complete `Evaluation`, rather than discarding everything except `scores`. Validate finite score values, expected role names, and a maximum of one `spoke: true` response matching `speaker`.
2. In `judge()`, update all four confidence bars from `scores`, then append only the selected response's `reply` with its investor name. Render model text with `textContent`, as `addMsg()` already does. Never display confidence reasons, selection metadata, or losing bids as spoken dialogue.
3. Use `speaker` to highlight the responding tile. Clear old highlighting on the next request, silence, error, reset, or leave. This endpoint returns a completed text response, not streamed events; label the state as the responding investor, rather than pretending to know real-time audio activity. If `speaker` is null, append no investor dialogue and highlight nobody. A neutral listening indicator is optional.
4. Start every tile at 50 by updating the existing `SEEDS` values and initial/reset state. Scores at 0 and 100 are terminal: show passed or simulated offer respectively, not an actual funding commitment. Do not force a terminal investor to speak or replay an older reply.
5. Wire Reset/New pitch/Leave to `POST /api/reset`, with JSON headers, body `{}`, and the same cookie. The response is `{ scores: [50, 50, 50, 50] }`. Reset clears dialogue and speaker state only after the server reset succeeds. Leave ends the session; retain a completed transcript for review if the design calls for it, but a new pitch must start fresh.
6. Handle queued requests and in-flight work when resetting/leaving. Cancel queued submissions and use a session-generation counter to ignore old results. An aborted browser fetch does not guarantee backend cancellation. To avoid a new-session cookie race, either await the in-flight evaluation before resetting or disable Reset while it is pending; do not start a new session until cleanup completes. Stop speech recognition on Leave.
7. Fix Freeze behavior: the current UI submits a paid request and discards returned scores while saying nothing changed. For the first text release, disable/remove this control in live mode, or make it pause submissions entirely. Do not silently let backend state advance while showing stale scores.
8. Show pending/error states, block duplicate submissions, and do not automatically retry paid requests. The server returns `{ error: string }` on errors. Handle 400 invalid input, 403 origin restriction, 409 busy/closed session, 429 capacity, 502 provider/protocol failure, 503 missing configuration, and 504 timeout. Offer an explicit retry/new-pitch action. Keep local heuristic rehearsal visibly separate from live mode.

Idle sessions expire after two minutes. The next message then starts fresh at 50. Track the returned `turn`: if a session with earlier results returns `turn: 1`, treat it as a new pitch, reset the display baseline, and inform the founder. There is no resume/status or streaming endpoint yet. Production hosting and audio playback are outside this handoff.

## Acceptance checks

- A technical question can select the Technical Expert; a later demand question can select the Market Researcher. Assert contract behavior rather than a guaranteed model choice on every run.
- Every response shows zero or one investor message and zero or one responding tile, never a four-investor speaking loop.
- When `speaker: null`, no old reply is repeated. An explicit request for quiet produced all-pass silence in the live backend test.
- All four score bars use server values, including silent investors; initial/reset values are 50.
- Follow-up messages retain memory; Reset/Leave close it and do not allow late results or queued messages into a new pitch.
- Network failures preserve the user's text for explicit retry and do not silently use random scoring.
- Run `npm test` and `npm run build`, then exercise the actual same-origin API in the browser. Live tests consume ElevenLabs credits; mock responses cover UI edge cases without repeated provider calls.

Validation: 20 automated tests and the TypeScript/Vite production build pass. A real browser pitch displayed the Market Researcher's reply and highlighted only her tile; asking for quiet added no investor message and cleared the highlight. Real Reset and Leave cleared the session. Isolated browser fixtures verified provider errors and malformed responses preserve input without changing scores, terminal labels render correctly, and model text containing HTML is rendered literally. The preview is in `agents/frontend-integration-preview.jpg`.

The root local development flow is verified. The separate Render server and deployment configuration pulled from main are preserved; they have not been wired to these text endpoints or deployed as part of this UI change. Audio output is not implemented.
