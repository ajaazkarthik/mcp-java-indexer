/**
 * Database Backend Performance Test
 * Tests both better-sqlite3 and sql.js backends
 * Measures: Performance, CPU usage, Heap memory
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Test configuration
const TEST_SYMBOLS = 5000;
const TEST_REFS = 10000;
const TEST_CALLS = 5000;

function formatMemory(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function formatTime(ms) {
  return ms.toFixed(2) + ' ms';
}

function getMemoryStats() {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
    external: mem.external
  };
}

function getCpuUsage(startUsage) {
  const endUsage = process.cpuUsage(startUsage);
  return {
    user: endUsage.user / 1000, // Convert to ms
    system: endUsage.system / 1000
  };
}

async function testStorageBackend(name, StorageClass, testDir) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(60));
  
  // Clean up previous test
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  
  const results = {
    name,
    initTime: 0,
    saveSymbolsTime: 0,
    saveRefsTime: 0,
    saveCallsTime: 0,
    querySymbolTime: 0,
    queryUsagesTime: 0,
    queryCallGraphTime: 0,
    closeTime: 0,
    reopenTime: 0,
    memoryBefore: null,
    memoryAfter: null,
    cpuTotal: { user: 0, system: 0 },
    dbSize: 0,
    passed: true,
    error: null
  };
  
  try {
    // Baseline memory
    global.gc && global.gc();
    results.memoryBefore = getMemoryStats();
    const totalCpuStart = process.cpuUsage();
    
    // 1. Initialize
    console.log('\n📦 1. Initialization...');
    const initStart = Date.now();
    const storage = new StorageClass(testDir);
    await storage.initialize();
    results.initTime = Date.now() - initStart;
    console.log(`   ✅ Initialized in ${formatTime(results.initTime)}`);
    
    // 2. Save symbols (batch)
    console.log(`\n📝 2. Saving ${TEST_SYMBOLS} symbols...`);
    const symbols = [];
    for (let i = 0; i < TEST_SYMBOLS; i++) {
      symbols.push({
        fqn: `com.example.package${Math.floor(i/100)}.Class${i}`,
        name: `Class${i}`,
        kind: i % 3 === 0 ? 'class' : (i % 3 === 1 ? 'method' : 'field'),
        file: `/src/main/java/com/example/package${Math.floor(i/100)}/Class${i}.java`,
        line: (i % 100) + 1,
        column: 1,
        packageName: `com.example.package${Math.floor(i/100)}`,
        modifiers: ['public'],
      });
    }
    
    const saveSymbolsStart = Date.now();
    await storage.saveSymbols(symbols);
    results.saveSymbolsTime = Date.now() - saveSymbolsStart;
    console.log(`   ✅ Saved in ${formatTime(results.saveSymbolsTime)} (${(TEST_SYMBOLS / results.saveSymbolsTime * 1000).toFixed(0)} symbols/sec)`);
    
    // 3. Save references (batch)
    console.log(`\n🔗 3. Saving ${TEST_REFS} references...`);
    const refs = [];
    for (let i = 0; i < TEST_REFS; i++) {
      refs.push({
        fromFqn: `com.example.package${Math.floor(i/100)}.Class${i % TEST_SYMBOLS}.method()`,
        toFqn: `com.example.package${Math.floor((i+1)/100)}.Class${(i+1) % TEST_SYMBOLS}`,
        file: `/src/main/java/com/example/package${Math.floor(i/100)}/Class${i % TEST_SYMBOLS}.java`,
        line: (i % 100) + 10,
        column: 5,
        kind: i % 2 === 0 ? 'method_call' : 'field_access',
      });
    }
    
    const saveRefsStart = Date.now();
    await storage.saveReferences(refs);
    results.saveRefsTime = Date.now() - saveRefsStart;
    console.log(`   ✅ Saved in ${formatTime(results.saveRefsTime)} (${(TEST_REFS / results.saveRefsTime * 1000).toFixed(0)} refs/sec)`);
    
    // 4. Save call graph edges
    console.log(`\n📊 4. Saving ${TEST_CALLS} call graph edges...`);
    const saveCallsStart = Date.now();
    for (let i = 0; i < TEST_CALLS; i++) {
      const edge = {
        caller: `com.example.package${Math.floor(i/100)}.Class${i % 1000}.caller()`,
        callee: `com.example.package${Math.floor((i+500)/100)}.Class${(i+500) % 1000}.callee()`,
        locations: [{ 
          file: `/src/Class${i % 1000}.java`, 
          line: (i % 100) + 1, 
          column: 5 
        }],
      };
      await storage.saveCallEdge(edge, 'forward');
      await storage.saveCallEdge(edge, 'reverse');
    }
    results.saveCallsTime = Date.now() - saveCallsStart;
    console.log(`   ✅ Saved in ${formatTime(results.saveCallsTime)} (${(TEST_CALLS / results.saveCallsTime * 1000).toFixed(0)} edges/sec)`);
    
    // 5. Query symbol
    console.log('\n🔍 5. Query performance tests...');
    const querySymbolStart = Date.now();
    for (let i = 0; i < 100; i++) {
      await storage.getSymbol(`com.example.package${i}.Class${i * 50}`);
    }
    results.querySymbolTime = Date.now() - querySymbolStart;
    console.log(`   Symbol lookup (100x): ${formatTime(results.querySymbolTime)} (${formatTime(results.querySymbolTime / 100)} avg)`);
    
    // 6. Query usages
    const queryUsagesStart = Date.now();
    for (let i = 0; i < 50; i++) {
      await storage.findUsages(`com.example.package${i}.Class${i * 100}`);
    }
    results.queryUsagesTime = Date.now() - queryUsagesStart;
    console.log(`   Find usages (50x): ${formatTime(results.queryUsagesTime)} (${formatTime(results.queryUsagesTime / 50)} avg)`);
    
    // 7. Query call graph
    const queryCallGraphStart = Date.now();
    for (let i = 0; i < 50; i++) {
      await storage.getOutboundCalls(`com.example.package${i}.Class${i * 20}.caller()`);
      await storage.getInboundCalls(`com.example.package${i}.Class${i * 20}.callee()`);
    }
    results.queryCallGraphTime = Date.now() - queryCallGraphStart;
    console.log(`   Call graph (100x): ${formatTime(results.queryCallGraphTime)} (${formatTime(results.queryCallGraphTime / 100)} avg)`);
    
    // 8. Close and persist
    console.log('\n💾 6. Closing and persisting...');
    const closeStart = Date.now();
    await storage.close();
    results.closeTime = Date.now() - closeStart;
    console.log(`   ✅ Closed in ${formatTime(results.closeTime)}`);
    
    // Check DB size
    const dbPath = path.join(testDir, 'index.db');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      results.dbSize = stats.size;
      console.log(`   Database size: ${formatMemory(results.dbSize)}`);
    }
    
    // 9. Reopen and verify
    console.log('\n🔄 7. Reopening and verifying...');
    const reopenStart = Date.now();
    const storage2 = new StorageClass(testDir);
    await storage2.initialize();
    results.reopenTime = Date.now() - reopenStart;
    console.log(`   ✅ Reopened in ${formatTime(results.reopenTime)}`);
    
    // Verify data
    const stats = await storage2.getStats();
    console.log(`   Symbols: ${stats.symbols}`);
    console.log(`   References: ${stats.references}`);
    console.log(`   Call edges: ${stats.callGraphEdges}`);
    
    if (stats.symbols < TEST_SYMBOLS * 0.9) {
      throw new Error(`Symbol count mismatch: expected ~${TEST_SYMBOLS}, got ${stats.symbols}`);
    }
    
    await storage2.close();
    
    // Final memory
    results.memoryAfter = getMemoryStats();
    results.cpuTotal = getCpuUsage(totalCpuStart);
    
  } catch (error) {
    results.passed = false;
    results.error = error.message;
    console.log(`\n   ❌ ERROR: ${error.message}`);
  }
  
  // Cleanup
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  
  return results;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     DATABASE BACKEND PERFORMANCE TEST                    ║');
  console.log('║     Testing: better-sqlite3 and sql.js                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  console.log(`\nTest Configuration:`);
  console.log(`  Symbols: ${TEST_SYMBOLS}`);
  console.log(`  References: ${TEST_REFS}`);
  console.log(`  Call Edges: ${TEST_CALLS}`);
  console.log(`  Node Version: ${process.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log(`  CPUs: ${os.cpus().length}x ${os.cpus()[0].model}`);
  console.log(`  Total Memory: ${formatMemory(os.totalmem())}`);
  
  const results = [];
  
  // Test 1: better-sqlite3
  try {
    const { SqliteStorage } = await import('./server/dist/storage/sqlite-storage.js');
    const result = await testStorageBackend(
      'better-sqlite3 (Native)',
      SqliteStorage,
      path.join(process.cwd(), 'test-better-sqlite3')
    );
    results.push(result);
  } catch (error) {
    console.log('\n⚠️  better-sqlite3 not available:', error.message);
    results.push({ name: 'better-sqlite3 (Native)', passed: false, error: 'Not available' });
  }
  
  // Test 2: sql.js
  try {
    const { SqlJsStorage } = await import('./server/dist/storage/sqljs-storage.js');
    const result = await testStorageBackend(
      'sql.js (WebAssembly)',
      SqlJsStorage,
      path.join(process.cwd(), 'test-sqljs')
    );
    results.push(result);
  } catch (error) {
    console.log('\n⚠️  sql.js not available:', error.message);
    results.push({ name: 'sql.js (WebAssembly)', passed: false, error: 'Not available' });
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('                    SUMMARY');
  console.log('═'.repeat(60));
  
  console.log('\n📊 Performance Comparison:');
  console.log('┌─────────────────────┬──────────────────┬──────────────────┐');
  console.log('│ Metric              │ better-sqlite3   │ sql.js           │');
  console.log('├─────────────────────┼──────────────────┼──────────────────┤');
  
  const metrics = [
    ['Init Time', 'initTime'],
    ['Save Symbols', 'saveSymbolsTime'],
    ['Save Refs', 'saveRefsTime'],
    ['Save Calls', 'saveCallsTime'],
    ['Query Symbol', 'querySymbolTime'],
    ['Query Usages', 'queryUsagesTime'],
    ['Query CallGraph', 'queryCallGraphTime'],
    ['Close/Persist', 'closeTime'],
    ['Reopen', 'reopenTime'],
  ];
  
  for (const [label, key] of metrics) {
    const v1 = results[0]?.[key] ? formatTime(results[0][key]).padStart(14) : 'N/A'.padStart(14);
    const v2 = results[1]?.[key] ? formatTime(results[1][key]).padStart(14) : 'N/A'.padStart(14);
    console.log(`│ ${label.padEnd(19)} │ ${v1} │ ${v2} │`);
  }
  
  console.log('└─────────────────────┴──────────────────┴──────────────────┘');
  
  console.log('\n💾 Memory Usage:');
  console.log('┌─────────────────────┬──────────────────┬──────────────────┐');
  console.log('│ Metric              │ better-sqlite3   │ sql.js           │');
  console.log('├─────────────────────┼──────────────────┼──────────────────┤');
  
  const heapBefore1 = results[0]?.memoryBefore?.heapUsed ? formatMemory(results[0].memoryBefore.heapUsed).padStart(14) : 'N/A'.padStart(14);
  const heapBefore2 = results[1]?.memoryBefore?.heapUsed ? formatMemory(results[1].memoryBefore.heapUsed).padStart(14) : 'N/A'.padStart(14);
  console.log(`│ ${'Heap Before'.padEnd(19)} │ ${heapBefore1} │ ${heapBefore2} │`);
  
  const heapAfter1 = results[0]?.memoryAfter?.heapUsed ? formatMemory(results[0].memoryAfter.heapUsed).padStart(14) : 'N/A'.padStart(14);
  const heapAfter2 = results[1]?.memoryAfter?.heapUsed ? formatMemory(results[1].memoryAfter.heapUsed).padStart(14) : 'N/A'.padStart(14);
  console.log(`│ ${'Heap After'.padEnd(19)} │ ${heapAfter1} │ ${heapAfter2} │`);
  
  const heapDelta1 = results[0]?.memoryAfter?.heapUsed && results[0]?.memoryBefore?.heapUsed 
    ? formatMemory(results[0].memoryAfter.heapUsed - results[0].memoryBefore.heapUsed).padStart(14) : 'N/A'.padStart(14);
  const heapDelta2 = results[1]?.memoryAfter?.heapUsed && results[1]?.memoryBefore?.heapUsed 
    ? formatMemory(results[1].memoryAfter.heapUsed - results[1].memoryBefore.heapUsed).padStart(14) : 'N/A'.padStart(14);
  console.log(`│ ${'Heap Delta'.padEnd(19)} │ ${heapDelta1} │ ${heapDelta2} │`);
  
  const dbSize1 = results[0]?.dbSize ? formatMemory(results[0].dbSize).padStart(14) : 'N/A'.padStart(14);
  const dbSize2 = results[1]?.dbSize ? formatMemory(results[1].dbSize).padStart(14) : 'N/A'.padStart(14);
  console.log(`│ ${'DB File Size'.padEnd(19)} │ ${dbSize1} │ ${dbSize2} │`);
  
  console.log('└─────────────────────┴──────────────────┴──────────────────┘');
  
  console.log('\n⚡ CPU Usage:');
  console.log('┌─────────────────────┬──────────────────┬──────────────────┐');
  console.log('│ Metric              │ better-sqlite3   │ sql.js           │');
  console.log('├─────────────────────┼──────────────────┼──────────────────┤');
  
  const cpuUser1 = results[0]?.cpuTotal?.user ? formatTime(results[0].cpuTotal.user).padStart(14) : 'N/A'.padStart(14);
  const cpuUser2 = results[1]?.cpuTotal?.user ? formatTime(results[1].cpuTotal.user).padStart(14) : 'N/A'.padStart(14);
  console.log(`│ ${'CPU User'.padEnd(19)} │ ${cpuUser1} │ ${cpuUser2} │`);
  
  const cpuSystem1 = results[0]?.cpuTotal?.system ? formatTime(results[0].cpuTotal.system).padStart(14) : 'N/A'.padStart(14);
  const cpuSystem2 = results[1]?.cpuTotal?.system ? formatTime(results[1].cpuTotal.system).padStart(14) : 'N/A'.padStart(14);
  console.log(`│ ${'CPU System'.padEnd(19)} │ ${cpuSystem1} │ ${cpuSystem2} │`);
  
  const cpuTotal1 = results[0]?.cpuTotal ? formatTime(results[0].cpuTotal.user + results[0].cpuTotal.system).padStart(14) : 'N/A'.padStart(14);
  const cpuTotal2 = results[1]?.cpuTotal ? formatTime(results[1].cpuTotal.user + results[1].cpuTotal.system).padStart(14) : 'N/A'.padStart(14);
  console.log(`│ ${'CPU Total'.padEnd(19)} │ ${cpuTotal1} │ ${cpuTotal2} │`);
  
  console.log('└─────────────────────┴──────────────────┴──────────────────┘');
  
  // Final verdict
  console.log('\n📋 Test Results:');
  let allPassed = true;
  for (const result of results) {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`   ${result.name}: ${status}${result.error ? ` (${result.error})` : ''}`);
    if (!result.passed) allPassed = false;
  }
  
  // Check if at least one DB backend is available
  const hasWorkingBackend = results.some(r => r.passed);
  
  console.log('\n' + '═'.repeat(60));
  if (hasWorkingBackend) {
    console.log('✅ DATABASE STORAGE IS WORKING');
    console.log('   At least one database backend is functional.');
    process.exit(0);
  } else {
    console.log('❌ NO DATABASE BACKEND AVAILABLE');
    console.log('   Please install sql.js: npm install sql.js');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
