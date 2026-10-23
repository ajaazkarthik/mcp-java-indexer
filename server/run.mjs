import { spawn } from 'node:child_process';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {heapLimitMiB} = require('./heap-limit.cjs');
import { fileURLToPath } from 'node:url';

// Keep V8's old-space limit at or below half the host RAM (in MiB).
const heapMiB = heapLimitMiB();
const child = spawn(process.execPath,
  [`--max-old-space-size=${heapMiB}`, fileURLToPath(new URL('./dist/index.js', import.meta.url))],
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
