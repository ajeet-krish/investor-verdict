# investor-verdict

Ever dreamed of being a Series A founder raising $5 million? Now you can live out your founder dreams and try to raise funding for your startup idea. Face a panel of investors in a Teams style call, where you pitch to 4 live, conversational agents. Every clear answer moves you closer to an offer, while every vague answer may cause an investor to back up entirely.

## How it works

1. Join call: open the live link below, allow the mic, and enter the call grid with your tile plus 4 investor tiles.
2. Meet panel: hear each investor intro, then start your pitch in your own words.
3. Pitch: speak by mic or type in the chat box when the room is loud, then submit your turn.
4. Watch scores: every investor scores every pitch from a start of 50, and bars move on each tile with a short reason.
5. Adapt: answer the sharpest question first, add numbers and proof, and win back falling scores.
6. Survive the turn: at most 2 investors reply per turn, one voice at a time in sequence, and the room can stay silent when no one has a strong question.
7. Close: use Skip to pass a question, Reset to restart the call, or Leave to exit early. Any investor at 0 leaves the call, any investor at 100 makes a fictional offer.

## Demo video

Live demo: https://investor-verdict-uxj7.onrender.com

Health check: GET https://investor-verdict-uxj7.onrender.com/health should return ok true before you pitch.

<table>
<tr><th>Asset</th><th>Path</th><th>Note</th></tr>
<tr><td>Screen recording</td><td><code>docs/demo.mp4</code></td><td>Placeholder, 60 to 90 seconds, full pitch arc with one offer or one exit</td></tr>
<tr><td>Call grid</td><td><code>docs/screenshots/call-grid.png</code></td><td>Placeholder, 4 investor tiles plus founder tile at call start</td></tr>
<tr><td>Score bars</td><td><code>docs/screenshots/score-bars.png</code></td><td>Placeholder, mid pitch bars moved apart with one riser and one faller</td></tr>
</table>

Portraits live in `visuals/investors/` and appear on tiles and avatars. Shot list and recording script live in [docs/demo.md](docs/demo.md).

## Meet the panel

You play the founder: concise, specific, and coachable under pressure. Bring pricing, proof, and one user story. Short answers win.

<table>
<tr><th>Title</th><th>Personality</th><th>Reply style</th><th>Deal rank</th></tr>
<tr><td>Market Analyst</td><td>Market finance detective, calm and commercial. Asks who pays, TAM, and pricing.</td><td>10 to 20 words, one question. Hardest on vague numbers.</td><td>2, Solid Terms</td></tr>
<tr><td>Product Manager</td><td>Product realist, practical and curious. Asks what ships, what scales, and tradeoffs.</td><td>10 to 20 words, one question. Blunt and plain.</td><td>3, Creative Bet</td></tr>
<tr><td>Shark</td><td>Cash judge veteran in a Kevin OLeary style, mean and direct. Asks price, margin, and payback.</td><td>Shortest replies, one question. Hardest yes.</td><td>1, Best Deal</td></tr>
<tr><td>Mentor</td><td>Founder backer, warmest voice in the room. Upbeat, listens fully. Asks story, user love, and mission.</td><td>10 to 20 words, one question. Easiest yes.</td><td>4, Smallest Warm Check</td></tr>
</table>

All scores start at 50. Code note: stable agent IDs in code are `cto`, `tech_bro`, `interrogator`, and `sympathizer`, mapped to the Titles above in order.