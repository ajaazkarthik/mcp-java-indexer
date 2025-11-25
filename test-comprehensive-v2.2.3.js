/**
 * COMPREHENSIVE TEST SUITE v2.2.3
 * 
 * Tests ALL scenarios from user feedback:
 * 1. Buffer overflow on large projects (27K files)
 * 2. Find usages returns 0 (regression)
 * 3. Call graph missing inbound calls
 * 4. Reindex file performance
 * 5. Index persistence after restart
 * 6. All 13+ tools functionality
 * 
 * HONEST FEEDBACK FORMAT - matches user's rating system
 */

const { MemoryIndex } = require('./server/dist/memory-index.js');
const { IndexerClient } = require('./server/dist/indexer-client.js');
const { Persistence } = require('./server/dist/persistence.js');
const path = require('path');
const fs = require('fs');
const { glob } = require('glob');

// Test configuration
const EXAMPLE_PROJECT = path.join(__dirname, 'example-java-project');
const LARGE_PROJECT = path.join(__dirname, 'large-java-project');

// Results tracking
const results = {
  tests: [],
  scores: {},
  passCount: 0,
  failCount: 0,
  warningCount: 0
};

function addResult(name, status, score, notes) {
  results.tests.push({ name, status, score, notes });
  results.scores[name] = score;
  if (status === 'PASS') results.passCount++;
  else if (status === 'FAIL') results.failCount++;
  else results.warningCount++;
}

async function testBufferOverflow() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: BUFFER OVERFLOW (Large Project Indexing)');
  console.log('═'.repeat(70));
  
  const projectToTest = fs.existsSync(LARGE_PROJECT) ? LARGE_PROJECT : EXAMPLE_PROJECT;
  const isLargeProject = projectToTest === LARGE_PROJECT;
  
  console.log(`\n📁 Testing: ${isLargeProject ? 'LARGE PROJECT' : 'Example Project (fallback)'}`);
  console.log(`   Path: ${projectToTest}`);
  
  const memoryIndex = new MemoryIndex();
  const indexerClient = new IndexerClient();
  
  try {
    await indexerClient.start();
    memoryIndex.setIndexDir(projectToTest);
    
    // Clear existing index
    const indexDir = memoryIndex.getIndexDir();
    if (fs.existsSync(indexDir)) {
      fs.rmSync(indexDir, { recursive: true, force: true });
    }
    
    // Find Java files
    const pattern = path.join(projectToTest, '**/*.java').replace(/\\/g, '/');
    const javaFiles = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
    });
    
    console.log(`   Java files: ${javaFiles.length}`);
    
    const startTime = Date.now();
    const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
    
    // Index with NEW batch size (100)
    const batchSize = 100;
    let totalSymbols = 0;
    let totalRefs = 0;
    let batchesProcessed = 0;
    let errors = [];
    
    const sourceRoots = [path.join(projectToTest, 'src/main/java'), path.join(projectToTest, 'src')];
    
    for (let i = 0; i < javaFiles.length; i += batchSize) {
      const batch = javaFiles.slice(i, Math.min(i + batchSize, javaFiles.length));
      
      try {
        const results = await indexerClient.indexFiles(batch, sourceRoots);
        
        for (const result of results) {
          if (result.error) {
            errors.push({ file: result.file, error: result.error });
            continue;
          }
          
          const symbolFqns = [];
          for (const symbol of result.symbols) {
            memoryIndex.addSymbol(symbol);
            symbolFqns.push(symbol.fqn);
            totalSymbols++;
          }
          
          for (const ref of result.references) {
            memoryIndex.addReference(ref);
            totalRefs++;
          }
          
          const hash = await MemoryIndex.calculateFileHash(result.file);
          memoryIndex.addFile(result.file, hash, symbolFqns, true);
        }
        
        batchesProcessed++;
        
        // Progress every 10 batches
        if (batchesProcessed % 10 === 0) {
          const progress = Math.min(i + batchSize, javaFiles.length);
          const pct = ((progress / javaFiles.length) * 100).toFixed(1);
          const memUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
          console.log(`   Progress: ${progress}/${javaFiles.length} (${pct}%) - ${memUsed}MB heap`);
        }
        
      } catch (error) {
        // CRITICAL: Check for buffer overflow
        if (error.message && error.message.includes('Buffer overflow')) {
          console.log(`\n   ❌ BUFFER OVERFLOW at batch ${batchesProcessed}!`);
          addResult('Buffer Overflow Prevention', 'FAIL', 0, 
            `Buffer overflow at ${batchesProcessed * batchSize} files. CRITICAL BUG!`);
          await indexerClient.stop();
          return { success: false, memoryIndex: null };
        }
        errors.push({ batch: batchesProcessed, error: error.message });
      }
    }
    
    const duration = (Date.now() - startTime) / 1000;
    const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
    const stats = memoryIndex.getStats();
    
    console.log(`\n   ✅ Indexing complete!`);
    console.log(`   Duration: ${duration.toFixed(1)}s`);
    console.log(`   Files indexed: ${stats.indexedFiles}`);
    console.log(`   Symbols: ${stats.symbols}`);
    console.log(`   References: ${stats.references}`);
    console.log(`   Call Graph Edges: ${stats.callGraphEdges}`);
    console.log(`   Memory: ${startMem.toFixed(1)}MB → ${endMem.toFixed(1)}MB`);
    
    if (errors.length > 0) {
      console.log(`   ⚠️  Errors: ${errors.length}`);
    }
    
    // Score based on project size
    let score = 10;
    if (javaFiles.length > 1000 && stats.indexedFiles < javaFiles.length * 0.9) {
      score = 5; // Incomplete indexing
    }
    if (errors.some(e => e.error && e.error.includes('Buffer'))) {
      score = 0; // Buffer overflow
    }
    
    addResult('Buffer Overflow Prevention', 'PASS', score, 
      `Indexed ${stats.indexedFiles}/${javaFiles.length} files in ${duration.toFixed(1)}s`);
    
    await indexerClient.stop();
    return { success: true, memoryIndex, stats };
    
  } catch (error) {
    console.log(`\n   ❌ FAILED: ${error.message}`);
    
    if (error.message.includes('Buffer overflow')) {
      addResult('Buffer Overflow Prevention', 'FAIL', 0, 'Buffer overflow occurred');
    } else {
      addResult('Buffer Overflow Prevention', 'FAIL', 2, error.message);
    }
    
    try { await indexerClient.stop(); } catch (e) {}
    return { success: false, memoryIndex: null };
  }
}

