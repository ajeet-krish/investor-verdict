import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('merged deploy adapter exposes offer and coach routes with owner, origin and secure-cookie guards', { timeout: 20000 }, async t => {
  // No inherited API credentials: these requests must never reach a paid provider.
  const child = spawn(process.execPath, ['deploy/server.js'], {
    cwd: new URL('../../', import.meta.url),
    env: { PATH: process.env.PATH, PORT: '0', NODE_ENV: 'production', APP_ORIGIN: 'https://deploy.test', TRUST_PROXY: '1', ELEVENLABS_API_KEY: 'test-only-no-network' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const found = output.match(/listening on port (\d+)/);
      if (found) resolve(Number(found[1]));
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error(`Deploy adapter exited: ${errors.slice(0, 500)}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body, headers = {}) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://deploy.test', 'X-Forwarded-Proto': 'https', ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  assert.equal((await fetch(base + '/health')).status, 200);
  assert.equal((await post('/api/offer-decision', {}, { Origin: 'https://untrusted.test' })).status, 403);
  assert.equal((await post('/api/coach', {}, { Origin: 'https://untrusted.test' })).status, 403);
  assert.equal((await post('/api/offer-decision', {}, { Authorization: 'Bearer not-an-owner-cookie' })).status, 409);
  const reset = await post('/api/reset', {});
  assert.equal(reset.status, 200, await reset.text());
  const cookies = reset.headers.getSetCookie();
  assert.ok(cookies.every(c => /HttpOnly/.test(c) && /SameSite=Strict/.test(c) && /Secure/.test(c)));
  const room = cookies.find(c => c.startsWith('verdict_room=')).split(';')[0];
  const context = await (await fetch(base + '/api/agent-bridge/session', { headers: { Cookie: room } })).json();
  assert.equal((await post('/api/coach', { revision: context.revision }, { Cookie: room })).status, 503, 'Coach route exists and requires its server-side key');
  assert.equal((await post('/api/offer-decision', { role: 'technical_expert', decision: 'accept', turn: 3 },
    { Cookie: `${room}; verdict_session=expired` })).status, 409, 'Offer route uses the shared session validator');
});
