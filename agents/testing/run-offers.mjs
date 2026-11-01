import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createApiServer } from '../server/app.mjs';
import { createTextPanelService, PANEL } from '../server/text-panel.mjs';
import { createReplyAudio } from '../server/reply-audio.mjs';
import { createPanelProvider } from '../server/panel-provider.mjs';
import { scenarioSdk, mockEnv } from './mock-panel.mjs';
import { checkTurn } from './panel-runner.mjs';
import { validateEvaluation } from '../../frontend/confidence-panel/src/investor-call.ts';

const { values } = parseArgs({ options: { live: { type: 'boolean' }, audio: { type: 'boolean' }, out: { type: 'string' } } });
// Deliberately fictional evidence for isolated testing, never a draft for the user's live call.
const pitches = [
  'Fictional practice case: ShopLedger produces inventory reports for independent repair shops. Forty shops pay $49 monthly and 36 use it weekly. Our working product rejects malformed imports before publishing, and a 200-file test caught all bad rows. Users report saving four hours weekly. We want to grow this small validated business.',
  'More measured evidence in this fictional case: the last three monthly cohorts retained 94% of paying shops, with 60 now paying. Logs show 54 use reports weekly. Every imported file has schema, date and total checks plus an owner preview. All 60 owners confirmed the reports match their books. Six interviews described replacing error-prone weekend spreadsheet work.',
  'For this fictional company, a six-month cohort of 40 retained 38 paying shops. There are now 90 paying shops. An independent accountant checked 500 generated reports against source records and found zero material errors. Contribution margin is 86%, acquisition cost $42 and payback one month. All customer and financial results here are synthetic practice facts.',
  'Our fictional follow-up: 120 paying shops, 95% six-month retention, and 18 signed annual contracts without discounts. Owners approve every report before use; backup recovery was tested monthly and takes eight minutes. Fourteen customers referred a paying shop. We measured six hours of weekly savings per owner across 30 timed sessions. We are keeping the product scoped to reporting.',
  'Further synthetic validation: 160 paying shops and 96% retention across two independent six-month cohorts. Thirty annual contracts are prepaid. A third-party security review found no critical issues after fixes were retested. Support averages 12 minutes per customer monthly. Revenue covers both founders salaries and operating costs, with 14 months cash runway. A controlled pilot reproduced the time savings.',
  'Final new fictional evidence: 200 paying shops, 97% six-month retention, audited cash collections and 50 prepaid annual contracts. Customer references independently confirmed weekly use and six-hour savings. Imports continue to fail closed with human approval. Acquisition payback remains under two months across three channels. Both founders have shipped similar reporting tools, and the documented recovery plan was tested by someone outside the team.',
];
const fixtures = { turns: pitches.map((_, turn) => ({ expect: { investors: Object.fromEntries(PANEL.map((role, i) => [role.key, {
  scoreDelta: 20, answerStatus: turn === 1 && i < 2 ? 'resolved' : 'none',
}])) } })) };
const env = values.live ? process.env : mockEnv;
const provider = values.live ? createPanelProvider() : undefined;
const panel = createTextPanelService({ env, getSignedUrl: provider?.getSignedUrl ?? (async id => `wss://test/${id}`),
  ...(values.live ? {} : { sdk: scenarioSdk(fixtures), random: () => 0 }) });
const audio = createReplyAudio({ textPanel: panel, synthesize: values.live
  ? ({ voiceId, text, signal }) => provider.client.textToSpeech.stream(voiceId, { text, modelId: 'eleven_v4_turbo', outputFormat: 'mp3_44100_128' }, { abortSignal: signal, maxRetries: 0 })
  : async () => (async function* () { yield Buffer.from('fixture-audio'); })() });
const server = createApiServer({ env, textPanel: panel, replyAudio: audio });
let cookie = '', scores = [50, 50, 50, 50], latest, declined = false;
const report = { mode: values.live ? 'live' : 'offline', at: new Date().toISOString(), rounds: [], passed: false };
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(values.live ? 'LIVE: isolated offer test consumes ElevenLabs credits; no whole-round retries.' : 'OFFLINE: deterministic offer decisions, no credits or browser.');
  async function run(path, body) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body), signal: AbortSignal.timeout(240000) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const result = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${result.error || "Offer request failed"}`);
    checkTurn(result, scores);
    validateEvaluation(result, PANEL.map(r => ({ role: r.key, name: r.title })), scores);
    const record = { event: result.event, scores: result.scores, speakingOrder: result.speakingOrder,
      offerOrder: result.offerOrder, pendingOffers: result.pendingOffers, departureOrder: result.departureOrder,
      gameOver: result.gameOver, acceptedOffer: result.acceptedOffer,
      responses: result.responses.filter(r => r.spoke).map(r => ({ role: r.role, reply: r.reply })), audio: [] };
    report.rounds.push(record);
    if (values.audio) for (const role of result.speakingOrder) {
      const response = await fetch(`${base}/api/reply-audio?turn=${result.turn}&role=${role}`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(60000) });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^audio\/mpeg/);
      const bytes = (await response.arrayBuffer()).byteLength; assert.ok(bytes > 0);
      record.audio.push({ role, bytes });
    }
    scores = result.scores; latest = result;
    console.log(`Turn ${result.turn}: ${result.event}, scores ${scores.join('/')}, ${result.pendingOffers.length} pending offers, ${result.speakingOrder.length} voices`);
  }
  for (const pitch of pitches) {
    await run('/api/evaluate', { pitch, panelists: PANEL.map(r => r.title), scores });
    if (latest.pendingOffers.length && !declined) {
      const role = latest.pendingOffers[0];
      await run('/api/offer-decision', { role, decision: 'decline', turn: latest.turn });
      assert.deepEqual(latest.departureOrder, [role]); assert.equal(latest.gameOver, false); declined = true;
    }
    if (latest.pendingOffers.length) {
      const role = latest.pendingOffers[0];
      await run('/api/offer-decision', { role, decision: 'accept', turn: latest.turn });
      assert.equal(latest.acceptedOffer, role); assert.equal(latest.gameOver, true); break;
    }
  }
  assert.ok(declined && latest.gameOver, 'Must exercise both a decline and a later acceptance');
  report.passed = true;
  console.log('PASS: offers, decline, acceptance, final statements and frontend payload validation.');
} catch (error) {
  console.error('Offer test failed:', String(error.message).slice(0, 180)); process.exitCode = 1;
} finally {
  if (values.out) await writeFile(values.out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  audio.close(); await panel.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