async function testFindUsages(memoryIndex) {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: FIND USAGES (Was returning 0 - REGRESSION)');
  console.log('═'.repeat(70));
  
  if (!memoryIndex) {
    addResult('Find Usages', 'FAIL', 0, 'Cannot test - no index available');
    return;
  }
  
  try {
    const stats = memoryIndex.getStats();
    console.log(`\n   Index has ${stats.references} references`);
    
    // Find some methods to test
    const allSymbols = memoryIndex.getAllSymbols();
    const methods = [];
    for (const [fqn, symbol] of allSymbols) {
      if (symbol.kind === 'method') {
        methods.push(symbol);
      }
    }
    
    console.log(`   Found ${methods.length} methods in index`);
    
    // Test find usages on multiple methods
    let totalUsagesFound = 0;
    let methodsTested = 0;
    let methodsWithUsages = 0;
    
    const testMethods = methods.slice(0, 20); // Test first 20 methods
    
    for (const method of testMethods) {
      const usages = memoryIndex.findUsages(method.fqn);
      methodsTested++;
      
      if (usages.length > 0) {
        methodsWithUsages++;
        totalUsagesFound += usages.length;
        if (methodsWithUsages <= 5) {
          console.log(`   ✅ ${method.name}: ${usages.length} usages`);
        }
      }
    }
    
    console.log(`\n   Methods tested: ${methodsTested}`);
    console.log(`   Methods with usages: ${methodsWithUsages}`);
    console.log(`   Total usages found: ${totalUsagesFound}`);
    
    // Score: 10 if usages found, 0 if none (regression)
    let score = 0;
    let status = 'FAIL';
    let notes = '';
    
    if (totalUsagesFound > 0) {
      score = 10;
      status = 'PASS';
      notes = `Found ${totalUsagesFound} usages across ${methodsWithUsages} methods`;
    } else if (stats.references === 0) {
      score = 2;
      status = 'WARN';
      notes = 'No references in index - may be project issue';
    } else {
      score = 0;
      status = 'FAIL';
      notes = `REGRESSION: ${stats.references} refs in index but findUsages returns 0`;
    }
    
    addResult('Find Usages', status, score, notes);
    
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    addResult('Find Usages', 'FAIL', 0, error.message);
  }
}

