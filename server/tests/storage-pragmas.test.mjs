import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SqliteStorage } from '../dist/storage/sqlite-storage.js';

test('SQLite pragmas and maintenance checkpoint', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'index-pragmas-'));
  const store = new SqliteStorage(dir);
  try {
    await store.initialize();
    const check = new Database(path.join(dir, 'index.db'));
    try {
      // journal_mode is file-scoped; check cache/busy/mmap on storage's own
      // connection separately through the observable initialization source.
      assert.equal(check.pragma('journal_mode', { simple: true }), 'wal');
    } finally {
      check.close();
    }
    await assert.doesNotReject(() => store.runMaintenance());
  } finally {
    await store.close();
    await rm(dir, {recursive: true, force: true});
  }
});
