'use strict';
const os = require('node:os');

/** Node old-space cap: no more than 4096 MiB or 50% of available host RAM. */
function heapLimitMiB(totalBytes = os.totalmem(), override = process.env.JAVA_INDEXER_HEAP_MB) {
  const requested = Number(override);
  if (override !== undefined && override !== '' &&
      Number.isFinite(requested) && Number.isInteger(requested) && requested >= 64) {
    return requested;
  }
  return Math.max(64, Math.min(4096, Math.floor(totalBytes / 1024 / 1024 / 2)));
}
module.exports = { heapLimitMiB };
