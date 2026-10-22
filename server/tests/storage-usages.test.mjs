import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { SqliteStorage } from '../dist/storage/sqlite-storage.js';

test('cold simple-name find_usages has an indexed EXPLAIN plan', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'index-refs-'));
  const store = new SqliteStorage(dir);
  try {
    await store.initialize();
    const refs = Array.from({length: 12000}, (_, i) => ({
      fromFqn: 'example.Source' + i,
      toFqn: 'example.Service.method' + i,
      file: '/tmp/Source' + i + '.java', line: i + 1,
      column: 1, kind: 'method_call'
    }));
    refs.push({
      fromFqn: 'example.Caller', toFqn: 'example.Target.save',
      file: '/tmp/Caller.java', line: 42, column: 3, kind: 'method_call'
    });
    await store.saveReferences(refs);
    const connection = new Database(path.join(dir, 'index.db'), { readonly: true });
    try {
      connection.function('ref_simple_name', { deterministic: true },
        fqn => fqn.slice(fqn.lastIndexOf('.') + 1));
      const plan = connection.prepare(
        'EXPLAIN QUERY PLAN SELECT id FROM refs WHERE ref_simple_name(to_fqn) = ? COLLATE NOCASE'
      ).all('save').map(r => r.detail).join(' ');
      assert.match(plan, /idx_refs_to_name/, plan);
      assert.doesNotMatch(plan, /SCAN refs\b/, plan);
    } finally {
      connection.close();
    }
    const start = performance.now();
    const found = await store.findUsages('example.Target.save');
    const elapsed = performance.now() - start;
    assert.equal(found.length, 1);
    assert.equal(found[0].line, 42);
    console.log('Cold-indexed usages lookup: ' + elapsed.toFixed(3) + ' ms');
  } finally {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
