import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {heapLimitMiB} = require('../heap-limit.cjs');

test('VS Code and npm launcher share RAM-aware heap limit', () => {
 assert.equal(heapLimitMiB(16 * 1024 ** 3, ''), 4096);
 assert.equal(heapLimitMiB(4 * 1024 ** 3, ''), 2048);
 assert.equal(heapLimitMiB(4 * 1024 ** 3, '1536'), 1536);
 assert.equal(heapLimitMiB(16 * 1024 ** 3, 'invalid'), 4096);
});
