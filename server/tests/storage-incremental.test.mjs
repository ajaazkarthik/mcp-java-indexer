import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {MemoryIndex} from '../dist/memory-index.js';
import {Persistence} from '../dist/persistence.js';
import {SqliteStorage} from '../dist/storage/sqlite-storage.js';

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
    const check=new SqliteStorage(memory.getIndexDir());
    await check.initialize();
    try {
      const updated=await check.getSymbol('example.F1');
      const untouched=await check.getSymbol('example.F2');
      const after=await check.getStats();
      assert.equal(updated.line,2);
      assert.equal(untouched.line,1);
      assert.equal(after.symbols,original.symbols);
      console.log('reindex_file delta on ' + count + ' files: ' + elapsed.toFixed(2) + ' ms');
      if (process.env.BENCH_10K) assert.ok(elapsed<1000,'10k file delta exceeds 1 second');
    } finally {
      await check.close();
    }
  } finally {
    await persistence.close();
    await rm(dir,{recursive:true,force:true});
  }
});
