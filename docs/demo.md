# Demo plan (screenshots plus screen recording plus backup)

## Shot list

<table>
<tr><th>Shot</th><th>What to capture</th><th>Where to save</th></tr>
<tr><td>Call grid</td><td>4 investor tiles plus founder tile, names and portraits visible, all scores near 50 at call start</td><td>docs/screenshots/call-grid.png</td></tr>
<tr><td>Score bars</td><td>Mid pitch bars moved apart, one riser plus one faller, reason captions readable</td><td>docs/screenshots/score-bars.png</td></tr>
<tr><td>Leave moment (optional)</td><td>One tile dimmed or exited at 0, rest still live, score event visible if possible</td><td>docs/screenshots/leave.png</td></tr>
<tr><td>Offer moment (optional)</td><td>One tile celebrating at 100 with deal label (Best Deal, Solid Terms, Creative Bet, Smallest Warm Check)</td><td>docs/screenshots/offer.png</td></tr>
<tr><td>Screen recording</td><td>60 to 90 seconds, mic on, founder pitch plus max 2 replies per turn, bars moving, one climax (leave or offer)</td><td>docs/demo.mp4</td></tr>
</table>

Portraits used in tiles come from `visuals/investors/`. The still at `visuals/confidence/preview.jpg` covers the README until the new shots land. Keep every media path relative to repo root.

## Recording script (90 seconds)

1. Open shot (0 to 10s): call grid in mock mode, introduce the pitch in one line
2. Money turn (10 to 35s): say pricing plus customers plus numbers aloud (example: 49 per seat, 20 paying customers), CTO and Interrogator bars climb
3. Tech turn (35 to 55s): say architecture plus scale plus tradeoff aloud, Tech Bro climbs, Interrogator dips on long answers
4. Story turn (55 to 75s): say mission plus one user love moment aloud, Sympathizer climbs
5. Climax (75 to 90s): push one investor to 100 (offer, show deal label) or tank one to 0 (leave), close on the term sheet line

Speak in short numbered turns so the arbiter stays at max 2 replies and the recording stays legible.

## Capture checklist

* Resolution 1920 by 1080 or nearest, browser chrome hidden, mic levels checked
* Mock mode first for framing, live mode second for voice proof
* Save PNG stills to `docs/screenshots/`, MP4 to `docs/demo.mp4`
* Do not commit `.env`, keys, or private URLs, placeholders stay as placeholders until captured

## Backup plan if live fails on stage

* Default to mock mode, it runs the same scoring plus replies with no key and no network
* Play `docs/demo.mp4` while narrating the loop (speak once, all 4 score, max 2 reply, 0 leaves, 100 offers)
* Show `visuals/confidence/preview.jpg` plus portraits from `visuals/investors/` as the visual spine
* State the fallback openly (live sessions need IDs plus mic plus network, mock proves the loop), then rerun the money turn live in text with `simulateUtterance` if voice stays down

## Prewarm checklist (Render Starter plus Sentry, 5 min before judging)

Live URL is https://investor-verdict-1.onrender.com (display name investor-verdict, URL slug investor-verdict-1).

Starter plan is always on, so this list only confirms the service stayed warm
and the error path is quiet.

1. Open `GET https://investor-verdict-1.onrender.com/health`, expect `ok true`. Reload once after
    60 seconds to confirm no cold start
2. Open `GET https://investor-verdict-1.onrender.com/` and confirm the expected page: built panel when
    `frontend/confidence-panel/dist` shipped, else `visuals/confidence/demo.html`,
    else the placeholder page with the API notes
3. Check the Sentry project for new errors in the last hour. Expect zero, or
    only known rehearsal noise
4. Keep one laptop on the Render URL and one backup on local mock plus
    `docs/demo.mp4` in case venue wifi drops
5. If the panel needs a private agent later, test `POST https://investor-verdict-1.onrender.com/api/signed-url` with
    `{"agentKey": "cto"}` once. Expect `signedUrl` JSON, never log the value
