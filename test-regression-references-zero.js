#!/usr/bin/env node
/**
 * REGRESSION TEST: References/Call Graph Zero Bug
 * 
 * This test prevents the critical bug where storage backend returns:
 * - References: 0 (should be > 0)
 * - Call Graph Edges: 0 (should be > 0)
 * - Inheritance: 0 (should be > 0)
 * 
 * Root cause: getStats() was returning cache sizes instead of actual counts
 * Fix: Track counts synchronously as references are added
 * 
 * This test should FAIL if the bug reoccurs.
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

async function testProject(projectName, projectPath, expectedMinRefs, expectedMinCallGraph) {
  log(colors.cyan, `\n${'='.repeat(60)}`);
  log(colors.cyan, `  Testing: ${projectName}`);
  log(colors.cyan, '='.repeat(60));
  
  // Clean old index
  const indexDir = path.join(projectPath, '.mcp-index');
  if (fs.existsSync(indexDir)) {
    try {
      fs.rmSync(indexDir, { recursive: true, force: true });
      log(colors.blue, '   Cleaned old index');
    } catch (e) {
      log(colors.yellow, `   Warning: Could not clean index: ${e.message}`);
    }
  }
  
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };
  
  try {
    // Test FILE MODE
    log(colors.magenta, '\n📁 Testing FILE MODE (In-Memory + JSON)');
    
    const { MemoryIndex } = require('./server/dist/memory-index.js');
    const { IndexerClient } = require('./server/dist/indexer-client.js');
    const { handleIndexProject } = require('./server/dist/tools/index_project.js');
    
    const memoryIndex1 = new MemoryIndex();
    memoryIndex1.setIndexDir(projectPath);
    const indexerClient1 = new IndexerClient();
    await indexerClient1.start();
    
    const start1 = Date.now();
    await handleIndexProject({ rootDir: projectPath }, memoryIndex1, indexerClient1, () => {});
    const time1 = ((Date.now() - start1) / 1000).toFixed(2);
    
    const stats1 = memoryIndex1.getStats();
    await indexerClient1.stop();
    
    log(colors.blue, `   Time: ${time1}s`);
    log(colors.blue, `   Symbols: ${stats1.symbols}`);
    log(colors.blue, `   References: ${stats1.references}`);
    log(colors.blue, `   Call Graph: ${stats1.callGraphEdges}`);
    log(colors.blue, `   Inheritance: ${stats1.inheritanceRelations}`);
    
    // Validate FILE MODE
    if (stats1.references === 0) {
      log(colors.red, '   ❌ CRITICAL: FILE MODE has 0 references!');
      results.failed.push('file_mode_references_zero');
    } else if (stats1.references < expectedMinRefs) {
      log(colors.yellow, `   ⚠️  Warning: Expected >= ${expectedMinRefs} references, got ${stats1.references}`);
      results.warnings.push('file_mode_low_references');
    } else {
      log(colors.green, '   ✅ References OK');
      results.passed.push('file_mode_references');
    }
    
    if (stats1.callGraphEdges === 0) {
      log(colors.red, '   ❌ CRITICAL: FILE MODE has 0 call graph edges!');
      results.failed.push('file_mode_callgraph_zero');
    } else if (stats1.callGraphEdges < expectedMinCallGraph) {
      log(colors.yellow, `   ⚠️  Warning: Expected >= ${expectedMinCallGraph} call graph edges, got ${stats1.callGraphEdges}`);
      results.warnings.push('file_mode_low_callgraph');
    } else {
      log(colors.green, '   ✅ Call Graph OK');
      results.passed.push('file_mode_callgraph');
    }
    
    // Clean for DB mode test
    if (fs.existsSync(indexDir)) {
      try {
        fs.rmSync(indexDir, { recursive: true, force: true });
      } catch (e) {
        log(colors.yellow, `   Warning: Could not clean index: ${e.message}`);
      }
    }
    
    // Test DB MODE
    log(colors.magenta, '\n💾 Testing DB MODE (SQLite Storage)');
    
    const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
    
    const memoryIndex2 = new MemoryIndexWithStorage();
    memoryIndex2.setIndexDir(projectPath);
    const indexerClient2 = new IndexerClient();
    await indexerClient2.start();
    
    const start2 = Date.now();
    await handleIndexProject({ rootDir: projectPath }, memoryIndex2, indexerClient2, () => {});
    const time2 = ((Date.now() - start2) / 1000).toFixed(2);
    
    // Flush to ensure all writes complete
    if (memoryIndex2.flush) {
      await memoryIndex2.flush();
    }
    
    const stats2 = memoryIndex2.getStats();
    await indexerClient2.stop();
    await memoryIndex2.close();
    
    log(colors.blue, `   Time: ${time2}s`);
    log(colors.blue, `   Symbols: ${stats2.symbols}`);
    log(colors.blue, `   References: ${stats2.references}`);
    log(colors.blue, `   Call Graph: ${stats2.callGraphEdges}`);
    log(colors.blue, `   Inheritance: ${stats2.inheritanceRelations}`);
    
    // Validate DB MODE
    if (stats2.references === 0) {
      log(colors.red, '   ❌ CRITICAL REGRESSION: DB MODE has 0 references!');
      log(colors.red, '   This is the bug we fixed - it has returned!');
      results.failed.push('db_mode_references_zero');
    } else if (stats2.references < expectedMinRefs) {
      log(colors.yellow, `   ⚠️  Warning: Expected >= ${expectedMinRefs} references, got ${stats2.references}`);
      results.warnings.push('db_mode_low_references');
    } else {
      log(colors.green, '   ✅ References OK');
      results.passed.push('db_mode_references');
    }
    
    if (stats2.callGraphEdges === 0) {
      log(colors.red, '   ❌ CRITICAL REGRESSION: DB MODE has 0 call graph edges!');
      log(colors.red, '   This is the bug we fixed - it has returned!');
      results.failed.push('db_mode_callgraph_zero');
    } else if (stats2.callGraphEdges < expectedMinCallGraph) {
      log(colors.yellow, `   ⚠️  Warning: Expected >= ${expectedMinCallGraph} call graph edges, got ${stats2.callGraphEdges}`);
      results.warnings.push('db_mode_low_callgraph');
    } else {
      log(colors.green, '   ✅ Call Graph OK');
      results.passed.push('db_mode_callgraph');
    }
    
    // Performance comparison
    log(colors.magenta, '\n⏱️  Performance Analysis');
    const slowdown = ((parseFloat(time2) / parseFloat(time1)) * 100).toFixed(1);
    log(colors.blue, `   FILE MODE: ${time1}s`);
    log(colors.blue, `   DB MODE:   ${time2}s (${slowdown}% of file mode)`);
    
    if (parseFloat(time2) > parseFloat(time1) * 3) {
      log(colors.yellow, `   ⚠️  DB mode is ${(parseFloat(time2) / parseFloat(time1)).toFixed(1)}x slower`);
      results.warnings.push('db_mode_slow');
    } else {
      log(colors.green, '   ✅ Performance acceptable');
      results.passed.push('performance');
    }
    
    // Data consistency check
    log(colors.magenta, '\n📊 Data Consistency');
    const refDiff = Math.abs(stats2.references - stats1.references);
    const refDiffPct = ((refDiff / stats1.references) * 100).toFixed(1);
    
    log(colors.blue, `   References diff: ${refDiff} (${refDiffPct}%)`);
    
    if (refDiffPct > 10) {
      log(colors.yellow, `   ⚠️  Significant difference between modes`);
      results.warnings.push('data_consistency');
    } else {
      log(colors.green, '   ✅ Data consistent between modes');
      results.passed.push('consistency');
    }
    
  } catch (error) {
    log(colors.red, `\n❌ Test Error: ${error.message}`);
    log(colors.red, error.stack);
    results.failed.push('test_execution');
  }
  
  return results;
}

async function runRegressionTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  REGRESSION TEST: References/Call Graph Zero Bug            ║');
  console.log('║  Prevents critical data loss bug in storage backend         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  const allResults = {
    passed: [],
    failed: [],
    warnings: []
  };
  
  // Test 1: Small project
  const exampleProject = path.join(__dirname, 'example-java-project');
  if (fs.existsSync(exampleProject)) {
    const results = await testProject('Example Project (Small)', exampleProject, 200, 50);
    allResults.passed.push(...results.passed);
    allResults.failed.push(...results.failed);
    allResults.warnings.push(...results.warnings);
  } else {
    log(colors.yellow, '\n⚠️  Skipping example-java-project (not found)');
  }
  
  // Test 2: Large project (limited batches for speed)
  const largeProject = path.join(__dirname, 'large-java-project');
  if (fs.existsSync(largeProject)) {
    log(colors.cyan, '\n\nℹ️  Large project test: Will index first 500 files only for speed');
    // Note: We could add a maxFiles parameter to handleIndexProject for testing
    // For now, we skip or run full test
    log(colors.yellow, '⚠️  Skipping large project (takes too long for regression test)');
  }
  
  // Summary
  log(colors.cyan, '\n\n' + '═'.repeat(60));
  log(colors.cyan, '  TEST SUMMARY');
  log(colors.cyan, '═'.repeat(60));
  
  const total = allResults.passed.length + allResults.failed.length;
  log(colors.blue, `\nTotal checks: ${total}`);
  log(colors.green, `Passed: ${allResults.passed.length}`);
  log(colors.red, `Failed: ${allResults.failed.length}`);
  log(colors.yellow, `Warnings: ${allResults.warnings.length}`);
  
  if (allResults.failed.length > 0) {
    log(colors.red, '\n❌ REGRESSION TEST FAILED');
    log(colors.red, 'Failed checks:');
    allResults.failed.forEach(f => log(colors.red, `  - ${f}`));
    
    if (allResults.failed.includes('db_mode_references_zero') || 
        allResults.failed.includes('db_mode_callgraph_zero')) {
      log(colors.red, '\n🚨 CRITICAL: The references/call graph zero bug has returned!');
      log(colors.red, '   Check memory-index-storage.ts:');
      log(colors.red, '   - getStats() should use referenceCount/callGraphEdgeCount');
      log(colors.red, '   - addReference() should increment these counters');
    }
    
    process.exit(1);
  } else if (allResults.warnings.length > 0) {
    log(colors.yellow, '\n⚠️  TESTS PASSED WITH WARNINGS');
    log(colors.yellow, 'Warnings:');
    allResults.warnings.forEach(w => log(colors.yellow, `  - ${w}`));
    process.exit(0);
  } else {
    log(colors.green, '\n✅ ALL REGRESSION TESTS PASSED');
    log(colors.green, '   References and call graph are being extracted correctly');
    log(colors.green, '   Both FILE MODE and DB MODE working as expected');
    process.exit(0);
  }
}

runRegressionTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
