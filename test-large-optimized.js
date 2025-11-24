#!/usr/bin/env node
/**
 * Full Large Project Test with OPTIMIZED storage
 * Expected: ~90 seconds for 12k files
 */

const path = require('path');
const fs = require('fs');

async function testLargeProject() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  FULL LARGE PROJECT TEST (12k files)                         ║');
  console.log('║  Expected time: ~90 seconds (was 30+ minutes before)         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const largeProject = path.join(__dirname, 'large-java-project');
  
  if (!fs.existsSync(largeProject)) {
    console.error('❌ large-java-project not found');
    process.exit(1);
  }
  
  // Clean old index
  const indexDir = path.join(largeProject, '.mcp-index');
  if (fs.existsSync(indexDir)) {
    try { 
      fs.rmSync(indexDir, { recursive: true, force: true }); 
      console.log('✅ Cleaned old index');
    } catch (e) {
      console.log('⚠️  Could not clean index, will use incremental');
    }
  }
  
  const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
  const { IndexerClient } = require('./server/dist/indexer-client.js');
  const { handleIndexProject } = require('./server/dist/tools/index_project.js');
  
  const memoryIndex = new MemoryIndexWithStorage();
  memoryIndex.setIndexDir(largeProject);
  const indexerClient = new IndexerClient();
  await indexerClient.start();
  
  console.log('📊 Starting indexing...\n');
  const startTime = Date.now();
  
  await handleIndexProject(
    { rootDir: largeProject },
    memoryIndex,
    indexerClient,
    () => {}
  );
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Flush
  console.log('\n💾 Flushing to storage...');
  const flushStart = Date.now();
  await memoryIndex.flush();
  const flushTime = ((Date.now() - flushStart) / 1000).toFixed(1);
  
  const stats = memoryIndex.getStats();
  
  await indexerClient.stop();
  await memoryIndex.close();
  
  console.log('\n' + '═'.repeat(60));
  console.log('  RESULTS');
  console.log('═'.repeat(60));
  console.log(`\n⏱️  Total Time: ${totalTime}s (+ ${flushTime}s flush)`);
  console.log(`📁 Files: ${stats.indexedFiles || stats.allFiles}`);
  console.log(`🔣 Symbols: ${stats.symbols}`);
  console.log(`🔗 References: ${stats.references}`);
  console.log(`📞 Call Graph: ${stats.callGraphEdges}`);
  console.log(`🧬 Inheritance: ${stats.inheritanceRelations}`);
  
  // Verdict
  console.log('\n' + '─'.repeat(60));
  
  if (parseFloat(totalTime) > 300) {
    console.log('❌ STILL TOO SLOW - over 5 minutes');
    process.exit(1);
  } else if (parseFloat(totalTime) > 120) {
    console.log('⚠️  ACCEPTABLE - under 2 minutes');
  } else {
    console.log('✅ FAST - under 2 minutes!');
  }
  
  if (stats.references === 0) {
    console.log('❌ CRITICAL: Zero references - bug is back!');
    process.exit(1);
  }
  
  console.log('\n✅ Large project test complete');
}

testLargeProject().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
