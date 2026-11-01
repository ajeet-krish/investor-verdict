import { spawnSync } from 'node:child_process';
const result = spawnSync('npm', ['--prefix', 'frontend/confidence-panel', 'run', 'build'], {
  stdio: 'inherit', env: { ...process.env, VITE_API_URL: '/api' },
});
process.exitCode = result.status ?? 1;
