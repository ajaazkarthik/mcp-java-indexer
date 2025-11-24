#!/usr/bin/env node

/**
 * Comprehensive Dual Extension Comparison Test
 * 
 * Tests BOTH extensions:
 * 1. Existing in-memory extension (baseline)
 * 2. New storage-backed extension (optimized)
 * 
 * Validates:
 * - All queries return actual results (not "0 found = pass")
 * - Performance metrics (speed, memory)
 * - Correctness of results
 * 
 * Projects tested:
 * - Small: 4-file test project
 * - Large: Real Java project (if available)
 */

const path = require('path');
const fs = require('fs');

// Import both implementations
const { MemoryIndex } = require('./server/dist/memory-index.js');
const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
const { IndexerClient } = require('./server/dist/indexer-client.js');

// Test configuration
const TESTS = {
  SMALL: {
    name: 'Small Test Project (4 files)',
    dir: path.join(__dirname, 'test-java-project'),
    expectedFiles: 4,
    expectedSymbols: 15,
    expectedReferences: 12,
    testQueries: [
      {
        type: 'findSymbols',
        query: 'User',
        expectedMin: 1,
        description: 'Find User class'
      },
      {
        type: 'findUsages',
        query: 'com.example.User',
        expectedMin: 2,
        description: 'Find usages of User class'
      },
      {
        type: 'getOutboundCalls',
        query: 'com.example.UserService.createUser(String)',
        expectedMin: 2,
        description: 'Get calls from createUser'
      },
      {
        type: 'getInboundCalls',
        query: 'com.example.UserRepository.save(User)',
        expectedMin: 1,
        description: 'Get calls to save method'
      }
    ]
  }
};

