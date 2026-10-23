import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';
import {QueryService} from '../dist/query-service.js';
import {MemoryIndex} from '../dist/memory-index.js';
import {Persistence} from '../dist/persistence.js';
import {handleExploreClass} from '../dist/tools/explore_class.js';

test('release gate: 50k symbols, 200k references, indexed MCP read paths', async ()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'java-index-bench-'));
 const dir=path.join(root,'.mcp-index');
 const write=new SqliteStorage(dir);
 try {
  await write.initialize();
  const symbols=Array.from({length:49998},(_,i)=>({
    fqn:'example.Other'+i,name:'Other'+i,kind:'class',
    file:'/tmp/Other.java',line:i+1,column:1,packageName:'example',modifiers:[]
  }));
  symbols.push({fqn:'example.Target',name:'Target',kind:'class',
    file:'/tmp/Target.java',line:1,column:1,packageName:'example',modifiers:[]});
  symbols.push({fqn:'example.Target.save',name:'save',kind:'method',
    file:'/tmp/Target.java',line:2,column:1,packageName:'example',
    declaringClass:'example.Target',modifiers:[]});
  await write.saveSymbols(symbols);
  const references=Array.from({length:199999},(_,i)=>({
    fromFqn:'example.Other'+i+'.run',
    toFqn:'example.Service.method'+i,
    file:'/tmp/Other.java',line:i+1,column:1,kind:'method_call'
  }));
  references.push({fromFqn:'example.Client.execute',toFqn:'example.Target.save',
    file:'/tmp/Client.java',line:3,column:2,kind:'method_call'});
  await write.saveReferences(references);
  await write.saveCallEdges([{caller:'example.Client.execute',callee:'example.Target.save',
    locations:[{file:'/tmp/Client.java',line:3,column:2}]}],'forward');
  await write.saveFile({path:'/tmp/Target.java',hash:'abc',lastIndexed:1,mtime:1,
    symbols:['example.Target','example.Target.save']});
  const query=new QueryService(root);
  try {
   const exactStarted=performance.now();
   const found=query.findSymbols('Target');
   const exactElapsed=performance.now()-exactStarted;
   assert.equal(found.length,1);
   assert.ok(exactElapsed<10,'findSymbols exact >10ms');
   console.log('50k exact find symbol: '+exactElapsed.toFixed(3)+' ms');

   const expr="replace(to_fqn, rtrim(to_fqn, replace(to_fqn, '.', '')), '')";
   const usagesPlan=query.explainQueryPlan(
     'SELECT id FROM refs WHERE '+expr+' = ? COLLATE NOCASE','save');
   assert.match(usagesPlan,/idx_refs_to_name/);
   assert.doesNotMatch(usagesPlan,/SCAN refs\\b/);
   const usageStarted=performance.now();
   assert.equal(query.findUsages('save').length,1);
   const usageMs=performance.now()-usageStarted;
   assert.ok(usageMs<50,'cold findUsages >50ms');
   console.log('200k simple-name usages: '+usageMs.toFixed(3)+' ms');

   const sql='SELECT id FROM refs WHERE from_fqn = ? OR (from_fqn >= ? AND from_fqn < ?) OR (from_fqn >= ? AND from_fqn < ?)';
   const max=String.fromCharCode(0xffff);
   const plan=query.explainQueryPlan(sql,'example.Client','example.Client.','example.Client.'+max,
     'example.Client(','example.Client('+max);
   assert.match(plan,/idx_refs_from/);
   assert.doesNotMatch(plan,/SCAN refs\\b/);
   assert.equal(query.findReferencesFromClass('example.Client').length,1);

   const observed=[];
   query.setStatementObserver(name=>observed.push(name));
   assert.equal(query.getInboundCalls('example.Target.save').length,1);
   query.setStatementObserver();
   assert.deepEqual(observed,['inboundExact']);
   console.log('Inbound exact call: 1 prepared statement');

   // Full-index iteration is prohibited on class exploration hot paths.
   const oldAllSymbols=query.getAllSymbols;
   query.getAllSymbols=()=>{throw new Error('Unexpected full symbol table iteration');};
   const classStarted=performance.now();
   const explored=await handleExploreClass({className:'example.Target'},query);
   const classMs=performance.now()-classStarted;
   query.getAllSymbols=oldAllSymbols;
   assert.ok(!explored.isError);
   assert.match(explored.content[0].text,/Class Exploration/);
   assert.ok(classMs<200,'explore_class >200ms');
   console.log('50k explore_class: '+classMs.toFixed(3)+' ms');
  } finally {query.close();}

  const index=new MemoryIndex();
  index.setIndexDir(root);
  const persistence=new Persistence(dir);
  try {
   assert.equal(await persistence.load(index),true);
   if(global.gc) global.gc();
   const heapMB=process.memoryUsage().heapUsed/1024/1024;
   assert.ok(heapMB<300,'idle heap >=300 MiB');
   assert.equal(index.getAllSymbols().size,0);
   console.log('Idle heap after persistence.load: '+heapMB.toFixed(1)+' MiB');
  } finally{await persistence.close();}
 } finally {await write.close();await rm(root,{recursive:true,force:true});}
});
