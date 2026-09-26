import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--watch-path=server', '--watch-path=shared', 'server/index.ts'], {
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], {
    stdio: 'inherit',
  }),
];
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    children.forEach((p) => p.kill());
    process.exit();
  });
