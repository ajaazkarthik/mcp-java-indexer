#!/usr/bin/env node
/**
 * Test DB MODE vs FILE MODE comparison
 */

const path = require('path');
const fs = require('fs');

async function testBothModes() {
  console.log('═══════════════════════════════════════════════');
  console.log('  FILE MODE vs DB MODE Comparison Test');
  console.log('═══════════════════════════════════════════════\n');
  
  const testProject = path.join(__dirname, 'example-java-project');
  
  // Clean old index
  const indexDir = path.join(testProject, '.mcp-index');
  if (fs.existsSync(indexDir)) {
    fs.rmSync(indexDir, { recursive: true, force: true });
  }
  
  // ========== TEST 1: FILE MODE ==========
  console.log('📁 TEST 1: FILE MODE (In-Memory + JSON)\n');
  
  try {
    const { MemoryIndex } = require('./server/dist/memory-index.js');
    const { IndexerClient } = require('./server/dist/indexer-client.js');
    const { handleIndexProject } = require('./server/dist/tools/index_project.js');
    
    const memoryIndex1 = new MemoryIndex();
    memoryIndex1.setIndexDir(testProject);
    const indexerClient1 = new IndexerClient();
    await indexerClient1.start();
    
    console.log('   Indexing...');
    const start1 = Date.now();
    await handleIndexProject({ rootDir: testProject }, memoryIndex1, indexerClient1, () => {});
    const time1 = ((Date.now() - start1) / 1000).toFixed(2);
    
    const stats1 = memoryIndex1.getStats();
    console.log(`   ✅ Completed in ${time1}s`);
    console.log(`   📊 Symbols: ${stats1.symbols}`);
    console.log(`   📊 References: ${stats1.references}`);
    console.log(`   📊 Call Graph Edges: ${stats1.callGraphEdges}`);
    console.log(`   📊 Inheritance: ${stats1.inheritanceRelations}\n`);
    
    await indexerClient1.stop();
    
    // Save results for comparison
    const fileMode = {
      time: time1,
      symbols: stats1.symbols,
      references: stats1.references,
      callGraphEdges: stats1.callGraphEdges,
      inheritance: stats1.inheritanceRelations
    };
    
    // Clean for next test
    if (fs.existsSync(indexDir)) {
      fs.rmSync(indexDir, { recursive: true, force: true });
    }
    
    // ========== TEST 2: DB MODE ==========
    console.log('💾 TEST 2: DB MODE (SQLite Storage Backend)\n');
    
    try {
      const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
      const { IndexerClient } = require('./server/dist/indexer-client.js');
      const { handleIndexProject } = require('./server/dist/tools/index_project.js');
      
      const memoryIndex2 = new MemoryIndexWithStorage();
      memoryIndex2.setIndexDir(testProject);
      const indexerClient2 = new IndexerClient();
      await indexerClient2.start();
      
      console.log('   Indexing...');
      const start2 = Date.now();
      await handleIndexProject({ rootDir: testProject }, memoryIndex2, indexerClient2, () => {});
      const time2 = ((Date.now() - start2) / 1000).toFixed(2);
      
      // Wait for flush
      if (memoryIndex2.flush) {
        await memoryIndex2.flush();
      }
      
      const stats2 = memoryIndex2.getStats();
      console.log(`   ✅ Completed in ${time2}s`);
      console.log(`   📊 Symbols: ${stats2.symbols}`);
      console.log(`   📊 References: ${stats2.references}`);
      console.log(`   📊 Call Graph Edges: ${stats2.callGraphEdges}`);
      console.log(`   📊 Inheritance: ${stats2.inheritanceRelations}\n`);
      
      await indexerClient2.stop();
      await memoryIndex2.close();
      
      const dbMode = {
        time: time2,
        symbols: stats2.symbols,
        references: stats2.references,
        callGraphEdges: stats2.callGraphEdges,
        inheritance: stats2.inheritanceRelations
      };
      
      // ========== COMPARISON ==========
      console.log('═══════════════════════════════════════════════');
      console.log('  COMPARISON RESULTS');
      console.log('═══════════════════════════════════════════════\n');
      
      console.log('                    FILE MODE    DB MODE     Status');
      console.log('  ─────────────────────────────────────────────────');
      console.log(`  Time:             ${fileMode.time}s       ${dbMode.time}s      ${dbMode.time === fileMode.time ? '✅' : '⚠️'}`);
      console.log(`  Symbols:          ${fileMode.symbols}         ${dbMode.symbols}         ${dbMode.symbols === fileMode.symbols ? '✅' : '❌'}`);
      console.log(`  References:       ${fileMode.references}         ${dbMode.references}         ${dbMode.references === fileMode.references ? '✅' : '❌'}`);
      console.log(`  Call Graph:       ${fileMode.callGraphEdges}          ${dbMode.callGraphEdges}          ${dbMode.callGraphEdges === fileMode.callGraphEdges ? '✅' : '❌'}`);
      console.log(`  Inheritance:      ${fileMode.inheritance}          ${dbMode.inheritance}          ${dbMode.inheritance === fileMode.inheritance ? '✅' : '❌'}`);
      console.log();
      
      // Verdict
      if (dbMode.references === 0 || dbMode.callGraphEdges === 0) {
        console.log('🔴 VERDICT: DB MODE IS BROKEN');
        console.log('   Issue: References and/or call graph not being saved to storage');
        console.log('   Root cause: Storage backend not saving references properly\n');
        process.exit(1);
      } else if (dbMode.references === fileMode.references && dbMode.callGraphEdges === fileMode.callGraphEdges) {
        console.log('✅ VERDICT: BOTH MODES WORK CORRECTLY');
        console.log('   All data matches perfectly!\n');
        process.exit(0);
      } else {
        console.log('⚠️ VERDICT: DB MODE HAS DATA DISCREPANCIES');
        console.log(`   Ref diff: ${dbMode.references - fileMode.references}`);
        console.log(`   Call graph diff: ${dbMode.callGraphEdges - fileMode.callGraphEdges}\n`);
        process.exit(1);
      }
      
    } catch (error) {
      console.log(`   ❌ DB MODE ERROR: ${error.message}`);
      console.log(`   ${error.stack}\n`);
      console.log('🔴 VERDICT: DB MODE IS BROKEN (module error)\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ FILE MODE ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testBothModes();
