# Real-time audio test branch

Owner: Arjun Behl

Branch: `test/investor-integration`

Date: November 1, 2026

This branch adds real-time microphone transcription and streamed investor speech to the working text panel. It is a local experiment, not merged into main or deployed to Render. The four shared remote investor configurations are unchanged.

## Try it locally

The development app runs at **http://127.0.0.1:5173**. If needed, run root `npm run dev` with the existing ignored `.env`. Use Node 22.6 or newer for the test suite.

1. Click Get started, then the microphone button (Start live audio).
2. Allow microphone access. Wait for the Listening message; a socket connection alone does not mean microphone capture is ready.
3. Speak your pitch and pause for about 1.5 seconds. The committed transcript appears in chat and the panel assesses it.
4. One selected investor answers aloud in their configured voice. The microphone is muted while the panel thinks and while audio plays, then resumes automatically.
5. Use Skip reply to stop the current playback and continue. The microphone button stops the live microphone and cancels the current or pending audio reply. Reset and Leave close capture, stop playback, and reset the backend session. Reset/Leave remain disabled during an in-flight evaluation to avoid session-cookie races, but are available during audio playback.

Typing a pitch also plays the selected reply, so output can be tested without microphone permission. If autoplay is blocked, use the audio player's Play control or Skip reply. A failed audio request leaves the text reply visible. Use headphones where practical. While the microphone is on, nearby speech can be transcribed; turn it off when not testing.

This is a conversation with alternating turns, not simultaneous talk-over. Live audio streams to transcription, but investor selection still waits for private model assessments and the selected reply. Do not promise instant replies or barge-in speech detection. Skip reply is the explicit interruption control.

## Implementation

- `src/realtime-voice.ts` uses ElevenLabs Scribe `scribe_v2_realtime` over WebSocket with VAD commits, echo cancellation, and noise suppression. The SDK supplies microphone encoding. A single live connection is muted during evaluation/playback, then unmuted, rather than reconnecting for every turn.
- The server mints a short-lived single-use Scribe token at `POST /api/voice-token`. The API key stays on the server. Origin checks apply, responses are not cached, and token issuance is limited to 12 per minute on this local service.
- Private investor assessment sessions remain `textOnly: true`. The existing dynamic bid/selection policy is preserved; all-pass turns have no speech output.
- `GET /api/reply-audio?turn=N` streams MP3 bytes for the latest selected reply. The server checks the session cookie and authoritative turn/speaker. It does not accept arbitrary text or voice IDs from the browser.
- `agents/server/reply-audio.mjs` uses the existing configured voices (Alice, Will, George, Sarah) with their verified `eleven_v4_turbo` speech model. One synthesis is shared across browser media requests and replay reads. Audio is held only in a bounded memory cache for up to two minutes, with an 8 MB limit per reply and at most 16 cached jobs. No recordings are written to disk by this implementation.
- Reset, Leave, client disconnects, timeouts, and server shutdown cancel active speech generation. Failures do not automatically retry paid requests. The ElevenLabs server SDK now explicitly uses `maxRetries: 0`.
- `src/reply-player.ts` manages one audio element, completion/error handling, blocked autoplay, and cancellation. Stale results cannot resume an old microphone or play after reset. Stopping live audio also suppresses a pending reply's automatic playback.
- Microphone setup has a 30-second timeout, idle listening stops after two minutes without speech, and provider errors close capture instead of entering a reconnect loop. If permission takes longer than the setup timeout, allow it and click the microphone again.

## Verified

- 32 automated tests pass. New coverage includes Scribe VAD setup, muting before turn submission, ignoring late transcripts, resuming, disconnect cleanup, cancellation during token acquisition, autoplay blocking, exclusive playback, audio authorization, streaming before completion, cached synthesis reuse, and provider failure handling.
- TypeScript and the production build pass. Vite reports a non-fatal large-chunk warning for the ElevenLabs browser SDK bundle; loading optimization can be a later improvement.
- A real microphone connection captured and committed speech, which reached the panel and produced a single spoken reply. The browser media element reached its 12.09-second endpoint with `ended: true` and no playback error. Microphone capture was stopped after this test.
- A separate synthetic typed pitch selected the Market Researcher, streamed her voice, and played to its 15.36-second endpoint with `ended: true` and no playback error. The associated screenshot contains only synthetic test content: `agents/realtime-audio-preview.jpg`.
- A real single-use Scribe token was successfully obtained without printing or storing it in the repository.

The live test validates the current account, local microphone path, and browser playback. It is not a load test or proof of behavior on every browser/device. Production hosting, authentication, and the separate Render server integration remain outside this branch.

## Provider references

- [ElevenLabs Scribe JavaScript SDK](https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/javascript-scribe)
- [ElevenLabs streaming text to speech](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)
