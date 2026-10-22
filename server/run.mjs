import { spawn } from 'node:child_process';
import { totalmem } from 'node:os';

// Keep V8's old-space limit at or below half the host RAM (in MiB).
const heapMiB = Math.max(64, Math.floor(totalmem() / (1024 * 1024 * 2)));
const child = spawn(process.execPath,
  [`--max-old-space-size=${heapMiB}`, new URL('./dist/index.js', import.meta.url).pathname],
  { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { if (!child.killed) child.kill(signal); });
}
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
child.once('error', error => {
  console.error('Failed to start Java indexer:', error);
  process.exitCode = 1;
});
