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
    const connection = new Database(path.join(dir, 'index.db'));
    try {
      const plan = connection.prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM refs WHERE replace(to_fqn, rtrim(to_fqn, replace(to_fqn, '.', '')), '') = ? COLLATE NOCASE`
      ).all('save').map(r => r.detail).join(' ');
      assert.match(plan, /idx_refs_to_name/, plan);
      assert.doesNotMatch(plan, /SCAN refs\b/, plan);
      connection.prepare(`INSERT INTO refs(from_fqn,to_fqn,file,line,col,kind)
        VALUES (?, ?, ?, ?, ?, ?)`).run(
          'example.Additional', 'example.Service.newMethod',
          '/tmp/Additional.java', 9, 3, 'method_call');
      assert.equal(connection.pragma('integrity_check', { simple:true }), 'ok');
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

test('QueryService from-class prefix ranges are indexed (12000 refs)', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'ref-class-plan-'));
 const store=new SqliteStorage(dir);
 try {
  await store.initialize();
  await store.saveReferences(Array.from({length:12000},(_,i)=>({
   fromFqn:i%4===0 ? 'example.Target.method'+i : 'example.Other.method'+i,
   toFqn:'example.Receiver.call'+i,
   file:'/tmp/C'+i+'.java', line:i+1,column:1,kind:'method_call'
  })));
  const connection = new Database(path.join(dir,'index.db'),{readonly:true});
  try {
   const query=`SELECT id FROM refs WHERE from_fqn = ?
      OR (from_fqn >= ? AND from_fqn < ?)
      OR (from_fqn >= ? AND from_fqn < ?)`;
   const name='example.Target';
   const args=[name,name+'.',name+'.\uffff',name+'(',name+'(\uffff'];
   const plan=connection.prepare('EXPLAIN QUERY PLAN '+query).all(...args)
     .map(row=>row.detail).join(' ');
   assert.match(plan,/SEARCH refs USING INDEX idx_refs_from|SEARCH refs USING COVERING INDEX idx_refs_from/);
   assert.doesNotMatch(plan,/SCAN refs\b/);
  } finally { connection.close(); }
  const {QueryService}=await import('../dist/query-service.js');
  // QueryService accepts the Java project root (parent of .mcp-index)
  const root=await mkdtemp(path.join(os.tmpdir(),'query-root-'));
  try {
    // Compare QueryService behavior using the very same database.
    const {rename,mkdir}=await import('node:fs/promises');
    await store.close();
    await mkdir(path.join(root,'.mcp-index'),{recursive:true});
    await rename(path.join(dir,'index.db'),path.join(root,'.mcp-index','index.db'));
    const query=new QueryService(root);
    try {assert.equal(query.findReferencesFromClass('example.Target').length,3000);}
    finally{query.close();}
  }finally{await rm(root,{recursive:true,force:true});}
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});
