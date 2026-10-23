import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {MemoryIndex} from '../dist/memory-index.js';
import {QueryService} from '../dist/query-service.js';
import {handleIndexProject} from '../dist/tools/index_project.js';

test('index_project relative root opens QueryService at normalized path',async()=>{
 const root=await mkdtemp(path.join(process.cwd(),'relative-root-'));
 let watcher,persistence;
 try {
  const file=path.join(root,'Demo.java');
  await writeFile(file,'package example; public class Demo {}');
  const memory=new MemoryIndex();
  const client={
   async start(){},
   async indexFiles(paths){
    return paths.map(file=>({
     file,
     symbols:[{fqn:'example.Demo',name:'Demo',kind:'class',
       file,line:1,column:1,packageName:'example',modifiers:[]}],
     references:[]
    }));
   }
  };
  const relative=path.relative(process.cwd(),root);
  assert.ok(!path.isAbsolute(relative));
  let callbackRoot;
  const result=await handleIndexProject({
   rootDir:relative,sourceRoots:['.'],forceFullIndex:true
  },memory,client,(newWatcher,newPersistence,normalizedRoot)=>{
   watcher=newWatcher;persistence=newPersistence;callbackRoot=normalizedRoot;
   const service=new QueryService(normalizedRoot);
   try {
    assert.equal(service.findSymbols('Demo').length,1);
   }finally{service.close();}
  });
  assert.ok(!result.isError,'index_project failed: '+result.content[0].text);
  assert.equal(callbackRoot,memory.getProjectRootDir());
  const metadata=JSON.parse(await readFile(path.join(root,'.mcp-index','metadata.json'),'utf8'));
  assert.equal(metadata.version,'3.2');
 }finally{
  if(watcher) await watcher.stop();
  if(persistence) await persistence.close();
  await rm(root,{recursive:true,force:true});
 }
});
