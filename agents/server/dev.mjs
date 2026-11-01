import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['agents/server/index.mjs'], { stdio: 'inherit' }),
  spawn('npm', ['--prefix', 'frontend/confidence-panel', 'run', 'dev', '--', '--config', fileURLToPath(new URL('./vite.integration.mjs', import.meta.url)), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit', env: { ...process.env, VITE_API_URL: '/api' } }),
];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) {
  child.on('exit', code => stop(code || 0));
  child.on('error', () => stop(1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
