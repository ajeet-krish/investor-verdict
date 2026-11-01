import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { scenarios } from './scenarios.mjs';
import { runScenario } from './panel-runner.mjs';
import { createPanelProvider } from '../server/panel-provider.mjs';

const { values } = parseArgs({ options: {
  live: { type: 'boolean', default: false }, audio: { type: 'boolean', default: false },
  scenario: { type: 'string', default: 'all' }, file: { type: 'string' }, out: { type: 'string' },
} });
try {
  if (values.file && !values.live) throw new Error('Custom input files require --live. Offline mode uses explicit provider fixtures.');
  const selected = values.file ? JSON.parse(await readFile(values.file, 'utf8'))
    : scenarios.filter(s => values.scenario === 'all' || values.scenario.split(',').includes(s.name));
  if (!Array.isArray(selected) || !selected.length || selected.some(s => typeof s.name !== 'string' || !Array.isArray(s.turns) || !s.turns.length || s.turns.some(t => t.decision
    ? !['accept', 'decline'].includes(t.decision) || typeof t.role !== 'string'
    : typeof t.pitch !== 'string' || !t.pitch.trim() || t.pitch.length > 4000))) {
    throw new Error('Use a known scenario or a JSON array of {name, turns: [{pitch, expect?}]}.');
  }
  console.log(values.live ? 'LIVE: consumes ElevenLabs credits. At most one correction per invalid assessment; no whole-turn retries.' : 'OFFLINE: deterministic provider fixtures, no credits or microphone.');
  const provider = values.live ? createPanelProvider() : undefined;
  const report = { mode: values.live ? 'live' : 'offline', at: new Date().toISOString(), scenarios: [] };
  for (const scenario of selected) {
    console.log(`Scenario: ${scenario.name}`);
    const result = await runScenario(scenario, { live: values.live, provider, audio: values.audio,
      onTurn: r => console.log(`  Turn ${r.turn}: ${r.result.speakingOrder.join(', ') || 'silence'} | scores ${r.result.scores.join('/')} | ${r.checks}`) });
    report.scenarios.push(result);
    if (!result.passed) { process.exitCode = 1; break; }
  }
  if (values.out) await writeFile(values.out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(process.exitCode ? 'FAILED. Inspect the report; the scenario was not retried.' : 'All scenarios passed. Sessions closed.');
} catch (error) {
  // Provider internals may contain signed URLs or credentials. Only expose our own concise errors.
  console.error('Panel run failed:', error.statusCode ? `Provider HTTP ${error.statusCode}` : String(error.message).slice(0, 500));
  process.exitCode = 1;
}
