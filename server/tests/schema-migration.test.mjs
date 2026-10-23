import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';

test('schema v2 upgrades explicitly and produces only the new reference indexes', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'schema-migrate-'));
 const dbPath=path.join(dir,'index.db');
 const initial=new SqliteStorage(dir);
 try{
   await initial.initialize();
   await initial.close();
   const old=new Database(dbPath);
   try{
     old.exec(`UPDATE schema_version SET version=2;
       DROP INDEX idx_refs_to_name;
       DROP INDEX idx_refs_to_covering;
       DROP INDEX idx_symbols_name_kind;
       CREATE INDEX idx_symbols_name ON symbols(name);
       CREATE INDEX idx_refs_to ON refs(to_fqn);`);
   }finally{old.close();}
   const logs=[];
   const original=console.error;
   const reopened=new SqliteStorage(dir);
   console.error=(...v)=>{logs.push(v.join(' '));};
   try{await reopened.initialize();}
   finally{console.error=original;await reopened.close();}
   assert.ok(logs.some(l=>l.includes('Migrating index to schema 3: building reference indexes')),
     'Expected migration log line');
   const check=new Database(dbPath);
   try {
     assert.equal(check.prepare('SELECT version FROM schema_version').get().version,3);
     const idx=check.prepare("SELECT name FROM sqlite_master WHERE type='index'")
       .all().map(x=>x.name);
     for(const required of ['idx_symbols_name_kind','idx_refs_to_name','idx_refs_to_covering']){
       assert.ok(idx.includes(required),required);
     }
     for(const obsolete of ['idx_symbols_name','idx_refs_to']){
       assert.ok(!idx.includes(obsolete),obsolete);
     }
     assert.equal(check.prepare(
       "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='call_edges_reverse'"
     ).get().n, 0);
     assert.equal(check.pragma('integrity_check',{simple:true}),'ok');
   }finally{check.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});
