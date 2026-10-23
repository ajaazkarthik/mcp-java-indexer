import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MemoryIndex } from '../dist/memory-index.js';
import { Persistence } from '../dist/persistence.js';
import { QueryService } from '../dist/query-service.js';

test('metadata-only load and lazy SQLite queries keep symbols and refs off heap', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'index-query-'));
  const memory=new MemoryIndex();
  memory.setIndexDir(dir);
  const persist=new Persistence(memory.getIndexDir());
  try {
    const file=path.join(dir,'Demo.java');
    memory.addSymbol({fqn:'example.Demo',name:'Demo',kind:'class',
      file,line:1,column:1,packageName:'example',modifiers:[]});
    memory.addReference({fromFqn:'example.Other.call',toFqn:'example.Demo',
      file,line:2,column:1,kind:'type_reference'});
    memory.addFile(file,'abc',['example.Demo'],true);
    await persist.save(memory);
    assert.equal(await persist.load(memory),true);
    assert.equal(memory.getAllSymbols().size,0);
    assert.equal(memory.getStats().symbols,1);
    const query=new QueryService(dir);
    try {
      assert.equal(query.getSymbol('example.Demo')?.name,'Demo');
      assert.equal(query.findSymbols('Demo').length,1);
      assert.equal(query.findUsages('example.Demo').length,1);
      // Source-of-truth forward edges also work when older reverse tables
      // were populated using a previous column-ordering bug.
      assert.ok(Array.isArray(query.getInboundCalls('example.Demo')));
      assert.equal(query.getAllSymbols().size,1);
      assert.equal([...query.getAllSymbols().values()].length,1);
      assert.equal(query.getAllFiles().length,1);
    } finally { query.close(); }
  } finally {
    await persist.close();
    await rm(dir,{recursive:true,force:true});
  }
});

test('inbound and outbound simple-name fallbacks select indexed expression paths', async () => {
  const os=await import('node:os');
  const Database=(await import('better-sqlite3')).default;
  const {SqliteStorage}=await import('../dist/storage/sqlite-storage.js');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const root=await mkdtemp(path.join(os.tmpdir(),'indexed-calls-'));
  const persistDir=path.join(root,'.mcp-index');
  const storage=new SqliteStorage(persistDir);
  try {
    await storage.initialize();
    await storage.saveCallEdges([{
      caller:'com.example.Caller.execute',callee:'com.example.Worker.save',
      locations:[{file:'/tmp/Caller.java',line:5,column:3}]
    }],'forward');
    const db=new Database(path.join(persistDir,'index.db'),{readonly:true});
    try {
      const sql="SELECT caller FROM call_edges_forward WHERE replace(callee, rtrim(callee, replace(callee, '.', '')), '') = ? COLLATE NOCASE LIMIT 100";
      const plan=db.prepare('EXPLAIN QUERY PLAN '+sql).all('save').map(r=>r.detail).join(' ');
      assert.match(plan,/idx_edges_fwd_callee_name/);
      assert.doesNotMatch(plan,/SCAN call_edges_forward/);
    }finally{db.close();}
    const query=new QueryService(root);
    try{
      assert.equal(query.getInboundCalls('another.Class.save').length,1);
      assert.equal(query.getInboundCalls('com.example.Worker.save').length,1);
      assert.equal(query.getOutboundCalls('other.Caller.execute').length,1);
    }finally{query.close();}
  }finally{await storage.close();await rm(root,{recursive:true,force:true});}
});