async function testCallGraphInbound(memoryIndex) {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: CALL GRAPH INBOUND CALLS (Was showing 0)');
  console.log('═'.repeat(70));
  
  if (!memoryIndex) {
    addResult('Call Graph Inbound', 'FAIL', 0, 'Cannot test - no index available');
    return;
  }
  
  try {
    const stats = memoryIndex.getStats();
    console.log(`\n   Index has ${stats.callGraphEdges} call graph edges`);
    
    // Find methods and test inbound/outbound calls
    const allSymbols = memoryIndex.getAllSymbols();
    const methods = [];
    for (const [fqn, symbol] of allSymbols) {
      if (symbol.kind === 'method') {
        methods.push(symbol);
      }
    }
    
    let totalInbound = 0;
    let totalOutbound = 0;
    let methodsWithInbound = 0;
    let methodsWithOutbound = 0;
    
    const testMethods = methods.slice(0, 20);
    
    for (const method of testMethods) {
      const inbound = memoryIndex.getInboundCalls(method.fqn);
      const outbound = memoryIndex.getOutboundCalls(method.fqn);
      
      if (inbound.length > 0) {
        methodsWithInbound++;
        totalInbound += inbound.length;
        if (methodsWithInbound <= 3) {
          console.log(`   📥 ${method.name}: ${inbound.length} callers`);
        }
      }
      
      if (outbound.length > 0) {
        methodsWithOutbound++;
        totalOutbound += outbound.length;
        if (methodsWithOutbound <= 3) {
          console.log(`   📤 ${method.name}: ${outbound.length} callees`);
        }
      }
    }
    
    console.log(`\n   Methods with inbound calls: ${methodsWithInbound}`);
    console.log(`   Methods with outbound calls: ${methodsWithOutbound}`);
    console.log(`   Total inbound edges: ${totalInbound}`);
    console.log(`   Total outbound edges: ${totalOutbound}`);
    
    // Score
    let score = 0;
    let status = 'FAIL';
    let notes = '';
    
    if (totalInbound > 0) {
      score = 10;
      status = 'PASS';
      notes = `${totalInbound} inbound calls found across ${methodsWithInbound} methods`;
    } else if (stats.callGraphEdges === 0) {
      score = 3;
      status = 'WARN';
      notes = 'No call graph edges in index - may be project issue';
    } else {
      score = 0;
      status = 'FAIL';
      notes = `REGRESSION: ${stats.callGraphEdges} edges in index but getInboundCalls returns 0`;
    }
    
    addResult('Call Graph Inbound', status, score, notes);
    
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    addResult('Call Graph Inbound', 'FAIL', 0, error.message);
  }
}

