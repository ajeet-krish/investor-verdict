# Verdict

**LARP as a startup founder. Pitch four fictional AI investors, defend your idea, and try to earn a simulated investment offer.**

[Try the live website](https://investor-verdict-uxj7.onrender.com/) · [Two-minute demo plan](docs/demo-script-2min.md) · [Setup and architecture](agents/FRONTEND_HANDOFF.md)

## What are we roleplaying?

You are the founder in an investor meeting. You bring an idea, explain who needs it, present evidence, and answer uncomfortable follow-up questions. The four investors have different priorities, so one persuasive answer may still leave another investor unconvinced.

Verdict turns that pressure into a repeatable browser-based practice session. The meeting-style interface, spoken replies, visible confidence, and investors who can leave or offer to invest make the consequences feel immediate. These are fictional characters and simulated funding decisions, not real investors, financial advice, or a Microsoft Teams integration.

## The main product

The core loop is **pitch → listen → answer → watch the room change**.

1. Open the website and select **Join the room**. Your microphone starts off.
2. Bring your own idea or select PantryPal, BorrowBox, or StudySprint. Selecting a practice card fills the message box; it does not send it.
3. Type and press Send, or turn on the microphone and allow browser access to pitch by voice.
4. All four investors assess the message. Normally, at most two reply, one voice at a time. Each investor can keep its own unresolved concern.
5. Watch confidence scores, which start at **50/100**. A small speaker icon highlights the active investor. The microphone pauses during investor speech.
6. Answer the actual questions. Specific evidence helps; incomplete answers and unanswered concerns can reduce confidence. Admitting an unknown is preferable to inventing traction.
7. At **0**, an investor gives a farewell and leaves. At **100**, an investor makes a fictional offer. Use the human-controlled Accept/Decline decision to resolve it. Accepting ends the round with closing statements.

**Transcript** hides conversation history while leaving the message box and status messages available. Restart begins a fresh session; Leave exits the room.

## Meet the panel

| Investor | Perspective | What the founder must explain |
|---|---|---|
| The CTO | Technical expert | Feasibility, implementation, technical limits, and tradeoffs |
| The VP | Market signals researcher | Customer demand, competitors, pricing, and retention |
| The Interrogator | Skeptical examiner | Weak assumptions, contradictory numbers, and missing evidence |
| The Sympathizer | Constructive founder supporter | Motivation, customer understanding, and realistic next steps |

The pitch companion offers three suggested replies after a completed round, grounded in the conversation and the selected fictional case. Selecting one fills the main message box for review before sending. It does not answer on the founder's behalf automatically.

## Main-track judging rubric

Each category is worth 5 points, for 30 total. This is our product explanation and demonstration plan, not a claim that judges have awarded these points.

| Criterion | How Verdict addresses it | What to demonstrate |
|---|---|---|
| **Working product** | A deployed browser app connects text or microphone input to four conversational investors, confidence updates, sequential audio, and terminal decisions. | Submit a pitch, hear actual replies, and show the scores changing. Verify microphone and audio on the demo browser beforehand. |
| **Usefulness** | Gives aspiring founders a place to rehearse concise answers, distinguish interest from payment, and identify gaps before a real meeting. | Answer a retention question honestly and explain the next validation step. We have not measured training outcomes yet. |
| **Theme** | The user actively roleplays a founder, with a goal, distinct characters, pressure, and consequences. | Introduce the audience as the founder and show how each investor challenges that role. |
| **Creativity** | Four perspectives assess one pitch, carry unresolved concerns, and take turns speaking. Confidence makes the room's changing reaction visible. | Compare two investors' questions about the same evidence and point out the speaking icon. |
| **Ease of use** | One link, a Join button, optional voice or text, supplied practice cases, and suggested replies make it easy to start. | Select a practice pitch, show that it is editable, and toggle Transcript while keeping chat available. |
| **Demo** | A short, coherent founder journey shows the product rather than relying on a feature list. | Follow the timed script, show a real exchange, and explain the 0/100 outcomes without claiming they occur in one turn. |

## Demo plan and product discussion

**Opening:** “You are a founder walking into an investor meeting. Verdict lets you practice that moment with four fictional investors.”

Use the [two-minute plan](docs/demo-script-2min.md). Keep the explanation centred on the founder's task: explain an idea, handle scrutiny, and improve the next answer. Show one complete exchange before describing the underlying technology. Investor wording, scores, and response times vary; demo questions are examples, not guaranteed outputs.

Before presenting, check the deployed site, microphone permissions, audible playback, ElevenLabs agent access and conversation capacity, and available provider credits. Keep text input available if the venue is loud. A working room screen alone does not verify investor conversations.

## Implementation and scope

- **Frontend:** TypeScript and Vite, a responsive four-investor call grid, confidence meters, transcript, and pitch companion.
- **Investor conversations and voice:** ElevenLabs, with server-side credentials and sequential spoken replies. Founder voice uses real-time transcription.
- **Suggested founder replies:** OpenAI, based on the current exchange and fixed practice-case facts.
- **Hosting:** Render serves the frontend and API together. The live service uses paid compute to avoid free-instance idle wake-up delays.
- **Case facts:** [practice-cases.mjs](agents/server/practice-cases.mjs) defines the fictional scenarios. They are not claims about real businesses or customers.

Current limits: investor portraits are static; provider availability, account permissions, credits, and conversation limits affect live calls. Confidence is a roleplay mechanic, not a prediction of real investment success. Expanded industry panels and other rehearsal scenarios are future possibilities, not shipped features.

## Run and verify

Use Node 22.6 or newer. Follow [the setup guide](agents/ELEVENLABS_SETUP.md) to configure your own provider account and all four agents; changing only the API key does not transfer agent ownership or configuration. Keep credentials out of Git.

```sh
npm ci
npm --prefix frontend/confidence-panel ci
cp .env.example .env
# Fill in your private server credentials and agent IDs.
npm run dev
```

```sh
npm test
npm run test:panel
npm run build
```

These deterministic checks do not prove that production credentials or live audio work. Live provider tests use credits. See [the frontend handoff](agents/FRONTEND_HANDOFF.md), [voice test notes](docs/REALTIME_AUDIO_TEST.md), and [round rules](docs/TWO_INVESTOR_ROUNDS.md) for details.
