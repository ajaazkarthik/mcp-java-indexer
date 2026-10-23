import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';
import {QueryService} from '../dist/query-service.js';

test('QueryService uses compound index for exact simple-class lookup',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'query-symbol-'));
 const store=new SqliteStorage(path.join(root,'.mcp-index'));
 try{
  await store.initialize();
  const symbols=Array.from({length:15000},(_,i)=>({
    fqn:'example.Other'+i,name:'Other'+i,kind:'class',
    file:'/tmp/Other.java',line:i,column:1,packageName:'example',modifiers:[]
  }));
  symbols.push({fqn:'example.Target',name:'RareExactClass',kind:'class',
    file:'/tmp/Rare.java',line:1,column:1,packageName:'example',modifiers:[]});
  await store.saveSymbols(symbols);
  const query=new QueryService(root);
  try{
   const plan=query.explainQueryPlan('SELECT data FROM symbols WHERE name = ? LIMIT 50','RareExactClass');
   assert.match(plan,/idx_symbols_name_kind/);
   assert.doesNotMatch(plan,/SCAN symbols\b/);
   const start=performance.now();
   const found=query.findSymbols('RareExactClass');
   const elapsed=performance.now()-start;
   assert.equal(found.length,1);
   assert.equal(found[0].fqn,'example.Target');
   assert.ok(elapsed<10,'Exact symbol lookup took '+elapsed+'ms');
   console.log('QueryService exact class: '+elapsed.toFixed(3)+' ms');
  }finally{query.close();}
 }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