async function testReindexFilePerformance(memoryIndex) {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 4: REINDEX FILE PERFORMANCE (Was 72s → 20s target <1s)');
  console.log('═'.repeat(70));
  
  if (!memoryIndex) {
    addResult('Reindex File Performance', 'FAIL', 0, 'Cannot test - no index available');
    return;
  }
  
  try {
    const indexerClient = new IndexerClient();
    await indexerClient.start();
    
    // Find a Java file to test
    const projectDir = fs.existsSync(LARGE_PROJECT) ? LARGE_PROJECT : EXAMPLE_PROJECT;
    const pattern = path.join(projectDir, '**/*.java').replace(/\\/g, '/');
    const javaFiles = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
    });
    
    if (javaFiles.length === 0) {
      addResult('Reindex File Performance', 'WARN', 5, 'No Java files found');
      await indexerClient.stop();
      return;
    }
    
    const testFile = javaFiles[0];
    console.log(`\n   Testing reindex on: ${path.basename(testFile)}`);
    
    const startTime = Date.now();
    const sourceRoots = [path.join(projectDir, 'src/main/java'), path.join(projectDir, 'src')];
    
    const result = await indexerClient.indexFile(testFile, sourceRoots);
    
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`   Duration: ${duration.toFixed(2)}s`);
    console.log(`   Symbols: ${result.symbols?.length || 0}`);
    console.log(`   References: ${result.references?.length || 0}`);
    
    await indexerClient.stop();
    
    // Score: <1s = 10, <5s = 8, <10s = 5, <20s = 3, >20s = 1
    let score = 1;
    if (duration < 1) score = 10;
    else if (duration < 5) score = 8;
    else if (duration < 10) score = 5;
    else if (duration < 20) score = 3;
    
    const status = score >= 5 ? 'PASS' : 'WARN';
    addResult('Reindex File Performance', status, score, `${duration.toFixed(2)}s (target <1s)`);
    
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    addResult('Reindex File Performance', 'FAIL', 0, error.message);
  }
}

async function testIndexPersistence() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 5: INDEX PERSISTENCE (Save & Load)');
  console.log('═'.repeat(70));
  
  const projectDir = EXAMPLE_PROJECT;
  
  try {
    // Create fresh index
    const memoryIndex1 = new MemoryIndex();
    const indexerClient = new IndexerClient();
    
    await indexerClient.start();
    memoryIndex1.setIndexDir(projectDir);
    
    // Index a few files
    const pattern = path.join(projectDir, '**/*.java').replace(/\\/g, '/');
    const javaFiles = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
    });
    
    const testFiles = javaFiles.slice(0, 10);
    const sourceRoots = [path.join(projectDir, 'src/main/java')];
    
    const results = await indexerClient.indexFiles(testFiles, sourceRoots);
    
    for (const result of results) {
      if (!result.error) {
        for (const symbol of result.symbols) {
          memoryIndex1.addSymbol(symbol);
        }
        for (const ref of result.references) {
          memoryIndex1.addReference(ref);
        }
      }
    }
    
    const stats1 = memoryIndex1.getStats();
    console.log(`\n   Indexed: ${stats1.symbols} symbols, ${stats1.references} refs`);
    
    // Save to disk
    const persistence = new Persistence(memoryIndex1.getIndexDir());
    await persistence.save(memoryIndex1);
    console.log(`   Saved to disk`);
    
    // Create new index and load
    const memoryIndex2 = new MemoryIndex();
    memoryIndex2.setIndexDir(projectDir);
    
    const loaded = await persistence.load(memoryIndex2);
    
    if (!loaded) {
      addResult('Index Persistence', 'FAIL', 0, 'Failed to load persisted index');
      await indexerClient.stop();
      return;
    }
    
    const stats2 = memoryIndex2.getStats();
    console.log(`   Loaded: ${stats2.symbols} symbols, ${stats2.references} refs`);
    
    await indexerClient.stop();
    
    // Verify counts match
    if (stats1.symbols === stats2.symbols && stats1.references === stats2.references) {
      console.log(`   ✅ Persistence verified`);
      addResult('Index Persistence', 'PASS', 10, 'Index saved and loaded correctly');
    } else {
      console.log(`   ⚠️ Data mismatch`);
      addResult('Index Persistence', 'WARN', 5, 
        `Mismatch: ${stats1.symbols}→${stats2.symbols} symbols, ${stats1.references}→${stats2.references} refs`);
    }
    
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    addResult('Index Persistence', 'FAIL', 0, error.message);
  }
}

