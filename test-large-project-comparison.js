#!/usr/bin/env node

/**
 * Large Project Dual Extension Test
 * Tests both extensions on a real-world large Java project
 */

const path = require('path');
const fs = require('fs');

const { MemoryIndex } = require('./server/dist/memory-index.js');
const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
const { IndexerClient } = require('./server/dist/indexer-client.js');

const LARGE_PROJECT = {
  name: 'Large Java Project (github-playground)',
  dir: 'D:\\workspace\\repo\\github-playground',
  maxFiles: 500, // Test with subset for reasonable test time
  testQueries: [
    {
      type: 'findSymbols',
      query: 'String',
      expectedMin: 1,
      description: 'Find String references'
    },
    {
      type: 'findSymbols',
      query: 'main',
      expectedMin: 1,
      description: 'Find main methods'
    }
  ]
};

function formatMemory(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function formatTime(ms) {
  if (ms < 1000) return ms + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

async function testLargeProject(extensionName, MemoryIndexClass, maxFiles) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Testing: ${extensionName} on Large Project`);
  console.log(`  Max files: ${maxFiles}`);
  console.log(`${'='.repeat(70)}\n`);

  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  let peakMemory = startMemory;

  // Track memory continuously
  const memoryInterval = setInterval(() => {
    const current = process.memoryUsage().heapUsed;
    if (current > peakMemory) peakMemory = current;
  }, 100);

  try {
    // Initialize
    const memoryIndex = new MemoryIndexClass();
    const testDir = path.join(__dirname, 'test-large-project-temp');
    
    // Create temp dir
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    memoryIndex.setIndexDir(testDir);

    if (memoryIndex.waitForInit) {
      await memoryIndex.waitForInit();
    } else {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('📦 Finding Java files...');
    
    // Find Java files
    const allJavaFiles = [];
    function findJavaFiles(dir, depth = 0) {
      if (depth > 10) return; // Prevent too deep recursion
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (item.startsWith('.') || item === 'node_modules' || item === 'target' || item === 'build') continue;
          
          const fullPath = path.join(dir, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              findJavaFiles(fullPath, depth + 1);
            } else if (item.endsWith('.java') && allJavaFiles.length < maxFiles) {
              allJavaFiles.push(fullPath);
            }
          } catch (e) {
            // Skip files we can't access
          }
        }
      } catch (e) {
        // Skip directories we can't read
      }
    }

    findJavaFiles(LARGE_PROJECT.dir);
    const javaFiles = allJavaFiles.slice(0, maxFiles);

    console.log(`  Found ${javaFiles.length} Java files to index\n`);

    // Index
    console.log('🔧 Starting indexing...');
    const indexStart = Date.now();

    const indexerClient = new IndexerClient();
    await indexerClient.start();

    // Batch processing
    const batchSize = 100;
    let totalSymbols = 0;
    let totalReferences = 0;
    let errorCount = 0;

    for (let i = 0; i < javaFiles.length; i += batchSize) {
      const batch = javaFiles.slice(i, Math.min(i + batchSize, javaFiles.length));
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(javaFiles.length / batchSize);

      console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} files...`);

      try {
        const results = await indexerClient.indexFiles(batch, []);

        for (const fileResult of results) {
          if (fileResult.error) {
            errorCount++;
            continue;
          }

          for (const symbol of fileResult.symbols) {
            memoryIndex.addSymbol(symbol);
            totalSymbols++;
          }

          for (const ref of fileResult.references) {
            memoryIndex.addReference(ref);
            totalReferences++;
          }
        }

        // Flush writes for storage backend
        if (memoryIndex.flush && batchNum % 3 === 0) {
          await memoryIndex.flush();
        }

        const currentMem = process.memoryUsage().heapUsed;
        console.log(`    Symbols: ${totalSymbols}, Memory: ${formatMemory(currentMem)}`);

      } catch (error) {
        console.error(`    ❌ Batch error: ${error.message}`);
        errorCount++;
      }
    }

    // Final flush
    if (memoryIndex.flush) {
      await memoryIndex.flush();
    }

    await indexerClient.stop();

    const indexTime = Date.now() - indexStart;

    console.log(`\n  ✅ Indexing completed in ${formatTime(indexTime)}`);
    console.log(`  📊 Symbols: ${totalSymbols}, References: ${totalReferences}`);
    console.log(`  ⚠️  Errors: ${errorCount}\n`);

    // Run test queries
    console.log('🔍 Running test queries:\n');

    for (const testQuery of LARGE_PROJECT.testQueries) {
      const queryStart = Date.now();
      try {
        let results;
        switch (testQuery.type) {
          case 'findSymbols':
            results = memoryIndex.findSymbols(testQuery.query);
            break;
          case 'findUsages':
            results = memoryIndex.findUsages(testQuery.query);
            break;
        }

        const queryTime = Date.now() - queryStart;
        const status = results.length >= testQuery.expectedMin ? '✅' : '❌';
        
        console.log(`  ${status} ${testQuery.description}`);
        console.log(`     Results: ${results.length} (expected >= ${testQuery.expectedMin})`);
        console.log(`     Time: ${formatTime(queryTime)}\n`);

      } catch (error) {
        console.log(`  ❌ ${testQuery.description}`);
        console.log(`     Error: ${error.message}\n`);
      }
    }

    clearInterval(memoryInterval);

    // Final stats
    const totalTime = Date.now() - startTime;
    const memoryIncrease = peakMemory - startMemory;

    console.log('📈 Final Statistics:\n');
    console.log(`  Total Time:        ${formatTime(totalTime)}`);
    console.log(`  Indexing Time:     ${formatTime(indexTime)}`);
    console.log(`  Files Indexed:     ${javaFiles.length}`);
    console.log(`  Symbols:           ${totalSymbols}`);
    console.log(`  References:        ${totalReferences}`);
    console.log(`  Errors:            ${errorCount}`);
    console.log(`  Starting Memory:   ${formatMemory(startMemory)}`);
    console.log(`  Peak Memory:       ${formatMemory(peakMemory)}`);
    console.log(`  Memory Increase:   ${formatMemory(memoryIncrease)}`);
    console.log(`  Files/Second:      ${(javaFiles.length / (indexTime / 1000)).toFixed(1)}\n`);

    return {
      extensionName,
      totalTime,
      indexTime,
      filesIndexed: javaFiles.length,
      symbolsIndexed: totalSymbols,
      referencesIndexed: totalReferences,
      errors: errorCount,
      startMemory,
      peakMemory,
      memoryIncrease
    };

  } catch (error) {
    clearInterval(memoryInterval);
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  Large Project Comparison Test                                     ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const maxFiles = LARGE_PROJECT.maxFiles;

  // Test 1: In-Memory
  const result1 = await testLargeProject('In-Memory', MemoryIndex, maxFiles);

  // Force GC
  if (global.gc) {
    console.log('\n🧹 Running garbage collection...\n');
    global.gc();
    global.gc();
    global.gc();
  }
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Storage-Backed
  const result2 = await testLargeProject('Storage-Backed', MemoryIndexWithStorage, maxFiles);

  // Comparison
  console.log(`\n${'='.repeat(70)}`);
  console.log('  COMPARISON SUMMARY');
  console.log(`${'='.repeat(70)}\n`);

  console.log('┌─────────────────────┬─────────────────┬─────────────────┬──────────────┐');
  console.log('│ Metric              │ In-Memory       │ Storage-Backed  │ Difference   │');
  console.log('├─────────────────────┼─────────────────┼─────────────────┼──────────────┤');

  const timeDiff = ((result2.indexTime - result1.indexTime) / result1.indexTime * 100).toFixed(1);
  const memDiff = ((result2.memoryIncrease - result1.memoryIncrease) / result1.memoryIncrease * 100).toFixed(1);

  console.log(`│ Indexing Time       │ ${formatTime(result1.indexTime).padEnd(15)} │ ${formatTime(result2.indexTime).padEnd(15)} │ ${timeDiff >= 0 ? '+' : ''}${timeDiff}%`.padEnd(13) + ' │');
  console.log(`│ Memory Increase     │ ${formatMemory(result1.memoryIncrease).padEnd(15)} │ ${formatMemory(result2.memoryIncrease).padEnd(15)} │ ${memDiff >= 0 ? '+' : ''}${memDiff}%`.padEnd(13) + ' │');
  console.log(`│ Peak Memory         │ ${formatMemory(result1.peakMemory).padEnd(15)} │ ${formatMemory(result2.peakMemory).padEnd(15)} │ ${((result2.peakMemory - result1.peakMemory) / result1.peakMemory * 100).toFixed(1)}%`.padEnd(13) + ' │');
  console.log(`│ Symbols             │ ${String(result1.symbolsIndexed).padEnd(15)} │ ${String(result2.symbolsIndexed).padEnd(15)} │ ${result2.symbolsIndexed === result1.symbolsIndexed ? '=' : '≠'}`.padEnd(13) + ' │');
  console.log(`│ References          │ ${String(result1.referencesIndexed).padEnd(15)} │ ${String(result2.referencesIndexed).padEnd(15)} │ ${result2.referencesIndexed === result1.referencesIndexed ? '=' : '≠'}`.padEnd(13) + ' │');
  console.log('└─────────────────────┴─────────────────┴─────────────────┴──────────────┘\n');

  console.log('🏆 Winner:\n');
  
  if (result2.memoryIncrease < result1.memoryIncrease * 0.8) {
    console.log(`  ✅ Storage-Backed uses significantly less memory (${Math.abs(memDiff)}% less)`);
  }
  
  if (result2.indexTime < result1.indexTime * 1.2) {
    console.log(`  ✅ Storage-Backed maintains comparable speed`);
  }
  
  if (result2.symbolsIndexed === result1.symbolsIndexed && result2.referencesIndexed === result1.referencesIndexed) {
    console.log(`  ✅ Both extensions indexed identical data`);
  }

  console.log('');
}

main().catch(error => {
  console.error('\n💥 Unhandled error:', error);
  process.exit(1);
});
