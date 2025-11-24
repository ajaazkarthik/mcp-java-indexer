#!/usr/bin/env node
/**
 * ISOLATE PERFORMANCE ISSUE
 * 
 * Compare:
 * 1. Pure Java parser (fast)
 * 2. FILE MODE (in-memory) 
 * 3. DB MODE (storage)
 * 
 * This will show exactly where the slowdown is.
 */

const path = require('path');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, msg) {
  console.log(`${color}${msg}${colors.reset}`);
}

async function testScenario(name, setupFn, processFn, teardownFn) {
  log(colors.cyan, `\n📊 ${name}`);
  
  await setupFn();
  
  const startTime = Date.now();
  const result = await processFn();
  const elapsed = Date.now() - startTime;
  
  await teardownFn();
  
  log(colors.green, `   Time: ${elapsed}ms (${(result.files / (elapsed / 1000)).toFixed(1)} files/sec)`);
  log(colors.blue, `   Files: ${result.files}, Symbols: ${result.symbols}, Refs: ${result.references}`);
  
  return elapsed;
}

async function runIsolatedTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ISOLATED PERFORMANCE TEST - Finding the Bottleneck         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  const largeProject = path.join(__dirname, 'large-java-project');
  
  if (!fs.existsSync(largeProject)) {
    log(colors.red, 'large-java-project not found');
    process.exit(1);
  }
  
  const glob = require('glob');
  const allFiles = glob.sync('**/*.java', {
    cwd: largeProject,
    absolute: true,
    ignore: ['**/target/**', '**/build/**']
  });
  
  log(colors.blue, `\nTotal files in large project: ${allFiles.length}`);
  
  // Test with 1000 files for faster iteration
  const testFiles = allFiles.slice(0, 1000);
  log(colors.blue, `Testing with ${testFiles.length} files\n`);
  
  // Clean index
  const indexDir = path.join(largeProject, '.mcp-index');
  if (fs.existsSync(indexDir)) {
    try { fs.rmSync(indexDir, { recursive: true, force: true }); } catch (e) {}
  }
  
  const { IndexerClient } = require('./server/dist/indexer-client.js');
  const { MemoryIndex } = require('./server/dist/memory-index.js');
  const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
  
  let indexerClient;
  let results;
  
  // Test 1: Java Parser Only (get baseline)
  log(colors.magenta, '─'.repeat(60));
  log(colors.magenta, 'Test 1: Java Parser ONLY (no indexing)');
  log(colors.magenta, '─'.repeat(60));
  
  indexerClient = new IndexerClient();
  await indexerClient.start();
  
  const javaStart = Date.now();
  results = await indexerClient.indexFiles(testFiles, []);
  const javaTime = Date.now() - javaStart;
  
  let totalSymbols = 0;
  let totalRefs = 0;
  for (const r of results) {
    totalSymbols += r.symbols?.length || 0;
    totalRefs += r.references?.length || 0;
  }
  
  await indexerClient.stop();
  
  log(colors.green, `   Time: ${javaTime}ms (${(testFiles.length / (javaTime / 1000)).toFixed(1)} files/sec)`);
  log(colors.blue, `   Files: ${testFiles.length}, Symbols: ${totalSymbols}, Refs: ${totalRefs}`);
  
  // Test 2: Java Parser + FILE MODE (in-memory)
  log(colors.magenta, '\n' + '─'.repeat(60));
  log(colors.magenta, 'Test 2: Java Parser + FILE MODE (addSymbol/addReference)');
  log(colors.magenta, '─'.repeat(60));
  
  indexerClient = new IndexerClient();
  await indexerClient.start();
  
  const memoryIndex = new MemoryIndex();
  memoryIndex.setIndexDir(largeProject);
  
  const fileStart = Date.now();
  results = await indexerClient.indexFiles(testFiles, []);
  
  for (const r of results) {
    for (const symbol of (r.symbols || [])) {
      memoryIndex.addSymbol(symbol);
    }
    for (const ref of (r.references || [])) {
      memoryIndex.addReference(ref);
    }
  }
  const fileTime = Date.now() - fileStart;
  
  const fileStats = memoryIndex.getStats();
  await indexerClient.stop();
  
  log(colors.green, `   Time: ${fileTime}ms (${(testFiles.length / (fileTime / 1000)).toFixed(1)} files/sec)`);
  log(colors.blue, `   Symbols: ${fileStats.symbols}, Refs: ${fileStats.references}`);
  log(colors.yellow, `   Overhead vs Java only: ${((fileTime - javaTime) / javaTime * 100).toFixed(1)}%`);
  
  // Test 3: Java Parser + DB MODE (storage)
  log(colors.magenta, '\n' + '─'.repeat(60));
  log(colors.magenta, 'Test 3: Java Parser + DB MODE (SQLite storage)');
  log(colors.magenta, '─'.repeat(60));
  
  // Clean index again
  if (fs.existsSync(indexDir)) {
    try { fs.rmSync(indexDir, { recursive: true, force: true }); } catch (e) {}
  }
  
  indexerClient = new IndexerClient();
  await indexerClient.start();
  
  const storageIndex = new MemoryIndexWithStorage();
  storageIndex.setIndexDir(largeProject);
  
  const dbStart = Date.now();
  results = await indexerClient.indexFiles(testFiles, []);
  
  for (const r of results) {
    for (const symbol of (r.symbols || [])) {
      storageIndex.addSymbol(symbol);
    }
    for (const ref of (r.references || [])) {
      storageIndex.addReference(ref);
    }
  }
  
  // Wait for flush
  log(colors.blue, '   Flushing to storage...');
  const flushStart = Date.now();
  await storageIndex.flush();
  const flushTime = Date.now() - flushStart;
  
  const dbTime = Date.now() - dbStart;
  
  const dbStats = storageIndex.getStats();
  await indexerClient.stop();
  await storageIndex.close();
  
  log(colors.green, `   Time: ${dbTime}ms (${(testFiles.length / (dbTime / 1000)).toFixed(1)} files/sec)`);
  log(colors.blue, `   Symbols: ${dbStats.symbols}, Refs: ${dbStats.references}`);
  log(colors.blue, `   Flush time: ${flushTime}ms`);
  log(colors.yellow, `   Overhead vs Java only: ${((dbTime - javaTime) / javaTime * 100).toFixed(1)}%`);
  log(colors.yellow, `   Overhead vs FILE mode: ${((dbTime - fileTime) / fileTime * 100).toFixed(1)}%`);
  
  // Summary
  log(colors.cyan, '\n' + '═'.repeat(60));
  log(colors.cyan, '  ANALYSIS');
  log(colors.cyan, '═'.repeat(60));
  
  log(colors.blue, '\nTime breakdown:');
  log(colors.blue, `  Java Parser:     ${javaTime}ms (baseline)`);
  log(colors.blue, `  + FILE indexing: ${fileTime - javaTime}ms (${((fileTime - javaTime) / javaTime * 100).toFixed(1)}%)`);
  log(colors.blue, `  + DB storage:    ${dbTime - fileTime}ms (${((dbTime - fileTime) / fileTime * 100).toFixed(1)}%)`);
  
  log(colors.magenta, '\nExtrapolated for 12000 files:');
  const scale = 12000 / testFiles.length;
  log(colors.blue, `  Java only:  ${(javaTime * scale / 1000).toFixed(0)}s`);
  log(colors.blue, `  FILE mode:  ${(fileTime * scale / 1000).toFixed(0)}s`);
  log(colors.blue, `  DB mode:    ${(dbTime * scale / 1000).toFixed(0)}s`);
  
  // Diagnose
  if ((dbTime - fileTime) / fileTime > 2) {
    log(colors.red, '\n🚨 DB MODE is >2x slower than FILE MODE');
    log(colors.red, '   Problem is in storage layer (write queue, transactions)');
  } else if ((fileTime - javaTime) / javaTime > 0.5) {
    log(colors.red, '\n🚨 FILE MODE is >50% slower than Java parser');
    log(colors.red, '   Problem is in TypeScript addSymbol/addReference');
  } else {
    log(colors.green, '\n✅ Performance is reasonable');
  }
}

runIsolatedTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
