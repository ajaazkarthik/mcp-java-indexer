import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';
import {QueryService} from '../dist/query-service.js';
import {simpleNameSql} from '../dist/storage/sql-expressions.js';

test('schema v3 updates three simple-name indexes to v4, ignoring parameter dots',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'parameter-name-'));
 const dir=path.join(root,'.mcp-index');
 const writer=new SqliteStorage(dir);
 try{
  await writer.initialize();
  await writer.saveReferences([{fromFqn:'a.Caller.run',toFqn:'a.Target.save(java.lang.String)',
    file:'/tmp/C.java',line:5,column:1,kind:'method_call'}]);
  const older=new Database(path.join(dir,'index.db'));
  try{
   older.exec('UPDATE schema_version SET version=3');
   for(const [name,column,table] of [
     ['idx_refs_to_name','to_fqn','refs'],
     ['idx_edges_fwd_caller_name','caller','call_edges_forward'],
     ['idx_edges_fwd_callee_name','callee','call_edges_forward']]){
     older.exec('DROP INDEX IF EXISTS '+name);
     const old=`replace(${column}, rtrim(${column}, replace(${column}, '.', '')), '')`;
     older.exec(`CREATE INDEX ${name} ON ${table}(${old} COLLATE NOCASE)`);
   }
  }finally{older.close();}
  await writer.close();
  const upgraded=new SqliteStorage(dir);
  await upgraded.initialize();await upgraded.close();
  const db=new Database(path.join(dir,'index.db'));
  try {
   assert.equal(db.prepare('SELECT version FROM schema_version').get().version,4);
   for(const [name,col,table] of [
     ['idx_refs_to_name','to_fqn','refs'],
     ['idx_edges_fwd_caller_name','caller','call_edges_forward'],
     ['idx_edges_fwd_callee_name','callee','call_edges_forward']]){
     const plan=db.prepare('EXPLAIN QUERY PLAN SELECT * FROM '+table+
       ' WHERE '+simpleNameSql(col)+' = ? COLLATE NOCASE').all('save')
       .map(r=>r.detail).join(' ');
     assert.match(plan,new RegExp(name),name);
   }
  }finally{db.close();}
  const service=new QueryService(root);
  try{assert.equal(service.findUsages('a.Target.save').length,1);}
  finally{service.close();}
 }finally{await writer.close();await rm(root,{recursive:true,force:true});}
});
