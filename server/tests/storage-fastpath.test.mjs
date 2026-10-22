import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SqliteStorage } from '../dist/storage/sqlite-storage.js';

test('exact simple-name queries use the compound index and preserve fallback search', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'index-name-'));
  const storage = new SqliteStorage(dir);
  try {
    await storage.initialize();
    const makeSymbol = (name, i) => ({
      fqn: 'example.' + name + i, name, kind: 'class',
      file: '/tmp/' + i + '.java', line: 1, column: 1,
      packageName: 'example', modifiers: []
    });
    const symbols = Array.from({ length: 15000 }, (_, i) => makeSymbol('Unrelated' + i, i));
    symbols.push(makeSymbol('RareExactClass', 50000));
    await storage.saveSymbols(symbols);
    const inspect = new Database(path.join(dir, 'index.db'), { readonly: true });
    try {
      const plan = inspect.prepare('EXPLAIN QUERY PLAN SELECT data FROM symbols WHERE name = ? LIMIT 50')
        .all('RareExactClass').map(row => row.detail).join(' ');
      assert.match(plan, /idx_symbols_name_kind/, plan);
    } finally {
      inspect.close();
    }
    const started = performance.now();
    const found = await storage.findSymbols('RareExactClass');
    const elapsed = performance.now() - started;
    assert.equal(found.length, 1);
    assert.equal(found[0].name, 'RareExactClass');
    assert.equal((await storage.findSymbols('ExactClass')).length, 1);
    console.log('Exact class lookup: ' + elapsed.toFixed(3) + ' ms');
  } finally {
    await storage.close();
    await rm(dir, { recursive: true, force: true });
  }
});