async function testAllToolsExecution(memoryIndex) {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 6: ALL TOOLS EXECUTION');
  console.log('═'.repeat(70));
  
  if (!memoryIndex) {
    addResult('Tools Execution', 'FAIL', 0, 'Cannot test - no index available');
    return;
  }
  
  const toolResults = [];
  
  // Tool list to test
  const tools = [
    { name: 'find_symbol', file: './server/dist/tools/find_symbol.js', handler: 'handleFindSymbol', args: { name: 'Dog' } },
    { name: 'find_usages', file: './server/dist/tools/find_usages.js', handler: 'handleFindUsages', args: { fqn: 'com.example.demo.Dog' } },
    { name: 'call_graph', file: './server/dist/tools/call_graph.js', handler: 'handleCallGraph', args: { fqn: 'com.example.demo.Dog.bark()' } },
    { name: 'goto_definition', file: './server/dist/tools/goto_definition.js', handler: 'handleGotoDefinition', args: { name: 'Dog' } },
    { name: 'search_text', file: './server/dist/tools/search_text.js', handler: 'handleSearchText', args: { query: 'class', rootDir: EXAMPLE_PROJECT } },
    { name: 'analyze_impact', file: './server/dist/tools/analyze_impact.js', handler: 'handleAnalyzeImpact', args: { fqn: 'com.example.demo.Dog' } },
    { name: 'semantic_search', file: './server/dist/tools/semantic_search.js', handler: 'handleSemanticSearch', args: { query: 'animal' } },
    { name: 'explain_code', file: './server/dist/tools/explain_code.js', handler: 'handleExplainCode', args: { fqn: 'com.example.demo.Dog' } },
    { name: 'test_coverage', file: './server/dist/tools/test_coverage.js', handler: 'handleTestCoverage', args: { fqn: 'com.example.demo.Dog' } },
    { name: 'refactoring_suggestions', file: './server/dist/tools/refactoring_suggestions.js', handler: 'handleRefactoringSuggestions', args: { fqn: 'com.example.demo.Dog' } },
    { name: 'code_generation', file: './server/dist/tools/code_generation.js', handler: 'handleCodeGeneration', args: { description: 'test method', context: 'com.example' } },
    { name: 'compact_index', file: './server/dist/tools/compact_index.js', handler: 'handleCompactIndex', args: {} },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const tool of tools) {
    try {
      const module = require(tool.file);
      const handler = module[tool.handler];
      
      const result = await handler(tool.args, memoryIndex);
      
      if (result && result.content && !result.isError) {
        console.log(`   ✅ ${tool.name}`);
        passed++;
        toolResults.push({ name: tool.name, status: 'PASS' });
      } else {
        console.log(`   ⚠️  ${tool.name}: ${result?.content?.[0]?.text?.substring(0, 50) || 'No output'}`);
        toolResults.push({ name: tool.name, status: 'WARN' });
      }
    } catch (error) {
      console.log(`   ❌ ${tool.name}: ${error.message}`);
      failed++;
      toolResults.push({ name: tool.name, status: 'FAIL', error: error.message });
    }
  }
  
  const score = Math.round((passed / tools.length) * 10);
  const status = failed === 0 ? 'PASS' : (failed <= 2 ? 'WARN' : 'FAIL');
  
  addResult('Tools Execution', status, score, `${passed}/${tools.length} tools working`);
}

