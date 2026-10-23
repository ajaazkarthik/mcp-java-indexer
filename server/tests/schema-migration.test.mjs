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
     old.function('ref_simple_name',{deterministic:true}, fqn=>fqn.split('.').pop());
     old.exec(`UPDATE schema_version SET version=2;
       DROP INDEX idx_refs_to_name;
       DROP INDEX idx_refs_to_covering;
       DROP INDEX idx_symbols_name_kind;
       CREATE INDEX idx_symbols_name ON symbols(name);
       CREATE INDEX idx_refs_to ON refs(to_fqn);
       CREATE INDEX idx_refs_to_name ON refs(ref_simple_name(to_fqn) COLLATE NOCASE,to_fqn);
       INSERT INTO refs(from_fqn,to_fqn,file,line,col,kind)
         VALUES ('old.Caller','old.Service.save','Old.java',2,1,'method_call');`);
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
     assert.equal(check.prepare('SELECT count(*) AS n FROM refs').get().n,1);
   }finally{check.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('interrupted schema migration retries safely after the second index log', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'migration-interrupt-'));
 const file=path.join(dir,'index.db');
 const original=console.error;
 try {
  const initial=new SqliteStorage(dir);
  await initial.initialize();
  await initial.close();
  const db=new Database(file);
  try {
   db.exec(`UPDATE schema_version SET version=2;
       DROP INDEX IF EXISTS idx_symbols_name_kind;
       DROP INDEX IF EXISTS idx_refs_to_name;
       DROP INDEX IF EXISTS idx_refs_to_covering;`);
  } finally {db.close();}
  const interrupted=new SqliteStorage(dir);
  let building=0;
  console.error=(...args)=>{
   const msg=args.join(' ');
   if(msg.startsWith('building index ') && ++building===2)
     throw new Error('simulated crash during migration');
  };
  await assert.rejects(interrupted.initialize(),/simulated crash/);
  console.error=original;
  // No version 3 marker is published for a partially created index set.
  const mid=new Database(file);
  try {
   assert.equal(mid.prepare('SELECT version FROM schema_version').get().version,2);
   assert.equal(mid.prepare(
     "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_symbols_name_kind'"
   ).get().n,1);
  }finally{mid.close();}
  // New connection must be able to rebuild all missing indexes without errors.
  const resumed=new SqliteStorage(dir);
  try {
   await resumed.initialize();
   const check=new Database(file);
   try {
    assert.equal(check.prepare('SELECT version FROM schema_version').get().version,3);
    for(const name of ['idx_symbols_name_kind','idx_refs_to_name','idx_refs_to_covering']){
     assert.equal(check.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE type=? AND name=?')
       .get('index',name).n,1,name);
    }
   }finally{check.close();}
  }finally{await resumed.close();}
 }finally{console.error=original;await rm(dir,{recursive:true,force:true});}
});
