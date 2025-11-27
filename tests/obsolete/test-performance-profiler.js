#!/usr/bin/env node
/**
 * PERFORMANCE PROFILER: Deep analysis of indexing performance
 * 
 * Measures:
 * - Batch processing time
 * - Java parser overhead
 * - Storage write overhead
 * - Memory usage patterns
 * - GC impact
 * - Bottleneck identification
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

async function profileIndexing(projectPath, mode) {
  log(colors.cyan, `\n${'='.repeat(60)}`);
  log(colors.cyan, `  Profiling ${mode} on: ${path.basename(projectPath)}`);
  log(colors.cyan, '='.repeat(60));
  
  const indexDir = path.join(projectPath, '.mcp-index');
  if (fs.existsSync(indexDir)) {
    try {
      fs.rmSync(indexDir, { recursive: true, force: true });
    } catch (e) {}
  }
  
  const IndexClass = mode === 'FILE' 
    ? require('./server/dist/memory-index.js').MemoryIndex
    : require('./server/dist/memory-index-storage.js').MemoryIndexWithStorage;
  
  const { IndexerClient } = require('./server/dist/indexer-client.js');
  const glob = require('glob');
  
  const memoryIndex = new IndexClass();
  memoryIndex.setIndexDir(projectPath);
  const indexerClient = new IndexerClient();
  await indexerClient.start();
  
  // Find all Java files
  const javaFiles = glob.sync('**/*.java', { 
    cwd: projectPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/target/**', '**/build/**', '**/.git/**']
  });
  
  log(colors.blue, `\nFound ${javaFiles.length} Java files`);
  
  const BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < javaFiles.length; i += BATCH_SIZE) {
    batches.push(javaFiles.slice(i, i + BATCH_SIZE));
  }
  
  log(colors.blue, `Processing ${batches.length} batches of ${BATCH_SIZE} files\n`);
  
  const timings = {
    javaParser: [],
    storage: [],
    maintenance: [],
    total: []
  };
  
  let totalSymbols = 0;
  let totalReferences = 0;
  const startOverall = Date.now();
  
  for (let i = 0; i < batches.length && i < 10; i++) { // Limit to 10 batches for profiling
    const batch = batches[i];
    const batchStart = Date.now();
    
    // Measure Java parser time
    const parseStart = Date.now();
    const results = await indexerClient.indexFiles(batch, []);
    const parseTime = Date.now() - parseStart;
    timings.javaParser.push(parseTime);
    
    // Measure storage time
    const storageStart = Date.now();
    for (const result of results) {
      if (result.symbols) {
        for (const symbol of result.symbols) {
          memoryIndex.addSymbol(symbol);
          totalSymbols++;
        }
      }
      if (result.references) {
        for (const ref of result.references) {
          memoryIndex.addReference(ref);
          totalReferences++;
        }
      }
    }
    const storageTime = Date.now() - storageStart;
    timings.storage.push(storageTime);
    
    // Measure maintenance
    const maintStart = Date.now();
    if (memoryIndex.performMaintenanceCleanup) {
      if (i > 0 && i % 5 === 0) {
        memoryIndex.performMaintenanceCleanup();
      }
    }
    const maintTime = Date.now() - maintStart;
    timings.maintenance.push(maintTime);
    
    const batchTime = Date.now() - batchStart;
    timings.total.push(batchTime);
    
    const mem = process.memoryUsage();
    const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const maxHeapMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
    
    log(colors.blue, 
      `Batch ${i + 1}: ` +
      `Parse=${parseTime}ms | ` +
      `Store=${storageTime}ms | ` +
      `Maint=${maintTime}ms | ` +
      `Total=${batchTime}ms | ` +
      `Heap=${heapMB}/${maxHeapMB}MB`
    );
  }
  
  const totalTime = Date.now() - startOverall;
  
  // Flush storage
  if (memoryIndex.flush) {
    const flushStart = Date.now();
    await memoryIndex.flush();
    const flushTime = Date.now() - flushStart;
    log(colors.magenta, `\nFlush time: ${flushTime}ms`);
  }
  
  await indexerClient.stop();
  if (memoryIndex.close) {
    await memoryIndex.close();
  }
  
  // Calculate statistics
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const max = arr => Math.max(...arr);
  const min = arr => Math.min(...arr);
  
  log(colors.cyan, '\n' + '─'.repeat(60));
  log(colors.cyan, '  PERFORMANCE BREAKDOWN');
  log(colors.cyan, '─'.repeat(60));
  
  log(colors.blue, '\n📊 Java Parser:');
  log(colors.blue, `   Average: ${avg(timings.javaParser).toFixed(0)}ms per batch`);
  log(colors.blue, `   Min/Max: ${min(timings.javaParser)}ms / ${max(timings.javaParser)}ms`);
  log(colors.blue, `   Total: ${timings.javaParser.reduce((a, b) => a + b, 0)}ms`);
  
  log(colors.blue, '\n💾 Storage:');
  log(colors.blue, `   Average: ${avg(timings.storage).toFixed(0)}ms per batch`);
  log(colors.blue, `   Min/Max: ${min(timings.storage)}ms / ${max(timings.storage)}ms`);
  log(colors.blue, `   Total: ${timings.storage.reduce((a, b) => a + b, 0)}ms`);
  
  log(colors.blue, '\n🔧 Maintenance:');
  log(colors.blue, `   Average: ${avg(timings.maintenance).toFixed(0)}ms per batch`);
  log(colors.blue, `   Total: ${timings.maintenance.reduce((a, b) => a + b, 0)}ms`);
  
  log(colors.blue, '\n⏱️  Total Batch Processing:');
  log(colors.blue, `   Average: ${avg(timings.total).toFixed(0)}ms per batch`);
  log(colors.blue, `   Total: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
  
  // Bottleneck analysis
  const parsePercent = (timings.javaParser.reduce((a, b) => a + b, 0) / totalTime * 100).toFixed(1);
  const storagePercent = (timings.storage.reduce((a, b) => a + b, 0) / totalTime * 100).toFixed(1);
  const maintPercent = (timings.maintenance.reduce((a, b) => a + b, 0) / totalTime * 100).toFixed(1);
  
  log(colors.magenta, '\n🎯 Bottleneck Analysis:');
  log(colors.magenta, `   Java Parser: ${parsePercent}%`);
  log(colors.magenta, `   Storage:     ${storagePercent}%`);
  log(colors.magenta, `   Maintenance: ${maintPercent}%`);
  log(colors.magenta, `   Other:       ${(100 - parseFloat(parsePercent) - parseFloat(storagePercent) - parseFloat(maintPercent)).toFixed(1)}%`);
  
  // Throughput
  const filesProcessed = Math.min(batches.length * BATCH_SIZE, javaFiles.length);
  const filesPerSec = (filesProcessed / (totalTime / 1000)).toFixed(1);
  const symbolsPerSec = (totalSymbols / (totalTime / 1000)).toFixed(0);
  
  log(colors.green, '\n📈 Throughput:');
  log(colors.green, `   ${filesPerSec} files/sec`);
  log(colors.green, `   ${symbolsPerSec} symbols/sec`);
  log(colors.green, `   ${totalSymbols} symbols total`);
  log(colors.green, `   ${totalReferences} references total`);
  
  return {
    mode,
    totalTime,
    timings,
    throughput: {
      filesPerSec: parseFloat(filesPerSec),
      symbolsPerSec: parseInt(symbolsPerSec)
    },
    bottlenecks: {
      parser: parseFloat(parsePercent),
      storage: parseFloat(storagePercent),
      maintenance: parseFloat(maintPercent)
    }
  };
}

async function analyzePerformance() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PERFORMANCE PROFILER: Deep Analysis                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  const exampleProject = path.join(__dirname, 'example-java-project');
  
  if (!fs.existsSync(exampleProject)) {
    log(colors.red, '\n❌ example-java-project not found');
    process.exit(1);
  }
  
  const fileResult = await profileIndexing(exampleProject, 'FILE');
  const dbResult = await profileIndexing(exampleProject, 'DB');
  
  // Comparison
  log(colors.cyan, '\n' + '═'.repeat(60));
  log(colors.cyan, '  MODE COMPARISON');
  log(colors.cyan, '═'.repeat(60));
  
  log(colors.blue, `\nTotal Time:`);
  log(colors.blue, `  FILE MODE: ${fileResult.totalTime}ms`);
  log(colors.blue, `  DB MODE:   ${dbResult.totalTime}ms`);
  log(colors.blue, `  Overhead:  ${((dbResult.totalTime / fileResult.totalTime - 1) * 100).toFixed(1)}%`);
  
  log(colors.blue, `\nThroughput:`);
  log(colors.blue, `  FILE MODE: ${fileResult.throughput.filesPerSec} files/s`);
  log(colors.blue, `  DB MODE:   ${dbResult.throughput.filesPerSec} files/s`);
  
  log(colors.blue, `\nBottleneck Comparison:`);
  log(colors.blue, `  Parser overhead:  FILE=${fileResult.bottlenecks.parser}% DB=${dbResult.bottlenecks.parser}%`);
  log(colors.blue, `  Storage overhead: FILE=${fileResult.bottlenecks.storage}% DB=${dbResult.bottlenecks.storage}%`);
  
  // Recommendations
  log(colors.magenta, '\n💡 Optimization Recommendations:');
  
  if (dbResult.bottlenecks.parser > 60) {
    log(colors.yellow, '   ⚠️  Java parser is the bottleneck (>60%)');
    log(colors.yellow, '      - Consider increasing batch size');
    log(colors.yellow, '      - Optimize JavaParser settings');
  }
  
  if (dbResult.bottlenecks.storage > 30) {
    log(colors.yellow, '   ⚠️  Storage writes are significant (>30%)');
    log(colors.yellow, '      - Increase write queue batch size');
    log(colors.yellow, '      - Reduce flush frequency');
  }
  
  if (dbResult.bottlenecks.maintenance > 10) {
    log(colors.yellow, '   ⚠️  Maintenance overhead is high (>10%)');
    log(colors.yellow, '      - Reduce maintenance frequency');
    log(colors.yellow, '      - Consider lazy cleanup');
  }
  
  const overhead = ((dbResult.totalTime / fileResult.totalTime - 1) * 100);
  if (overhead < 50) {
    log(colors.green, `   ✅ DB overhead is reasonable (${overhead.toFixed(1)}%)`);
  } else if (overhead < 100) {
    log(colors.yellow, `   ⚠️  DB overhead is noticeable (${overhead.toFixed(1)}%)`);
  } else {
    log(colors.red, `   ❌ DB overhead is too high (${overhead.toFixed(1)}%)`);
  }
  
  log(colors.green, '\n✅ Profiling complete');
}

analyzePerformance().catch(error => {
  console.error('\n❌ Fatal error:', error);
  console.error(error.stack);
  process.exit(1);
});