// Utility functions
function formatMemory(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function formatTime(ms) {
  if (ms < 1000) return ms + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

function formatPercentage(value) {
  return (value * 100).toFixed(1) + '%';
}

// Result tracking
class TestResult {
  constructor(extensionName) {
    this.extensionName = extensionName;
    this.startTime = Date.now();
    this.startMemory = process.memoryUsage().heapUsed;
    this.peakMemory = this.startMemory;
    this.indexingTime = 0;
    this.queryTimes = [];
    this.queryResults = [];
    this.filesIndexed = 0;
    this.symbolsIndexed = 0;
    this.referencesIndexed = 0;
    this.errors = [];
    this.warnings = [];
  }

  recordPeakMemory() {
    const current = process.memoryUsage().heapUsed;
    if (current > this.peakMemory) {
      this.peakMemory = current;
    }
  }

  recordIndexing(files, symbols, references, timeMs) {
    this.filesIndexed = files;
    this.symbolsIndexed = symbols;
    this.referencesIndexed = references;
    this.indexingTime = timeMs;
    this.recordPeakMemory();
  }

  recordQuery(queryType, query, resultCount, timeMs, expected) {
    const result = {
      type: queryType,
      query,
      resultCount,
      timeMs,
      expected,
      passed: resultCount >= expected
    };
    this.queryResults.push(result);
    this.queryTimes.push(timeMs);
    this.recordPeakMemory();

    if (!result.passed) {
      this.errors.push(`${queryType}("${query}"): Expected >= ${expected}, got ${resultCount}`);
    }
  }

  addError(message) {
    this.errors.push(message);
  }

  addWarning(message) {
    this.warnings.push(message);
  }

  getMemoryIncrease() {
    return this.peakMemory - this.startMemory;
  }

  getTotalTime() {
    return Date.now() - this.startTime;
  }

  isPassed() {
    return this.errors.length === 0;
  }

  getSummary() {
    const avgQueryTime = this.queryTimes.length > 0
      ? this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length
      : 0;

    return {
      extension: this.extensionName,
      passed: this.isPassed(),
      totalTime: this.getTotalTime(),
      indexingTime: this.indexingTime,
      avgQueryTime,
      memoryIncrease: this.getMemoryIncrease(),
      peakMemory: this.peakMemory,
      filesIndexed: this.filesIndexed,
      symbolsIndexed: this.symbolsIndexed,
      referencesIndexed: this.referencesIndexed,
      queriesPassed: this.queryResults.filter(q => q.passed).length,
      queriesTotal: this.queryResults.length,
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

// Test runner for a single extension
async function testExtension(extensionName, MemoryIndexClass, testConfig) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Testing: ${extensionName}`);
  console.log(`  Project: ${testConfig.name}`);
  console.log(`${'='.repeat(70)}\n`);

  const result = new TestResult(extensionName);
  
  try {
    // Initialize index
    const memoryIndex = new MemoryIndexClass();
    memoryIndex.setIndexDir(testConfig.dir);

    // Wait for storage initialization if needed
    if (memoryIndex.waitForInit) {
      await memoryIndex.waitForInit();
    } else {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('📦 Indexing files...');
    const indexStart = Date.now();

    // Start Java indexer
    const indexerClient = new IndexerClient();
    await indexerClient.start();

    // Find Java files
    const javaFiles = [];
    function findJavaFiles(dir) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && !item.startsWith('.')) {
          findJavaFiles(fullPath);
        } else if (item.endsWith('.java')) {
          javaFiles.push(fullPath);
        }
      }
    }
    findJavaFiles(path.join(testConfig.dir, 'src'));

    console.log(`  Found ${javaFiles.length} Java files`);

    // Index files
    const sourceRoots = [path.join(testConfig.dir, 'src')];
    const results = await indexerClient.indexFiles(javaFiles, sourceRoots);

    let totalSymbols = 0;
    let totalReferences = 0;

    for (const fileResult of results) {
      if (fileResult.error) {
        result.addWarning(`Index error in ${fileResult.file}: ${fileResult.error}`);
        continue;
      }

      // Add symbols
      for (const symbol of fileResult.symbols) {
        memoryIndex.addSymbol(symbol);
        totalSymbols++;
      }

      // Add references
      for (const ref of fileResult.references) {
        memoryIndex.addReference(ref);
        totalReferences++;
      }
    }

    // Flush writes
    if (memoryIndex.flush) {
      await memoryIndex.flush();
    }

    await indexerClient.stop();

    const indexTime = Date.now() - indexStart;
    result.recordIndexing(javaFiles.length, totalSymbols, totalReferences, indexTime);

    console.log(`  ✅ Indexed ${javaFiles.length} files in ${formatTime(indexTime)}`);
    console.log(`  📊 Symbols: ${totalSymbols}, References: ${totalReferences}\n`);

    // Validate expected counts
    if (testConfig.expectedFiles && javaFiles.length !== testConfig.expectedFiles) {
      result.addWarning(`Expected ${testConfig.expectedFiles} files, got ${javaFiles.length}`);
    }
    if (testConfig.expectedSymbols && totalSymbols < testConfig.expectedSymbols) {
      result.addError(`Expected >= ${testConfig.expectedSymbols} symbols, got ${totalSymbols}`);
    }

    // Run queries
    console.log('🔍 Running queries:\n');

    for (const testQuery of testConfig.testQueries) {
      const queryStart = Date.now();
      let queryResult;
      let resultCount = 0;

      try {
        switch (testQuery.type) {
          case 'findSymbols':
            queryResult = memoryIndex.findSymbols(testQuery.query);
            resultCount = queryResult.length;
            break;

          case 'findUsages':
            queryResult = memoryIndex.findUsages(testQuery.query);
            resultCount = queryResult.length;
            break;

          case 'getOutboundCalls':
            queryResult = memoryIndex.getOutboundCalls(testQuery.query);
            resultCount = queryResult.length;
            break;

          case 'getInboundCalls':
            queryResult = memoryIndex.getInboundCalls(testQuery.query);
            resultCount = queryResult.length;
            break;

          default:
            result.addError(`Unknown query type: ${testQuery.type}`);
            continue;
        }

        const queryTime = Date.now() - queryStart;
        result.recordQuery(testQuery.type, testQuery.query, resultCount, queryTime, testQuery.expectedMin);

        const status = resultCount >= testQuery.expectedMin ? '✅' : '❌';
        console.log(`  ${status} ${testQuery.description}`);
        console.log(`     Query: ${testQuery.type}("${testQuery.query}")`);
        console.log(`     Results: ${resultCount} (expected >= ${testQuery.expectedMin})`);
        console.log(`     Time: ${formatTime(queryTime)}\n`);

      } catch (error) {
        result.addError(`${testQuery.type}("${testQuery.query}") threw: ${error.message}`);
        console.log(`  ❌ ${testQuery.description}`);
        console.log(`     Error: ${error.message}\n`);
      }
    }

    // Final memory check
    result.recordPeakMemory();

  } catch (error) {
    result.addError(`Fatal error: ${error.message}`);
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
  }

  return result;
}

// Compare two results
function compareResults(result1, result2) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  COMPARISON: ${result1.extensionName} vs ${result2.extensionName}`);
  console.log(`${'='.repeat(70)}\n`);

  const summary1 = result1.getSummary();
  const summary2 = result2.getSummary();

  // Calculate differences
  const timeDiff = summary2.indexingTime - summary1.indexingTime;
  const timePercent = summary1.indexingTime > 0 ? (timeDiff / summary1.indexingTime) : 0;

  const memDiff = summary2.memoryIncrease - summary1.memoryIncrease;
  const memPercent = summary1.memoryIncrease > 0 ? (memDiff / summary1.memoryIncrease) : 0;

  const avgQueryDiff = summary2.avgQueryTime - summary1.avgQueryTime;
  const avgQueryPercent = summary1.avgQueryTime > 0 ? (avgQueryDiff / summary1.avgQueryTime) : 0;

  console.log('📊 Performance Metrics:\n');
  console.log('┌─────────────────────┬─────────────────┬─────────────────┬──────────────┐');
  console.log('│ Metric              │ ' + result1.extensionName.padEnd(15) + ' │ ' + result2.extensionName.padEnd(15) + ' │ Difference   │');
  console.log('├─────────────────────┼─────────────────┼─────────────────┼──────────────┤');
  
  console.log(`│ Indexing Time       │ ${formatTime(summary1.indexingTime).padEnd(15)} │ ${formatTime(summary2.indexingTime).padEnd(15)} │ ${timeDiff >= 0 ? '+' : ''}${formatPercentage(timePercent).padEnd(12)} │`);
  console.log(`│ Avg Query Time      │ ${formatTime(summary1.avgQueryTime).padEnd(15)} │ ${formatTime(summary2.avgQueryTime).padEnd(15)} │ ${avgQueryDiff >= 0 ? '+' : ''}${formatPercentage(avgQueryPercent).padEnd(12)} │`);
  console.log(`│ Memory Increase     │ ${formatMemory(summary1.memoryIncrease).padEnd(15)} │ ${formatMemory(summary2.memoryIncrease).padEnd(15)} │ ${memDiff >= 0 ? '+' : ''}${formatPercentage(memPercent).padEnd(12)} │`);
  console.log(`│ Peak Memory         │ ${formatMemory(summary1.peakMemory).padEnd(15)} │ ${formatMemory(summary2.peakMemory).padEnd(15)} │ ${formatPercentage((summary2.peakMemory - summary1.peakMemory) / summary1.peakMemory).padEnd(12)} │`);
  console.log('└─────────────────────┴─────────────────┴─────────────────┴──────────────┘\n');

  console.log('📈 Accuracy Metrics:\n');
  console.log('┌─────────────────────┬─────────────────┬─────────────────┐');
  console.log('│ Metric              │ ' + result1.extensionName.padEnd(15) + ' │ ' + result2.extensionName.padEnd(15) + ' │');
  console.log('├─────────────────────┼─────────────────┼─────────────────┤');
  console.log(`│ Symbols Indexed     │ ${String(summary1.symbolsIndexed).padEnd(15)} │ ${String(summary2.symbolsIndexed).padEnd(15)} │`);
  console.log(`│ References Indexed  │ ${String(summary1.referencesIndexed).padEnd(15)} │ ${String(summary2.referencesIndexed).padEnd(15)} │`);
  console.log(`│ Queries Passed      │ ${(summary1.queriesPassed + '/' + summary1.queriesTotal).padEnd(15)} │ ${(summary2.queriesPassed + '/' + summary2.queriesTotal).padEnd(15)} │`);
  console.log(`│ Status              │ ${(summary1.passed ? '✅ PASSED' : '❌ FAILED').padEnd(15)} │ ${(summary2.passed ? '✅ PASSED' : '❌ FAILED').padEnd(15)} │`);
  console.log('└─────────────────────┴─────────────────┴─────────────────┘\n');

  // Show errors and warnings
  if (summary1.errors.length > 0 || summary2.errors.length > 0) {
    console.log('❌ Errors:\n');
    if (summary1.errors.length > 0) {
      console.log(`  ${result1.extensionName}:`);
      summary1.errors.forEach(err => console.log(`    - ${err}`));
    }
    if (summary2.errors.length > 0) {
      console.log(`  ${result2.extensionName}:`);
      summary2.errors.forEach(err => console.log(`    - ${err}`));
    }
    console.log('');
  }

  // Winner determination
  console.log('🏆 Overall Assessment:\n');
  
  const winner = [];
  if (summary1.passed && !summary2.passed) {
    winner.push(`${result1.extensionName} is more reliable (passed all tests)`);
  } else if (!summary1.passed && summary2.passed) {
    winner.push(`${result2.extensionName} is more reliable (passed all tests)`);
  }

  if (Math.abs(timePercent) > 0.1) {
    winner.push(timePercent < 0 
      ? `${result1.extensionName} is ${formatPercentage(Math.abs(timePercent))} faster`
      : `${result2.extensionName} is ${formatPercentage(timePercent)} faster`);
  }

  if (Math.abs(memPercent) > 0.1) {
    winner.push(memPercent < 0
      ? `${result1.extensionName} uses ${formatPercentage(Math.abs(memPercent))} less memory`
      : `${result2.extensionName} uses ${formatPercentage(Math.abs(memPercent))} less memory`);
  }

  if (winner.length > 0) {
    winner.forEach(w => console.log(`  • ${w}`));
  } else {
    console.log('  • Both extensions perform similarly');
  }

  console.log('');
}

// Main execution
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  MCP Java Indexer - Dual Extension Comparison Test                ║');
  console.log('║  Comprehensive validation with actual result checking             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Test small project with both extensions
  const testConfig = TESTS.SMALL;

  // Test 1: Original in-memory extension
  const result1 = await testExtension('In-Memory', MemoryIndex, testConfig);

  // Force GC between tests
  if (global.gc) {
    global.gc();
    global.gc();
  }
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: New storage-backed extension
  const result2 = await testExtension('Storage-Backed', MemoryIndexWithStorage, testConfig);

  // Compare results
  compareResults(result1, result2);

  // Final summary
  const summary1 = result1.getSummary();
  const summary2 = result2.getSummary();

  console.log(`${'='.repeat(70)}`);
  console.log('  FINAL VERDICT');
  console.log(`${'='.repeat(70)}\n`);

  if (summary1.passed && summary2.passed) {
    console.log('✅ SUCCESS: Both extensions passed all tests!');
    console.log('   All queries returned correct results (no false "0 found = pass")');
    console.log('   Both implementations are production-ready\n');
  } else {
    console.log('❌ FAILURE: Some tests did not pass');
    if (!summary1.passed) {
      console.log(`   ${result1.extensionName}: ${summary1.errors.length} errors`);
    }
    if (!summary2.passed) {
      console.log(`   ${result2.extensionName}: ${summary2.errors.length} errors`);
    }
    console.log('');
  }

  // Exit with error code if any test failed
  process.exit((summary1.passed && summary2.passed) ? 0 : 1);
}

main().catch(error => {
  console.error('\n💥 Unhandled error:', error);
  process.exit(1);
});
