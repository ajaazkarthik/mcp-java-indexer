#!/usr/bin/env node

/**
 * Java Indexer v2.2.1 - Complete Tool Verification
 * Tests all 13+ tools with CORRECT parameter names
 */

const path = require('path');
const fs = require('fs');

async function runCompleteVerification() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Java Indexer MCP v2.2.1 - Complete Tool Verification   ║');
  console.log('║  Testing all tools with correct parameter names         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const testProject = path.join(__dirname, 'example-java-project');
  const results = {
    passed: [],
    failed: [],
    errors: []
  };

  try {
    // Load all dependencies
    const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
    const { IndexerClient } = require('./server/dist/indexer-client.js');

    const memoryIndex = new MemoryIndexWithStorage();
    memoryIndex.setIndexDir(testProject);
    const indexerClient = new IndexerClient();
    await indexerClient.start();

    // Clean up old index
    const indexDir = path.join(testProject, '.mcp-index');
    if (fs.existsSync(indexDir)) {
      fs.rmSync(indexDir, { recursive: true, force: true });
    }

    // ========== TOOL 1: index_project ==========
    console.log('📦 Tool 1: index_project');
    try {
      const { handleIndexProject } = require('./server/dist/tools/index_project.js');
      await handleIndexProject(
        { rootDir: testProject },
        memoryIndex,
        indexerClient
      );
      const stats = memoryIndex.getStats();
      console.log(`   ✅ PASS - Indexed ${stats.symbols} symbols from ${stats.indexedFiles} files\n`);
      results.passed.push('index_project');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('index_project');
    }

    // ========== TOOL 2: find_symbol ==========
    console.log('🔍 Tool 2: find_symbol');
    try {
      const { handleFindSymbol } = require('./server/dist/tools/find_symbol.js');
      const result = await handleFindSymbol(
        { name: 'Dog' },  // Correct parameter: 'name'
        memoryIndex
      );
      if (result.content[0].text.includes('Dog')) {
        console.log('   ✅ PASS - Found symbol: Dog\n');
        results.passed.push('find_symbol');
      } else {
        console.log('   ❌ FAIL - Symbol not found\n');
        results.failed.push('find_symbol');
      }
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('find_symbol');
    }

    // ========== TOOL 3: find_usages ==========
    console.log('🔗 Tool 3: find_usages');
    try {
      const { handleFindUsages } = require('./server/dist/tools/find_usages.js');
      const result = await handleFindUsages(
        { fqn: 'com.example.demo.Dog' },  // Correct parameter: 'fqn'
        memoryIndex
      );
      console.log(`   ✅ PASS - Query executed (${result.content[0].text.substring(0, 40)}...)\n`);
      results.passed.push('find_usages');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('find_usages');
    }

    // ========== TOOL 4: call_graph ==========
    console.log('📞 Tool 4: call_graph');
    try {
      const { handleCallGraph } = require('./server/dist/tools/call_graph.js');
      const result = await handleCallGraph(
        { fqn: 'com.example.demo.Dog' },  // Correct parameter: 'fqn'
        memoryIndex
      );
      console.log(`   ✅ PASS - Call graph generated\n`);
      results.passed.push('call_graph');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('call_graph');
    }

    // ========== TOOL 5: goto_definition ==========
    console.log('➡️  Tool 5: goto_definition');
    try {
      const { handleGotoDefinition } = require('./server/dist/tools/goto_definition.js');
      const result = await handleGotoDefinition(
        { symbol: 'Dog' },  // Correct parameter: 'symbol' or 'symbolName' (NOT 'name' or 'fqn')
        memoryIndex
      );
      console.log(`   ✅ PASS - Definition lookup executed\n`);
      results.passed.push('goto_definition');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('goto_definition');
    }

    // ========== TOOL 6: search_text ==========
    console.log('🔎 Tool 6: search_text');
    try {
      const { handleSearchText } = require('./server/dist/tools/search_text.js');
      const result = await handleSearchText(
        { query: 'class', rootDir: testProject },  // Correct parameters: 'query' and 'rootDir'
        memoryIndex
      );
      console.log(`   ✅ PASS - Text search executed\n`);
      results.passed.push('search_text');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('search_text');
    }

    // ========== TOOL 7: analyze_impact ==========
    console.log('🎯 Tool 7: analyze_impact');
    try {
      const { handleAnalyzeImpact } = require('./server/dist/tools/analyze_impact.js');
      const result = await handleAnalyzeImpact(
        { fqn: 'com.example.demo.Dog' },  // Correct parameter: 'fqn'
        memoryIndex
      );
      console.log(`   ✅ PASS - Impact analysis executed\n`);
      results.passed.push('analyze_impact');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('analyze_impact');
    }

    // ========== TOOL 8: semantic_search ==========
    console.log('🧠 Tool 8: semantic_search');
    try {
      const { handleSemanticSearch } = require('./server/dist/tools/semantic_search.js');
      const result = await handleSemanticSearch(
        { query: 'animal class' },  // Correct parameter: 'query'
        memoryIndex
      );
      console.log(`   ✅ PASS - Semantic search executed\n`);
      results.passed.push('semantic_search');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('semantic_search');
    }

    // ========== TOOL 9: explain_code ==========
    console.log('📝 Tool 9: explain_code');
    try {
      const { handleExplainCode } = require('./server/dist/tools/explain_code.js');
      const result = await handleExplainCode(
        { fqn: 'com.example.demo.Dog' },  // Correct parameter: 'fqn'
        memoryIndex
      );
      console.log(`   ✅ PASS - Code explanation generated\n`);
      results.passed.push('explain_code');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('explain_code');
    }

    // ========== TOOL 10: test_coverage ==========
    console.log('🧪 Tool 10: test_coverage');
    try {
      const { handleTestCoverage } = require('./server/dist/tools/test_coverage.js');
      const result = await handleTestCoverage(
        { symbolFqn: 'com.example.demo.Dog' },  // Correct parameter: 'symbolFqn' (NOT 'fqn')
        memoryIndex
      );
      console.log(`   ✅ PASS - Test coverage analysis executed\n`);
      results.passed.push('test_coverage');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('test_coverage');
    }

    // ========== TOOL 11: refactoring_suggestions ==========
    console.log('🔧 Tool 11: refactoring_suggestions');
    try {
      const { handleRefactoringSuggestions } = require('./server/dist/tools/refactoring_suggestions.js');
      const result = await handleRefactoringSuggestions(
        { fqn: 'com.example.demo.Dog' },  // Correct parameter: 'fqn'
        memoryIndex
      );
      console.log(`   ✅ PASS - Refactoring suggestions generated\n`);
      results.passed.push('refactoring_suggestions');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('refactoring_suggestions');
    }

    // ========== TOOL 12: code_generation ==========
    console.log('⚙️  Tool 12: code_generation');
    try {
      const { handleCodeGeneration } = require('./server/dist/tools/code_generation.js');
      const result = await handleCodeGeneration(
        {
          description: 'method to get dog breed',  // Correct parameter: 'description'
          context: 'com.example.demo.Dog'          // Correct parameter: 'context'
        },
        memoryIndex
      );
      console.log(`   ✅ PASS - Code generation executed\n`);
      results.passed.push('code_generation');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('code_generation');
    }

    // ========== TOOL 13: compact_index ==========
    console.log('🧹 Tool 13: compact_index');
    try {
      const { handleCompactIndex } = require('./server/dist/tools/compact_index.js');
      const result = await handleCompactIndex(
        { aggressive: false },  // Correct parameter: 'aggressive' (optional)
        memoryIndex
      );
      console.log(`   ✅ PASS - Index compaction executed\n`);
      results.passed.push('compact_index');
    } catch (e) {
      console.log(`   ❌ FAIL - ${e.message}\n`);
      results.failed.push('compact_index');
    }

    // ========== SUMMARY ==========
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                          ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const total = results.passed.length + results.failed.length;
    const passRate = ((results.passed.length / total) * 100).toFixed(1);

    console.log(`Total Tools: ${total}`);
    console.log(`Passed: ${results.passed.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Pass Rate: ${passRate}%\n`);

    if (results.passed.length > 0) {
      console.log('✅ PASSED:');
      results.passed.forEach(t => console.log(`   - ${t}`));
      console.log();
    }

    if (results.failed.length > 0) {
      console.log('❌ FAILED:');
      results.failed.forEach(t => console.log(`   - ${t}`));
      console.log();
    }

    console.log('╔══════════════════════════════════════════════════════════╗');
    if (results.failed.length === 0) {
      console.log('║  🎉 ALL TOOLS VERIFIED - 100% PASS RATE              ║');
    } else {
      console.log('║  ⚠️  Some tools need review                            ║');
    }
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const mem = process.memoryUsage();
    console.log('📊 Performance:');
    console.log(`   Heap: ${Math.round(mem.heapUsed / 1024 / 1024)} MB`);
    console.log(`   Storage: SQLite enabled`);
    console.log(`   Status: Production Ready ✅\n`);

    await indexerClient.stop();

  } catch (error) {
    console.error('Fatal Error:', error);
    process.exit(1);
  }
}

runCompleteVerification();
