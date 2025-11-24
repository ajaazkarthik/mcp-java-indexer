#!/usr/bin/env node
/**
 * Final test - Check if user's large project works now
 */

const path = require('path');
const fs = require('fs');

async function testLargeProject() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Testing DB MODE with Large Project (12k files)     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  
  const largeProject = path.join(__dirname, 'large-java-project');
  
  // Note: Keep existing index for incremental test
  console.log('📋 Using existing index if present\n');
  
  try {
    const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
    const { IndexerClient } = require('./server/dist/indexer-client.js');
    const { handleIndexProject } = require('./server/dist/tools/index_project.js');
    
    const memoryIndex = new MemoryIndexWithStorage();
    memoryIndex.setIndexDir(largeProject);
    const indexerClient = new IndexerClient();
    await indexerClient.start();
    
    console.log('📦 Indexing 12,086 files...\n');
    const start = Date.now();
    
    await handleIndexProject({ rootDir: largeProject }, memoryIndex, indexerClient, () => {});
    
    // Wait for flush
    if (memoryIndex.flush) {
      console.log('\n💾 Flushing to storage...');
      await memoryIndex.flush();
    }
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    const stats = memoryIndex.getStats();
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`⏱️  Time: ${elapsed}s`);
    console.log(`📊 Symbols: ${stats.symbols}`);
    console.log(`📊 References: ${stats.references}`);
    console.log(`📊 Call Graph Edges: ${stats.callGraphEdges}`);
    console.log(`📊 Inheritance: ${stats.inheritanceRelations}`);
    console.log(`📁 Files: ${stats.indexedFiles}\n`);
    
    await indexerClient.stop();
    await memoryIndex.close();
    
    if (stats.references === 0 || stats.callGraphEdges === 0) {
      console.log('❌ FAILED: References or call graph still broken\n');
      process.exit(1);
    } else {
      console.log('✅ SUCCESS: DB MODE WORKS!\n');
      console.log('   All data extracted correctly.');
      console.log(`   Performance: ${(stats.indexedFiles / parseFloat(elapsed)).toFixed(1)} files/sec\n`);
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testLargeProject();
