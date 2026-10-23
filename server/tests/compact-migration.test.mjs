import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import {MemoryIndex} from '../dist/memory-index.js';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';
import {handleCompactIndex} from '../dist/tools/compact_index.js';

test('compact_index migrate true explicitly resumes schema migration',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'compact-migrate-'));
 const mem=new MemoryIndex();mem.setIndexDir(root);
 const dbPath=path.join(mem.getIndexDir(),'index.db');
 const first=new SqliteStorage(mem.getIndexDir());
 try{
  await first.initialize();await first.close();
  const db=new Database(dbPath);
  try{
   db.exec('UPDATE schema_version SET version=2; DROP INDEX idx_refs_to_covering');
  }finally{db.close();}
  const result=await handleCompactIndex({migrate:true},mem);
  assert.ok(!result.isError,result.content?.[0]?.text);
  assert.match(result.content[0].text,/compaction complete/i);
  const check=new Database(dbPath);
  try{
   assert.equal(check.prepare('SELECT version FROM schema_version').get().version,3);
   assert.equal(check.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='idx_refs_to_covering'").get().n,1);
  }finally{check.close();}
 }finally{await rm(root,{recursive:true,force:true});}
});
