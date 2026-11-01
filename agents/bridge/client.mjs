import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  config: { type: 'string', default: '.verdict-agent.local.json' }, file: { type: 'string' },
  text: { type: 'string' }, author: { type: 'string', default: 'Coding agent' },
  id: { type: 'string' }, 'request-id': { type: 'string' }, timeout: { type: 'string', default: '180' },
} });
function validate(config) {
  const url = new URL(config.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      typeof config.token !== 'string' || !/^[\w-]{43}$/.test(config.token)) throw new Error('Invalid connection file. Copy it from the live app.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use HTTPS for a non-local app connection.');
  return { baseUrl: config.baseUrl.replace(/\/$/, ''), token: config.token };
}
async function main() {
  const command = positionals[0];
  if (!['connect', 'context', 'suggest', 'result', 'wait'].includes(command)) throw new Error('Use connect, context, suggest, result or wait.');
  if (command === 'connect') {
    if (!values.file) throw new Error('Save the app\'s copied connection JSON privately, then pass --file PATH.');
    const config = validate(JSON.parse(await readFile(values.file, 'utf8')));
    await writeFile(values.config, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    await chmod(values.config, 0o600);
    console.log('Connection saved privately. Run npm run agent:context. No investor request was made.');
    return;
  }
  const config = validate(JSON.parse(await readFile(values.config, 'utf8')));
  async function request(path, body) {
    const response = await fetch(`${config.baseUrl}/agent-bridge/${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${config.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error || 'App connection failed.'}`);
    return data;
  }
  if (command === 'context') return console.log(JSON.stringify(await request('context'), null, 2));
  if (command === 'suggest') {
    if (Boolean(values.file) === Boolean(values.text)) throw new Error('Supply exactly one of --file PATH or --text TEXT.');
    const pitch = values.file ? await readFile(values.file, 'utf8') : values.text;
    const context = await request('context');
    const job = await request('suggest', { pitch, author: values.author, revision: context.revision, requestId: values['request-id'] || randomUUID() });
    console.log(JSON.stringify({ id: job.id, status: job.status, autoSend: context.autoSend,
      note: 'The live app owns submission and investor playback. Read this job for actual replies.' }, null, 2));
    return;
  }
  if (!values.id) throw new Error('Supply the suggestion --id.');
  const seconds = Number(values.timeout);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600) throw new Error('timeout must be 1 to 600 seconds.');
  const deadline = Date.now() + seconds * 1000;
  while (true) {
    const job = await request(`job?id=${encodeURIComponent(values.id)}`);
    if (command === 'result' || !['pending', 'running'].includes(job.status) || Date.now() >= deadline) {
      console.log(JSON.stringify(job, null, 2));
      if (['failed', 'cancelled', 'stale', 'rejected'].includes(job.status)) process.exitCode = 1;
      return;
    }
    await delay(1000); // Read-only polling, never re-submit a paid round.
  }
}
main().catch(error => {
  // Never print the connection file, Authorization header, or a provider error object.
  console.error(error.code === 'ENOENT' ? 'Connection/input file not found. Connect from the live app first.' : String(error.message).slice(0, 500));
  process.exitCode = 1;
});
