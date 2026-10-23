import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';
import {QueryService} from '../dist/query-service.js';
import {handleFindUsages} from '../dist/tools/find_usages.js';

test('6000 fuzzy refs capped at 5000 with MCP output notice; exact FQN unlimited', async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'usage-limit-'));
 const store=new SqliteStorage(path.join(root,'.mcp-index'));
 try {
  await store.initialize();
  const rows=Array.from({length:6000},(_,i)=>({
   fromFqn:'example.From'+i,toFqn:'example.Other'+i+'.save',
   file:'/tmp/U'+i+'.java',line:i+1,column:1,kind:'method_call'
  }));
  await store.saveReferences(rows);
  const query=new QueryService(root);
  try{
   const fuzzy=query.findUsages('example.Target.save');
   assert.equal(fuzzy.length,5000);
   assert.equal(query.wasUsageSearchTruncated(),true);
   const output=await handleFindUsages({fqn:'example.Target.save'},query);
   assert.ok(!output.isError,output.content?.[0]?.text?.slice(0,200));
   assert.match(output.content[0].text,/showing first 5000 fuzzy matches/);
  }finally{query.close();}
  // Same source database: exact matches must NOT be capped.
  await store.saveReferences(Array.from({length:6000},(_,i)=>({
   fromFqn:'exact.Caller'+i,toFqn:'example.Target.save',
   file:'/tmp/E'+i+'.java',line:i+1,column:1,kind:'method_call'
  })));
  const exact=new QueryService(root);
  try {
   const hits=exact.findUsages('example.Target.save');
   assert.ok(hits.length>=6000,'Exact matches must bypass the 5000 fuzzy cap');
  }finally{exact.close();}
 }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
