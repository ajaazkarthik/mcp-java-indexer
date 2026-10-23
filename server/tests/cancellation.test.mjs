import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {MemoryIndex} from '../dist/memory-index.js';
import {handleSearchText} from '../dist/tools/search_text.js';
import {handleFindSymbol} from '../dist/tools/find_symbol.js';
test('pre-cancelled requests reject early', async () => {
 const r=await handleFindSymbol({name:'Demo'},new MemoryIndex(),AbortSignal.abort());
 assert.equal(r.isError,true);
 assert.match(r.content[0].text,/cancelled/i);
});
test('search_text cancels within one second', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'search-cancel-'));
 try {
  const memory=new MemoryIndex();
  for(let i=0;i<130;i++){
   const file=path.join(dir,String(i)+'.java');
   await writeFile(file,'class Demo {}\n');
   memory.addFile(file,String(i),[],true);
  }
  const ctrl=new AbortController();
  const start=performance.now();
  const resultPromise=handleSearchText({pattern:'Demo'},memory,ctrl.signal);
  setImmediate(()=>ctrl.abort());
  const result=await resultPromise;
  assert.equal(result.isError,true);
  assert.match(result.content[0].text,/cancelled/i);
  assert.ok(performance.now()-start<1000);
  console.log('search_text cancellation: '+(performance.now()-start).toFixed(2)+' ms');
 } finally {await rm(dir,{recursive:true,force:true});}
});