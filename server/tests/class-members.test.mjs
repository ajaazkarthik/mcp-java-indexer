import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';
import {QueryService} from '../dist/query-service.js';
import {handleExploreClass} from '../dist/tools/explore_class.js';

test('explore_class uses member lookups without full-table symbol read', async () => {
 const root=await mkdtemp(path.join(os.tmpdir(),'member-lookup-'));
 const dir=path.join(root,'.mcp-index');
 const storage=new SqliteStorage(dir);
 try {
  await storage.initialize();
  const total=process.env.BENCH_50K ? 50000 : 5000;
  const symbols=Array.from({length:total-2},(_,i)=>({
    fqn:'example.Other'+i,name:'Other'+i,kind:'class',file:'/tmp/Other'+i+'.java',
    line:1,column:1,packageName:'example',modifiers:[]
  }));
  symbols.push({fqn:'example.Target',name:'Target',kind:'class',file:'/tmp/Target.java',
    line:1,column:1,packageName:'example',modifiers:[]});
  symbols.push({fqn:'example.Target.run',name:'run',kind:'method',file:'/tmp/Target.java',
    line:2,column:1,declaringClass:'example.Target',packageName:'example',modifiers:[]});
  await storage.saveSymbols(symbols);
  const query=new QueryService(root);
  try {
   query.getAllSymbols = () => {throw new Error('unexpected full symbol read');};
   const start=performance.now();
   const result=await handleExploreClass({className:'example.Target'},query);
   const elapsed=performance.now()-start;
   assert.ok(!result.isError,'Unexpected tool error');
   assert.match(result.content[0].text,/Class Exploration/);
   assert.match(result.content[0].text,/Methods.*1/);
   const members=query.getMembers('example.Target');
   assert.equal(members.length,1);
   console.log('explore_class '+total+' symbols: '+elapsed.toFixed(3)+' ms');
   if (process.env.BENCH_50K) assert.ok(elapsed<200, 'explore_class >200ms');
  } finally {query.close();}
 }finally{await storage.close();await rm(root,{recursive:true,force:true});}
});
