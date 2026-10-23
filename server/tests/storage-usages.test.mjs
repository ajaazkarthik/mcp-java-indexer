import {simpleNameSql} from '../dist/storage/sql-expressions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';
import {QueryService} from '../dist/query-service.js';

test('QueryService reads indexed simple-name usages without a user-defined DB function',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'query-usages-'));
 const dbDir=path.join(root,'.mcp-index');
 const store=new SqliteStorage(dbDir);
 try{
  await store.initialize();
  const refs=Array.from({length:12000},(_,i)=>({
    fromFqn:'example.Source'+i,toFqn:'example.Service.method'+i,
    file:'/tmp/Source'+i+'.java',line:i+1,column:1,kind:'method_call'
  }));
  refs.push({fromFqn:'example.Caller',toFqn:'example.Target.save',
    file:'/tmp/Caller.java',line:42,column:3,kind:'method_call'});
  await store.saveReferences(refs);
  const query=new QueryService(root);
  try {
   const expr=simpleNameSql('to_fqn');
   const plan=query.explainQueryPlan('SELECT id FROM refs WHERE '+expr+' = ? COLLATE NOCASE','save');
   assert.match(plan,/idx_refs_to_name/);
   assert.doesNotMatch(plan,/SCAN refs\b/);
   const start=performance.now();
   const found=query.findUsages('example.Target.save');
   const elapsed=performance.now()-start;
   assert.equal(found.length,1);
   assert.equal(found[0].line,42);
   assert.ok(elapsed<50,'Cold usages '+elapsed+'ms');
   console.log('QueryService indexed usages: '+elapsed.toFixed(3)+' ms');
  }finally{query.close();}
  // Plain SQLite must be able to write and run integrity_check without JS functions.
  const db=new Database(path.join(dbDir,'index.db'));
  try {
   db.prepare('INSERT INTO refs(from_fqn,to_fqn,file,line,col,kind) VALUES (?,?,?,?,?,?)')
    .run('example.Caller','example.Other.run','/tmp/Other.java',1,1,'method_call');
   assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  }finally{db.close();}
 }finally{await store.close();await rm(root,{recursive:true,force:true});}
});

test('QueryService from-class prefix ranges use idx_refs_from',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'query-from-'));
 const store=new SqliteStorage(path.join(root,'.mcp-index'));
 try {
  await store.initialize();
  await store.saveReferences(Array.from({length:12000},(_,i)=>({
    fromFqn:i%4===0?'example.Target.method'+i:'example.Other.method'+i,
    toFqn:'example.Other.call'+i,file:'/tmp/O.java',
    line:i+1,column:1,kind:'method_call'
  })));
  const query=new QueryService(root);
  try {
   const name='example.Target',max=String.fromCharCode(0xffff);
   const sql='SELECT id FROM refs WHERE from_fqn = ? OR (from_fqn >= ? AND from_fqn < ?) OR (from_fqn >= ? AND from_fqn < ?)';
   const plan=query.explainQueryPlan(sql,name,name+'.',name+'.'+max,name+'(',name+'('+max);
   assert.match(plan,/idx_refs_from/);
   assert.doesNotMatch(plan,/SCAN refs\b/);
   assert.equal(query.findReferencesFromClass(name).length,3000);
   // Prove the scan assertion fails when its required index is unavailable.
   query.close();
   await store.close();
   const sqlite=(await import('better-sqlite3')).default;
   const db=new sqlite(path.join(root,'.mcp-index','index.db'));
   try {
     db.exec('DROP INDEX idx_refs_from');
     const bad=db.prepare('EXPLAIN QUERY PLAN '+sql)
       .all(name,name+'.',name+'.'+max,name+'(',name+'('+max)
       .map(r=>r.detail).join(' ');
     assert.match(bad,/SCAN refs\b/);
     assert.throws(()=>assert.doesNotMatch(bad,/SCAN refs\b/),assert.AssertionError);
   }finally{db.close();}

  }finally{query.close();}
 }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
