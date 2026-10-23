import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';
import {QueryService} from '../dist/query-service.js';

test('prepared cache and inbound exact-hit issue one statement',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'stmts-cache-'));
 const store=new SqliteStorage(path.join(root,'.mcp-index'));
 try {
  await store.initialize();
  await store.saveCallEdges([{caller:'a.Caller.go',callee:'a.Target.run',
    locations:[{file:'/tmp/a.java',line:1,column:2}]}],'forward');
  const service=new QueryService(root);
  try {
   const seen=[];
   service.setStatementObserver(name=>seen.push(name));
   assert.equal(service.getInboundCalls('a.Target.run').length,1);
   assert.deepEqual(seen,['inboundExact']);
   service.setStatementObserver();
   const db=service.db;
   const original=db.prepare;
   db.prepare=()=>{throw Error('Reprepared on hot path');};
   try {
     service.getInboundCalls('a.Target.run');
     service.getAllSymbols().has('a.Target.run');
     service.getAllSymbols().size;
     service.getAllSymbols().size;
     service.getStats();
   }finally{db.prepare=original;}
  }finally{service.close();}
 }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
