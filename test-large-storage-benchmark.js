/**
 * LARGE PROJECT PERFORMANCE BENCHMARK
 * 
 * Tests storage backend with large-java-project (12,086 files)
 * Measures:
 * 1. Indexing time
 * 2. Memory usage
 * 3. Query performance
 * 4. Storage efficiency
 */

// Force storage mode
process.env.ENABLE_STORAGE = '1';

const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
const { IndexerClient } = require('./server/dist/indexer-client.js');
const path = require('path');
const fs = require('fs/promises');

async function benchmarkLargeProject() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  LARGE PROJECT PERFORMANCE BENCHMARK');
  console.log('  Project: large-java-project (12,086 files)');
  console.log('  Mode: ENABLE_STORAGE=1');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const testDir = path.join(__dirname, 'large-java-project');
  
  // Check if project exists
  try {
    await fs.access(testDir);
  } catch {
    console.log('❌ large-java-project not found!');
    return false;
  }
  
  const memoryIndex = new MemoryIndexWithStorage();
  memoryIndex.setIndexDir(testDir);
  
  const indexerClient = new IndexerClient();
  await indexerClient.start();
  
  // Wait for storage init
  await new Promise(resolve => setTimeout(resolve, 300));
  
  console.log('📊 Baseline Memory:');
  const baseMem = process.memoryUsage();
  console.log(`   Heap Used: ${(baseMem.heapUsed / 1024 / 1024).toFixed(1)}MB`);
  console.log(`   RSS: ${(baseMem.rss / 1024 / 1024).toFixed(1)}MB\n`);
  
  // Benchmark 1: Full indexing
  console.log('📦 Benchmark 1: Full Project Indexing');
  console.log('   This will take several minutes...\n');
  
  const { handleIndexProject } = require('./server/dist/tools/index_project.js');
  
  const indexStart = Date.now();
  let indexResult;
  
  try {
    indexResult = await handleIndexProject(
      { rootDir: testDir },
      memoryIndex,
      indexerClient
    );
    
    const indexDuration = (Date.now() - indexStart) / 1000;
    
    console.log(`   ✅ Indexing completed in ${indexDuration.toFixed(1)}s`);
    console.log(`      (${(12086 / indexDuration).toFixed(0)} files/sec)\n`);
    
    // Wait for all writes to flush
    console.log('   ⏳ Flushing to storage...');
    await memoryIndex.flush();
    console.log('   ✅ Flush complete\n');
    
  } catch (error) {
    console.log(`   ❌ Indexing failed: ${error.message}\n`);
    await indexerClient.stop();
    await memoryIndex.close();
    return false;
  }
  
  // Benchmark 2: Memory usage
  console.log('💾 Benchmark 2: Memory Usage After Indexing');
  
  const afterMem = process.memoryUsage();
  const heapIncrease = (afterMem.heapUsed - baseMem.heapUsed) / 1024 / 1024;
  const rssIncrease = (afterMem.rss - baseMem.rss) / 1024 / 1024;
  
  console.log(`   Heap Used: ${(afterMem.heapUsed / 1024 / 1024).toFixed(1)}MB (+${heapIncrease.toFixed(1)}MB)`);
  console.log(`   RSS: ${(afterMem.rss / 1024 / 1024).toFixed(1)}MB (+${rssIncrease.toFixed(1)}MB)`);
  
  const stats = memoryIndex.getStats();
  console.log(`   Cached Symbols: ${stats.symbols}`);
  console.log(`   Indexed Files: ${stats.indexedFiles}\n`);
  
  // Check database size
  const dbPath = path.join(testDir, '.mcp-index', 'index.db');
  try {
    const dbStats = await fs.stat(dbPath);
    const dbSizeMB = dbStats.size / 1024 / 1024;
    console.log(`   Database Size: ${dbSizeMB.toFixed(1)}MB`);
    
    // Memory efficiency ratio
    const efficiency = (heapIncrease / dbSizeMB).toFixed(2);
    console.log(`   Efficiency Ratio: ${efficiency}x (heap/storage)\n`);
  } catch (error) {
    console.log(`   ⚠️  Database file not accessible\n`);
  }
  
  // Benchmark 3: Query performance
  console.log('🔍 Benchmark 3: Query Performance');
  
  // Test 1: Find symbol (cache hit)
  const findStart1 = Date.now();
  const result1 = memoryIndex.findSymbols('Component001_000');
  const findTime1 = Date.now() - findStart1;
  console.log(`   Find Symbol (1st time): ${findTime1}ms - ${result1.length} results`);
  
  // Test 2: Find same symbol (cache hit)
  const findStart2 = Date.now();
  const result2 = memoryIndex.findSymbols('Component001_000');
  const findTime2 = Date.now() - findStart2;
  console.log(`   Find Symbol (cached): ${findTime2}ms - ${result2.length} results`);
  
  // Test 3: Find different symbol
  const findStart3 = Date.now();
  const result3 = memoryIndex.findSymbols('Component050_010');
  const findTime3 = Date.now() - findStart3;
  console.log(`   Find Symbol (different): ${findTime3}ms - ${result3.length} results`);
  
  // Test 4: Find usages
  if (result1.length > 0) {
    const usagesStart = Date.now();
    const usages = memoryIndex.findUsages(result1[0].fqn);
    const usagesTime = Date.now() - usagesStart;
    console.log(`   Find Usages: ${usagesTime}ms - ${usages.length} usages`);
  }
  
  // Test 5: Call graph
  const methods = memoryIndex.findSymbols('process');
  if (methods.length > 0) {
    const callGraphStart = Date.now();
    const calls = memoryIndex.getOutboundCalls(methods[0].fqn);
    const callGraphTime = Date.now() - callGraphStart;
    console.log(`   Call Graph: ${callGraphTime}ms - ${calls.length} edges\n`);
  } else {
    console.log(`   Call Graph: (no test method found)\n`);
  }
  
  // Benchmark 4: Cache efficiency
  console.log('📊 Benchmark 4: Cache Statistics');
  
  // Force cleanup to see cache behavior
  memoryIndex.performMaintenanceCleanup();
  
  const afterCleanup = process.memoryUsage();
  const cleanupFreed = (afterMem.heapUsed - afterCleanup.heapUsed) / 1024 / 1024;
  
  console.log(`   Memory freed by cleanup: ${cleanupFreed.toFixed(1)}MB`);
  
  const statsAfterCleanup = memoryIndex.getStats();
  console.log(`   Cached symbols after cleanup: ${statsAfterCleanup.symbols}`);
  console.log(`   Cache reduction: ${((1 - statsAfterCleanup.symbols / stats.symbols) * 100).toFixed(1)}%\n`);
  
  // Final summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('  BENCHMARK RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  
  console.log(`\n  📦 Indexing:`);
  console.log(`     Time: ${((Date.now() - indexStart) / 1000).toFixed(1)}s`);
  console.log(`     Speed: ${(12086 / ((Date.now() - indexStart) / 1000)).toFixed(0)} files/sec`);
  
  console.log(`\n  💾 Memory:`);
  console.log(`     Heap increase: ${heapIncrease.toFixed(1)}MB`);
  console.log(`     Target: <100MB ✅ ${heapIncrease < 100 ? 'PASS' : 'FAIL'}`);
  
  console.log(`\n  🔍 Query Performance:`);
  console.log(`     Average find: ${((findTime1 + findTime2 + findTime3) / 3).toFixed(1)}ms`);
  console.log(`     Target: <100ms ✅ ${((findTime1 + findTime2 + findTime3) / 3) < 100 ? 'PASS' : 'FAIL'}`);
  
  console.log(`\n  💿 Storage:`);
  try {
    const dbStats = await fs.stat(dbPath);
    const dbSizeMB = dbStats.size / 1024 / 1024;
    console.log(`     Database size: ${dbSizeMB.toFixed(1)}MB`);
    console.log(`     Target: <100MB ✅ ${dbSizeMB < 100 ? 'PASS' : 'FAIL'}`);
  } catch {
    console.log(`     Database size: Unknown`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════\n');
  
  // Cleanup
  await indexerClient.stop();
  await memoryIndex.close();
  
  // Overall verdict
  if (heapIncrease < 100) {
    console.log('🎉 BENCHMARK PASSED!');
    console.log('   Storage backend handles large projects efficiently.\n');
    return true;
  } else {
    console.log('⚠️  BENCHMARK WARNING');
    console.log('   Memory usage higher than expected.\n');
    return false;
  }
}

benchmarkLargeProject().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('\n❌ Benchmark failed:', error);
  console.error(error.stack);
  process.exit(1);
});
