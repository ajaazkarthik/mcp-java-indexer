import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MemoryIndex } from '../dist/memory-index.js';
import { Persistence } from '../dist/persistence.js';
import { QueryService } from '../dist/query-service.js';

test('metadata-only load and lazy SQLite queries keep symbols and refs off heap', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'index-query-'));
  const memory=new MemoryIndex();
  memory.setIndexDir(dir);
  const persist=new Persistence(memory.getIndexDir());
  try {
    const file=path.join(dir,'Demo.java');
    memory.addSymbol({fqn:'example.Demo',name:'Demo',kind:'class',
      file,line:1,column:1,packageName:'example',modifiers:[]});
    memory.addReference({fromFqn:'example.Other.call',toFqn:'example.Demo',
      file,line:2,column:1,kind:'type_reference'});
    memory.addFile(file,'abc',['example.Demo'],true);
    await persist.save(memory);
    assert.equal(await persist.load(memory),true);
    assert.equal(memory.getAllSymbols().size,0);
    assert.equal(memory.getStats().symbols,1);
    const query=new QueryService(dir);
    try {
      assert.equal(query.getSymbol('example.Demo')?.name,'Demo');
      assert.equal(query.findSymbols('Demo').length,1);
      assert.equal(query.findUsages('example.Demo').length,1);
      assert.equal(query.getAllSymbols().size,1);
      assert.equal([...query.getAllSymbols().values()].length,1);
      assert.equal(query.getAllFiles().length,1);
    } finally { query.close(); }
  } finally {
    await persist.close();
    await rm(dir,{recursive:true,force:true});
  }
});
