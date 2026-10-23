import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Persistence} from '../dist/persistence.js';
import {QueryService} from '../dist/query-service.js';

test('DiskSymbolMap size invalidates after same-session saveFileIncremental',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'size-invalidate-'));
 const p=new Persistence(path.join(root,'.mcp-index'));
 try {
  await p.saveFileIncremental('/tmp/A.java',
   [{fqn:'example.A',name:'A',kind:'class',file:'/tmp/A.java',
     line:1,column:1,packageName:'example',modifiers:[]}],[],
   {path:'/tmp/A.java',hash:'a',lastIndexed:1,mtime:1,symbols:['example.A']});
  const query=new QueryService(root);
  try {
   assert.equal(query.getAllSymbols().size,1);
   await p.saveFileIncremental('/tmp/B.java',
    [{fqn:'example.B',name:'B',kind:'class',file:'/tmp/B.java',
      line:1,column:1,packageName:'example',modifiers:[]}],[],
    {path:'/tmp/B.java',hash:'b',lastIndexed:2,mtime:2,symbols:['example.B']});
   assert.equal(query.getAllSymbols().size,1,'size is cached until invalidation');
   query.invalidateCaches();
   assert.equal(query.getAllSymbols().size,2);
   assert.equal(query.getSymbol('example.B').name,'B');
  }finally{query.close();}
 }finally{await p.close();await rm(root,{recursive:true,force:true});}
});