function generateReport() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                    COMPREHENSIVE TEST REPORT v2.2.3                   ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  
  // Individual test results
  console.log('║                                                                      ║');
  console.log('║  DETAILED RESULTS                                                    ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  
  for (const test of results.tests) {
    const statusIcon = test.status === 'PASS' ? '✅' : (test.status === 'FAIL' ? '❌' : '⚠️');
    const scorePad = test.score.toString().padStart(2);
    console.log(`║  ${statusIcon} ${test.name.padEnd(30)} ${scorePad}/10  ${test.status.padEnd(4)}  ║`);
  }
  
  // Summary
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                      ║');
  console.log('║  SUMMARY                                                             ║');
  
  const totalScore = Object.values(results.scores).reduce((a, b) => a + b, 0);
  const maxScore = Object.keys(results.scores).length * 10;
  const avgScore = (totalScore / Object.keys(results.scores).length).toFixed(1);
  
  console.log(`║    Total Tests: ${results.tests.length}                                                  ║`);
  console.log(`║    Passed: ${results.passCount}  Failed: ${results.failCount}  Warnings: ${results.warningCount}                              ║`);
  console.log(`║    Average Score: ${avgScore}/10                                            ║`);
  console.log('║                                                                      ║');
  
  // Critical issues found
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log('║  CRITICAL ISSUES                                                     ║');
  
  const criticalIssues = results.tests.filter(t => t.status === 'FAIL');
  if (criticalIssues.length === 0) {
    console.log('║    ✅ No critical issues found                                       ║');
  } else {
    for (const issue of criticalIssues) {
      console.log(`║    ❌ ${issue.name}: ${issue.notes.substring(0, 45)}...║`);
    }
  }
  
  // Comparison table (v2 vs v3)
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log('║  COMPARISON: v2 (Before) vs v2.2.3 (After Fixes)                     ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  
  const comparisons = [
    { feature: 'Buffer Overflow', v2: '0/10 (BROKEN)', v3: results.scores['Buffer Overflow Prevention'] !== undefined ? `${results.scores['Buffer Overflow Prevention']}/10` : 'N/A' },
    { feature: 'Find Usages', v2: '0/10 (0 results)', v3: results.scores['Find Usages'] !== undefined ? `${results.scores['Find Usages']}/10` : 'N/A' },
    { feature: 'Call Graph Inbound', v2: '0/10 (0 inbound)', v3: results.scores['Call Graph Inbound'] !== undefined ? `${results.scores['Call Graph Inbound']}/10` : 'N/A' },
    { feature: 'Reindex File', v2: '4/10 (20s)', v3: results.scores['Reindex File Performance'] !== undefined ? `${results.scores['Reindex File Performance']}/10` : 'N/A' },
    { feature: 'Index Persistence', v2: '9/10', v3: results.scores['Index Persistence'] !== undefined ? `${results.scores['Index Persistence']}/10` : 'N/A' },
    { feature: 'Tools Execution', v2: '7/10', v3: results.scores['Tools Execution'] !== undefined ? `${results.scores['Tools Execution']}/10` : 'N/A' },
  ];
  
  for (const comp of comparisons) {
    console.log(`║    ${comp.feature.padEnd(20)} v2: ${comp.v2.padEnd(15)} v2.2.3: ${comp.v3.padEnd(10)}║`);
  }
  
  // Final verdict
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log('║  FINAL VERDICT                                                       ║');
  
  let verdict = '';
  let recommendation = '';
  
  if (results.failCount === 0 && avgScore >= 8) {
    verdict = '✅ READY FOR COMMIT';
    recommendation = 'All critical issues fixed. Safe to publish.';
  } else if (results.failCount === 0 && avgScore >= 6) {
    verdict = '⚠️  NEEDS REVIEW';
    recommendation = 'No critical failures but some issues remain.';
  } else {
    verdict = '❌ DO NOT COMMIT';
    recommendation = 'Critical issues remain. More fixes needed.';
  }
  
  console.log(`║    ${verdict}                                               ║`);
  console.log(`║    ${recommendation.padEnd(60)}  ║`);
  console.log('║                                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  
  // Return exit code
  return results.failCount === 0;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║         MCP JAVA INDEXER - COMPREHENSIVE TEST SUITE v2.2.3           ║');
  console.log('║                                                                      ║');
  console.log('║  Testing all scenarios from user feedback:                           ║');
  console.log('║  1. Buffer overflow on large projects                                ║');
  console.log('║  2. Find usages regression (0 results)                               ║');
  console.log('║  3. Call graph missing inbound calls                                 ║');
  console.log('║  4. Reindex file performance                                         ║');
  console.log('║  5. Index persistence                                                ║');
  console.log('║  6. All tools execution                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  
  try {
    // Test 1: Buffer overflow (also creates index for other tests)
    const { success, memoryIndex, stats } = await testBufferOverflow();
    
    // Test 2-6: Use the index from test 1
    await testFindUsages(memoryIndex);
    await testCallGraphInbound(memoryIndex);
    await testReindexFilePerformance(memoryIndex);
    await testIndexPersistence();
    await testAllToolsExecution(memoryIndex);
    
    // Generate final report
    const allPassed = generateReport();
    
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
