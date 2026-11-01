# investor-verdict

Interactive Microsoft Teams style video call where you pitch to 4 distinct voice agents acting as investors and personalities. Each agent is an ElevenLabs realtime conversational agent with a live confidence score. If a score hits 0 that investor leaves the call. If a score hits 100 that investor makes an offer. Survive the call and close the round.

## Team Roles

<table>
<tr><th>Area</th><th>Owner</th><th>Scope</th></tr>
<tr><td>Frontend</td><td>Member 1</td><td>Video call UI, state, scores, layout in /frontend</td></tr>
<tr><td>Animations and Visuals</td><td>Member 2</td><td>Effects, transitions, avatar motion in /visuals</td></tr>
<tr><td>ElevenLabs Agents</td><td>Member 3 (requester)</td><td>Agent setup, prompts, voices, realtime wiring in /agents</td></tr>
</table>

## Quickstart

1. Clone the repo (replace URL with real remote):
   * `git clone <repo url>`
   * `cd investor-verdict`
2. Create your branch and work only in your folder:
   * `git checkout -b main`
   * `git checkout -b feat/frontend/your-task`
3. Copy env template and add your key locally:
   * `cp .env.example .env`
   * Add `ELEVENLABS_API_KEY=your_key_here` inside `.env`
   * Never commit `.env` or any keys
4. Push early and often:
   * `git add .`
   * `git commit -m "feat: describe change"`
   * `git push -u origin feat/frontend/your-task`

See CONTRIBUTING.md for branch names and merge workflow. See subfolder READMEs for folder ownership.

## Environment

Required placeholders (local only):

```
ELEVENLABS_API_KEY=your_key_here
```

Optional placeholders to add as needed:

```
ELEVENLABS_AGENT_ID_ONE=placeholder
ELEVENLABS_AGENT_ID_TWO=placeholder
ELEVENLABS_AGENT_ID_THREE=placeholder
ELEVENLABS_AGENT_ID_FOUR=placeholder
```

Never commit `.env` or `.env.local`. Keys stay on your machine only.

## Submission Note

Larphacks 2026 submission is at 6pm today. Freeze features 60 minutes before deadline. Use remaining time for demo rehearsal and recording backup.

## Links

* ElevenLabs conversational AI docs: https://elevenlabs.io/docs/conversational-ai/overview
* AGENTS.md: ./AGENTS.md
* Contributing: ./CONTRIBUTING.md
