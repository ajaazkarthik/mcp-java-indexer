import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {MemoryIndex} from '../dist/memory-index.js';
import {Persistence} from '../dist/persistence.js';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';
import {QueryService} from '../dist/query-service.js';

test('incremental save retains all unchanged rows on a populated index', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'index-delta-'));
  const memory = new MemoryIndex();
  memory.setIndexDir(dir);
  const persistence = new Persistence(memory.getIndexDir());
  try {
    const count = process.env.BENCH_10K ? 10000 : 400;
    for (let i=0;i<count;i++) {
      const file=path.join(dir, 'F' + i + '.java');
      const fqn='example.F'+i;
      memory.addSymbol({fqn,name:'F'+i,kind:'class',file,line:1,column:1,
        packageName:'example',modifiers:[]});
      memory.addFile(file,'hash'+i,[fqn],true);
    }
    await persistence.save(memory);
    const before = new SqliteStorage(memory.getIndexDir());
    await before.initialize();
    const original=await before.getStats();
    await before.close();

    const file=path.join(dir,'F1.java');
    memory.removeFile(file);
    memory.addSymbol({fqn:'example.F1',name:'F1',kind:'class',file,line:2,column:1,
      packageName:'example',modifiers:[]});
    memory.addFile(file,'hash-updated',['example.F1'],true);
    const started=performance.now();
    await persistence.save(memory);
    const elapsed=performance.now()-started;
    if (process.env.BENCH_10K) {
      // Verify the metadata-only reload under the target 10k-file fixture.
      const loaded=await persistence.load(memory);
      assert.equal(loaded,true);
      assert.equal(memory.getAllSymbols().size,0);
      const heap=process.memoryUsage().heapUsed/1024/1024;
      console.log('Idle heap after metadata-only 10k load: '+heap.toFixed(1)+' MiB');
      assert.ok(heap<300,'Idle heap exceeds 300 MiB');
    }
    const check=new QueryService(dir);
    try {
      const updated=check.getSymbol('example.F1');
      const untouched=check.getSymbol('example.F2');
      const after=check.getStats();
      assert.equal(updated.line,2);
      assert.equal(untouched.line,1);
      assert.equal(after.symbols,original.symbols);
      console.log('reindex_file delta on ' + count + ' files: ' + elapsed.toFixed(2) + ' ms');
      if (process.env.BENCH_10K) assert.ok(elapsed<1000,'10k file delta exceeds 1 second');
    } finally {
      check.close();
    }
  } finally {
    await persistence.close();
    await rm(dir,{recursive:true,force:true});
  }
});


test('incremental reindex preserves call graph and inheritance', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'index-relations-'));
  const memory=new MemoryIndex();
  memory.setIndexDir(dir);
  const persistence=new Persistence(memory.getIndexDir());
  try {
    const file=path.join(dir,'Child.java');
    const symbols=[
      {fqn:'example.Child',name:'Child',kind:'class',extendsClass:'example.Parent',
       file,line:1,column:1,packageName:'example',modifiers:[]},
      {fqn:'example.Child.run',name:'run',kind:'method',file,line:2,column:1,
       declaringClass:'example.Child',packageName:'example',modifiers:[]}
    ];
    const refs=[{fromFqn:'example.Child.run',toFqn:'example.Service.save',file,
      line:10,column:4,kind:'method_call'}];
    await persistence.saveFileIncremental(file,symbols,refs,
      {path:file,hash:'before',lastIndexed:1,mtime:1,symbols:symbols.map(s=>s.fqn)});
    const storage=new QueryService(dir);
    try {
      assert.equal(storage.getInboundCalls('example.Service.save').length,1);
      assert.deepEqual(storage.getParents('example.Child'),['example.Parent']);
    } finally {storage.close();}
    await persistence.saveFileIncremental(file,symbols,refs,
      {path:file,hash:'after',lastIndexed:2,mtime:2,symbols:symbols.map(s=>s.fqn)});
    const second=new QueryService(dir);
    try {
      assert.equal(second.getInboundCalls('example.Service.save').length,1);
      assert.equal(second.getStats().references,1);
    } finally {second.close();}
  } finally {
    await persistence.close();
    await rm(dir,{recursive:true,force:true});
  }
});
