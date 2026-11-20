import { spawn } from 'node:child_process';
import process from 'node:process';

const commands = [
  [process.execPath, ['server/index.js']],
  [process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0']]
];
const children = commands.map(([command, args]) => spawn(command, args, { stdio: 'inherit', env: process.env }));
function stop(code = 0) {
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  process.exit(code);
}
for (const child of children) {
  child.on('exit', (code) => { if (code && code !== 0) stop(code); });
  child.on('error', (error) => { console.error(error); stop(1); });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
