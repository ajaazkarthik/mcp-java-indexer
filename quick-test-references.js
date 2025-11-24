#!/usr/bin/env node
/**
 * Quick test - Check if references are being extracted
 */

const path = require('path');
const fs = require('fs');

async function test() {
  console.log('🧪 Testing if references are extracted\n');
  
  const testProject = path.join(__dirname, 'example-java-project');
  
  try {
    // Clean old index
    const indexDir = path.join(testProject, '.mcp-index');
    if (fs.existsSync(indexDir)) {
      fs.rmSync(indexDir, { recursive: true, force: true });
    }
    
    const { MemoryIndex } = require('./server/dist/memory-index.js');
    const { IndexerClient } = require('./server/dist/indexer-client.js');
    const { handleIndexProject } = require('./server/dist/tools/index_project.js');
    
    const memoryIndex = new MemoryIndex();
    memoryIndex.setIndexDir(testProject);
    const indexerClient = new IndexerClient();
    await indexerClient.start();
    
    console.log('📦 Indexing...');
    await handleIndexProject({ rootDir: testProject }, memoryIndex, indexerClient, () => {});
    
    const stats = memoryIndex.getStats();
    console.log('\n📊 Results:');
    console.log(`   Symbols: ${stats.symbols}`);
    console.log(`   References: ${stats.references}`);
    console.log(`   Call Graph Edges: ${stats.callGraphEdges}`);
    console.log(`   Inheritance: ${stats.inheritanceRelations}`);
    
    if (stats.references === 0) {
      console.log('\n❌ ISSUE: References are 0!');
      console.log('   This means either:');
      console.log('   1. Java indexer is not extracting references');
      console.log('   2. References are being lost during indexing');
      console.log('   3. Storage/persistence issue');
    } else {
      console.log('\n✅ References are being extracted correctly!');
    }
    
    await indexerClient.stop();
    process.exit(stats.references === 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
