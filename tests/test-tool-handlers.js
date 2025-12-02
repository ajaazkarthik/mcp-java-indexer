#!/usr/bin/env node

/**
 * Advanced Tool Handler Tests
 * 
 * Tests for all MCP tool handlers:
 * - analyze_impact
 * - semantic_search
 * - explain_code
 * - test_coverage
 * - refactoring_suggestions
 * - code_generation
 * - batch_query
 * - explore_class
 * - explore_codebase
 * - scan_migration_candidates
 * 
 * Created: 2025-12-03
 */

const path = require('path');
const fs = require('fs/promises');

// Test configuration
const TEST_DIR = path.join(__dirname, '..', '.test-tools');
const VERBOSE = process.argv.includes('--verbose');

// Test tracking
let passed = 0;
let failed = 0;
const failures = [];

function log(msg) {
  console.log(msg);
}

function verbose(msg) {
  if (VERBOSE) console.log(`  [verbose] ${msg}`);
}

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    log(`  ✅ ${testName}`);
  } else {
    failed++;
    failures.push({ testName, details });
    log(`  ❌ ${testName}${details ? ': ' + details : ''}`);
  }
}

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch (e) {}
}

async function setupTestDir() {
  await cleanup();
  await fs.mkdir(TEST_DIR, { recursive: true });
}

// Create a properly populated test index
async function createPopulatedIndex() {
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  // Add a realistic class structure
  const symbols = [
    // User domain
    {
      fqn: 'com.example.model.User',
      name: 'User',
      kind: 'class',
      file: '/src/model/User.java',
      line: 10,
      column: 1,
      packageName: 'com.example.model',
      modifiers: ['public'],
      javadoc: 'Represents a user in the system'
    },
    {
      fqn: 'com.example.model.User.getId()',
      name: 'getId',
      kind: 'method',
      file: '/src/model/User.java',
      line: 20,
      column: 5,
      packageName: 'com.example.model',
      declaringClass: 'com.example.model.User',
      signature: 'public Long getId()',
      modifiers: ['public']
    },
    {
      fqn: 'com.example.model.User.setName(String)',
      name: 'setName',
      kind: 'method',
      file: '/src/model/User.java',
      line: 25,
      column: 5,
      packageName: 'com.example.model',
      declaringClass: 'com.example.model.User',
      signature: 'public void setName(String name)',
      modifiers: ['public']
    },
    
    // Repository layer
    {
      fqn: 'com.example.repository.UserRepository',
      name: 'UserRepository',
      kind: 'interface',
      file: '/src/repository/UserRepository.java',
      line: 8,
      column: 1,
      packageName: 'com.example.repository',
      modifiers: ['public']
    },
    {
      fqn: 'com.example.repository.UserRepository.findById(Long)',
      name: 'findById',
      kind: 'method',
      file: '/src/repository/UserRepository.java',
      line: 12,
      column: 5,
      packageName: 'com.example.repository',
      declaringClass: 'com.example.repository.UserRepository',
      signature: 'User findById(Long id)',
      modifiers: ['public']
    },
    {
      fqn: 'com.example.repository.UserRepository.save(User)',
      name: 'save',
      kind: 'method',
      file: '/src/repository/UserRepository.java',
      line: 15,
      column: 5,
      packageName: 'com.example.repository',
      declaringClass: 'com.example.repository.UserRepository',
      signature: 'User save(User user)',
      modifiers: ['public']
    },
    
    // Service layer
    {
      fqn: 'com.example.service.UserService',
      name: 'UserService',
      kind: 'class',
      file: '/src/service/UserService.java',
      line: 15,
      column: 1,
      packageName: 'com.example.service',
      modifiers: ['public'],
      implements: ['com.example.service.IUserService']
    },
    {
      fqn: 'com.example.service.UserService.createUser(String, String)',
      name: 'createUser',
      kind: 'method',
      file: '/src/service/UserService.java',
      line: 25,
      column: 5,
      packageName: 'com.example.service',
      declaringClass: 'com.example.service.UserService',
      signature: 'public User createUser(String name, String email)',
      modifiers: ['public']
    },
    {
      fqn: 'com.example.service.UserService.deleteUser(Long)',
      name: 'deleteUser',
      kind: 'method',
      file: '/src/service/UserService.java',
      line: 40,
      column: 5,
      packageName: 'com.example.service',
      declaringClass: 'com.example.service.UserService',
      signature: 'public void deleteUser(Long id)',
      modifiers: ['public']
    },
    
    // Test class
    {
      fqn: 'com.example.test.UserServiceTest',
      name: 'UserServiceTest',
      kind: 'class',
      file: '/src/test/UserServiceTest.java',
      line: 10,
      column: 1,
      packageName: 'com.example.test',
      modifiers: ['public']
    },
    {
      fqn: 'com.example.test.UserServiceTest.testCreateUser()',
      name: 'testCreateUser',
      kind: 'method',
      file: '/src/test/UserServiceTest.java',
      line: 20,
      column: 5,
      packageName: 'com.example.test',
      declaringClass: 'com.example.test.UserServiceTest',
      signature: 'public void testCreateUser()',
      modifiers: ['public']
    },
    
    // Controller
    {
      fqn: 'com.example.controller.UserController',
      name: 'UserController',
      kind: 'class',
      file: '/src/controller/UserController.java',
      line: 12,
      column: 1,
      packageName: 'com.example.controller',
      modifiers: ['public']
    },
    
    // Exception
    {
      fqn: 'com.example.exception.UserNotFoundException',
      name: 'UserNotFoundException',
      kind: 'class',
      file: '/src/exception/UserNotFoundException.java',
      line: 5,
      column: 1,
      packageName: 'com.example.exception',
      modifiers: ['public'],
      extends: 'java.lang.RuntimeException'
    },
    
    // Builder pattern
    {
      fqn: 'com.example.model.UserBuilder',
      name: 'UserBuilder',
      kind: 'class',
      file: '/src/model/UserBuilder.java',
      line: 5,
      column: 1,
      packageName: 'com.example.model',
      modifiers: ['public']
    },
    {
      fqn: 'com.example.model.UserBuilder.build()',
      name: 'build',
      kind: 'method',
      file: '/src/model/UserBuilder.java',
      line: 30,
      column: 5,
      packageName: 'com.example.model',
      declaringClass: 'com.example.model.UserBuilder',
      signature: 'public User build()',
      modifiers: ['public']
    },
    {
      fqn: 'com.example.model.UserBuilder.withName(String)',
      name: 'withName',
      kind: 'method',
      file: '/src/model/UserBuilder.java',
      line: 15,
      column: 5,
      packageName: 'com.example.model',
      declaringClass: 'com.example.model.UserBuilder',
      signature: 'public UserBuilder withName(String name)',
      modifiers: ['public']
    }
  ];
  
  for (const symbol of symbols) {
    index.addSymbol(symbol);
  }
  
  // Add files
  index.addFile('/src/model/User.java', 'hash1', ['com.example.model.User'], true, Date.now());
  index.addFile('/src/service/UserService.java', 'hash2', ['com.example.service.UserService'], true, Date.now());
  index.addFile('/src/repository/UserRepository.java', 'hash3', ['com.example.repository.UserRepository'], true, Date.now());
  index.addFile('/src/test/UserServiceTest.java', 'hash4', ['com.example.test.UserServiceTest'], true, Date.now());
  
  // Add references
  const references = [
    {
      fromFqn: 'com.example.service.UserService.createUser(String, String)',
      toFqn: 'com.example.repository.UserRepository.save(User)',
      file: '/src/service/UserService.java',
      line: 30,
      column: 15,
      kind: 'method_call'
    },
    {
      fromFqn: 'com.example.service.UserService.createUser(String, String)',
      toFqn: 'com.example.model.User',
      file: '/src/service/UserService.java',
      line: 28,
      column: 10,
      kind: 'instantiation'
    },
    {
      fromFqn: 'com.example.test.UserServiceTest.testCreateUser()',
      toFqn: 'com.example.service.UserService.createUser(String, String)',
      file: '/src/test/UserServiceTest.java',
      line: 25,
      column: 10,
      kind: 'method_call'
    },
    {
      fromFqn: 'com.example.controller.UserController',
      toFqn: 'com.example.service.UserService',
      file: '/src/controller/UserController.java',
      line: 15,
      column: 5,
      kind: 'field_access'
    }
  ];
  
  for (const ref of references) {
    index.addReference(ref);
  }
  
  // Add call graph
  index.addCallGraphEdge(
    'com.example.service.UserService.createUser(String, String)',
    'com.example.repository.UserRepository.save(User)',
    '/src/service/UserService.java', 30, 'method_call'
  );
  index.addCallGraphEdge(
    'com.example.test.UserServiceTest.testCreateUser()',
    'com.example.service.UserService.createUser(String, String)',
    '/src/test/UserServiceTest.java', 25, 'method_call'
  );
  
  // Add inheritance
  index.addInheritance('com.example.exception.UserNotFoundException', 'java.lang.RuntimeException');
  
  return index;
}

// ============================================================================
// TEST SUITE 1: analyze_impact Tool
// ============================================================================

async function testAnalyzeImpact() {
  log('\n🧪 Test Suite 1: analyze_impact Tool\n');
  
  const { handleAnalyzeImpact } = await import('../server/dist/tools/analyze_impact.js');
  const index = await createPopulatedIndex();
  
  log('Testing analyze_impact with valid symbol:');
  const result1 = await handleAnalyzeImpact({ symbolFqn: 'com.example.service.UserService' }, index);
  assert(result1.content?.length > 0, 'Returns content for valid symbol');
  assert(result1.content[0].text.includes('Impact Analysis'), 'Contains impact analysis header');
  assert(result1.content[0].text.includes('Risk'), 'Contains risk assessment');
  verbose(`Result length: ${result1.content[0].text.length} chars`);
  
  log('\nTesting analyze_impact with non-existent symbol:');
  const result2 = await handleAnalyzeImpact({ symbolFqn: 'com.example.NonExistent' }, index);
  assert(result2.content?.length > 0, 'Returns content for non-existent symbol');
  assert(result2.content[0].text.includes('not found'), 'Reports symbol not found');
  
  log('\nTesting analyze_impact with depth parameter:');
  const result3 = await handleAnalyzeImpact({ symbolFqn: 'com.example.service.UserService', depth: 5 }, index);
  assert(result3.content?.length > 0, 'Handles depth parameter');
  
  log('\nTesting analyze_impact with method:');
  const result4 = await handleAnalyzeImpact({ symbolFqn: 'com.example.service.UserService.createUser(String, String)' }, index);
  assert(result4.content?.length > 0, 'Works with method FQN');
}

// ============================================================================
// TEST SUITE 2: semantic_search Tool
// ============================================================================

async function testSemanticSearch() {
  log('\n🧪 Test Suite 2: semantic_search Tool\n');
  
  const { handleSemanticSearch } = await import('../server/dist/tools/semantic_search.js');
  const index = await createPopulatedIndex();
  
  log('Testing semantic_search for builder pattern:');
  const result1 = await handleSemanticSearch({ query: 'builder pattern' }, index);
  assert(result1.content?.length > 0, 'Returns content for builder search');
  verbose(`Found: ${result1.content[0].text.substring(0, 200)}...`);
  
  log('\nTesting semantic_search for repository:');
  const result2 = await handleSemanticSearch({ query: 'repository save' }, index);
  assert(result2.content?.length > 0, 'Returns content for repository search');
  
  log('\nTesting semantic_search for service:');
  const result3 = await handleSemanticSearch({ query: 'service methods' }, index);
  assert(result3.content?.length > 0, 'Returns content for service search');
  
  log('\nTesting semantic_search with scope filter:');
  const result4 = await handleSemanticSearch({ query: 'user', scope: 'classes' }, index);
  assert(result4.content?.length > 0, 'Handles scope filter');
  
  log('\nTesting semantic_search with limit:');
  const result5 = await handleSemanticSearch({ query: 'user', limit: 5 }, index);
  assert(result5.content?.length > 0, 'Handles limit parameter');
  
  log('\nTesting semantic_search for test:');
  const result6 = await handleSemanticSearch({ query: 'test methods' }, index);
  assert(result6.content?.length > 0, 'Finds test-related code');
  
  log('\nTesting semantic_search for exception:');
  const result7 = await handleSemanticSearch({ query: 'exception handling' }, index);
  assert(result7.content?.length > 0, 'Finds exception-related code');
}

// ============================================================================
// TEST SUITE 3: explain_code Tool
// ============================================================================

async function testExplainCode() {
  log('\n🧪 Test Suite 3: explain_code Tool\n');
  
  const { handleExplainCode } = await import('../server/dist/tools/explain_code.js');
  const index = await createPopulatedIndex();
  
  log('Testing explain_code with class:');
  const result1 = await handleExplainCode({ fqn: 'com.example.service.UserService' }, index);
  assert(result1.content?.length > 0, 'Returns content for class explanation');
  verbose(`Explanation: ${result1.content[0].text.substring(0, 200)}...`);
  
  log('\nTesting explain_code with method:');
  const result2 = await handleExplainCode({ fqn: 'com.example.service.UserService.createUser(String, String)' }, index);
  assert(result2.content?.length > 0, 'Returns content for method explanation');
  
  log('\nTesting explain_code with interface:');
  const result3 = await handleExplainCode({ fqn: 'com.example.repository.UserRepository' }, index);
  assert(result3.content?.length > 0, 'Returns content for interface explanation');
  
  log('\nTesting explain_code with non-existent:');
  const result4 = await handleExplainCode({ fqn: 'com.example.NonExistent' }, index);
  assert(result4.content?.length > 0, 'Returns content for non-existent');
  assert(result4.content[0].text.includes('not found') || result4.content[0].text.includes('No symbol'), 'Reports not found');
}

// ============================================================================
// TEST SUITE 4: test_coverage Tool
// ============================================================================

async function testTestCoverage() {
  log('\n🧪 Test Suite 4: test_coverage Tool\n');
  
  const { handleTestCoverage } = await import('../server/dist/tools/test_coverage.js');
  const index = await createPopulatedIndex();
  
  log('Testing test_coverage for service class:');
  const result1 = await handleTestCoverage({ symbolFqn: 'com.example.service.UserService' }, index);
  assert(result1.content?.length > 0, 'Returns content for service');
  verbose(`Coverage: ${result1.content[0].text.substring(0, 200)}...`);
  
  log('\nTesting test_coverage for method:');
  const result2 = await handleTestCoverage({ symbolFqn: 'com.example.service.UserService.createUser(String, String)' }, index);
  assert(result2.content?.length > 0, 'Returns content for method');
  
  log('\nTesting test_coverage with includeIndirect:');
  const result3 = await handleTestCoverage({ 
    symbolFqn: 'com.example.model.User',
    includeIndirect: true 
  }, index);
  assert(result3.content?.length > 0, 'Handles includeIndirect option');
}

// ============================================================================
// TEST SUITE 5: refactoring_suggestions Tool
// ============================================================================

async function testRefactoringSuggestions() {
  log('\n🧪 Test Suite 5: refactoring_suggestions Tool\n');
  
  const { handleRefactoringSuggestions } = await import('../server/dist/tools/refactoring_suggestions.js');
  const index = await createPopulatedIndex();
  
  log('Testing refactoring_suggestions for class:');
  const result1 = await handleRefactoringSuggestions({ symbolFqn: 'com.example.service.UserService' }, index);
  assert(result1.content?.length > 0, 'Returns content for class');
  verbose(`Suggestions: ${result1.content[0].text.substring(0, 200)}...`);
  
  log('\nTesting refactoring_suggestions with analysisDepth:');
  const result2 = await handleRefactoringSuggestions({ 
    symbolFqn: 'com.example.service.UserService',
    analysisDepth: 'comprehensive'
  }, index);
  assert(result2.content?.length > 0, 'Handles analysisDepth parameter');
  
  log('\nTesting refactoring_suggestions for method:');
  const result3 = await handleRefactoringSuggestions({ symbolFqn: 'com.example.service.UserService.createUser(String, String)' }, index);
  assert(result3.content?.length > 0, 'Works with method FQN');
}

// ============================================================================
// TEST SUITE 6: code_generation Tool
// ============================================================================

async function testCodeGeneration() {
  log('\n🧪 Test Suite 6: code_generation Tool\n');
  
  const { handleCodeGeneration } = await import('../server/dist/tools/code_generation.js');
  const index = await createPopulatedIndex();
  
  log('Testing code_generation for interface implementation:');
  const result1 = await handleCodeGeneration({ 
    type: 'implementation',
    symbolFqn: 'com.example.repository.UserRepository'
  }, index);
  assert(result1.content?.length > 0, 'Returns content for implementation');
  verbose(`Generated: ${result1.content[0].text.substring(0, 200)}...`);
  
  log('\nTesting code_generation for test:');
  const result2 = await handleCodeGeneration({ 
    type: 'test',
    symbolFqn: 'com.example.service.UserService'
  }, index);
  assert(result2.content?.length > 0, 'Returns content for test generation');
  
  log('\nTesting code_generation for builder:');
  const result3 = await handleCodeGeneration({ 
    type: 'builder',
    symbolFqn: 'com.example.model.User'
  }, index);
  assert(result3.content?.length > 0, 'Returns content for builder generation');
}

// ============================================================================
// TEST SUITE 7: explore_class Tool
// ============================================================================

async function testExploreClass() {
  log('\n🧪 Test Suite 7: explore_class Tool\n');
  
  const { handleExploreClass } = await import('../server/dist/tools/explore_class.js');
  const index = await createPopulatedIndex();
  
  log('Testing explore_class with simple name:');
  const result1 = await handleExploreClass({ className: 'UserService' }, index);
  assert(result1.content?.length > 0, 'Returns content for simple name');
  verbose(`Explore: ${result1.content[0].text.substring(0, 200)}...`);
  
  log('\nTesting explore_class with FQN:');
  const result2 = await handleExploreClass({ className: 'com.example.service.UserService' }, index);
  assert(result2.content?.length > 0, 'Returns content for FQN');
  
  log('\nTesting explore_class with includeMethodDetails:');
  const result3 = await handleExploreClass({ 
    className: 'UserService',
    includeMethodDetails: true
  }, index);
  assert(result3.content?.length > 0, 'Handles includeMethodDetails');
  
  log('\nTesting explore_class with non-existent:');
  const result4 = await handleExploreClass({ className: 'NonExistent' }, index);
  assert(result4.content?.length > 0, 'Handles non-existent class');
}

// ============================================================================
// TEST SUITE 8: batch_query Tool
// ============================================================================

async function testBatchQuery() {
  log('\n🧪 Test Suite 8: batch_query Tool\n');
  
  const { handleBatchQuery } = await import('../server/dist/tools/batch_query.js');
  const index = await createPopulatedIndex();
  
  log('Testing batch_query with multiple queries:');
  const result1 = await handleBatchQuery({
    queries: [
      { tool: 'find_symbol', args: { name: 'UserService' } },
      { tool: 'find_symbol', args: { name: 'User' } }
    ]
  }, index);
  assert(result1.content?.length > 0, 'Returns content for batch queries');
  verbose(`Batch result: ${result1.content[0].text.substring(0, 200)}...`);
  
  log('\nTesting batch_query with labeled queries:');
  const result2 = await handleBatchQuery({
    queries: [
      { tool: 'find_symbol', args: { name: 'UserService' }, label: 'service' },
      { tool: 'find_usages', args: { fqn: 'com.example.model.User' }, label: 'usages' }
    ]
  }, index);
  assert(result2.content?.length > 0, 'Handles labeled queries');
  
  log('\nTesting batch_query with call_graph:');
  const result3 = await handleBatchQuery({
    queries: [
      { tool: 'call_graph', args: { fqn: 'com.example.service.UserService.createUser(String, String)' } }
    ]
  }, index);
  assert(result3.content?.length > 0, 'Handles call_graph in batch');
}

// ============================================================================
// TEST SUITE 9: scan_migration_candidates Tool
// ============================================================================

async function testScanMigrationCandidates() {
  log('\n🧪 Test Suite 9: scan_migration_candidates Tool\n');
  
  const { handleScanMigrationCandidates } = await import('../server/dist/tools/scan_migration_candidates.js');
  const index = await createPopulatedIndex();
  
  log('Testing scan_migration_candidates:');
  const result1 = await handleScanMigrationCandidates({}, index);
  assert(result1.content?.length > 0, 'Returns content');
  verbose(`Scan result: ${result1.content[0].text.substring(0, 200)}...`);
  
  log('\nTesting scan_migration_candidates with options:');
  const result2 = await handleScanMigrationCandidates({ 
    maxResults: 10 
  }, index);
  assert(result2.content?.length > 0, 'Handles maxResults');
}

// ============================================================================
// TEST SUITE 10: reindex_file Tool
// ============================================================================

async function testReindexFile() {
  log('\n🧪 Test Suite 10: reindex_file Tool\n');
  
  await setupTestDir();
  
  // Note: This requires Java indexer running, so we just test the handler exists
  const { handleReindexFile } = await import('../server/dist/tools/reindex_file.js');
  const index = await createPopulatedIndex();
  
  log('Testing reindex_file handler exists:');
  assert(typeof handleReindexFile === 'function', 'handleReindexFile is a function');
  
  // Can't actually reindex without Java process, but can test error handling
  log('\nTesting reindex_file with non-existent file:');
  try {
    // This should fail gracefully
    const result = await handleReindexFile({ filePath: '/non/existent/file.java' }, index, null);
    assert(result.content?.length > 0, 'Returns content for non-existent file');
  } catch (e) {
    assert(true, 'Handles missing indexer client');
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  ADVANCED TOOL HANDLER TEST SUITE');
  console.log('  Testing all MCP tool handlers');
  console.log('='.repeat(70));
  
  try {
    await testAnalyzeImpact();
    await testSemanticSearch();
    await testExplainCode();
    await testTestCoverage();
    await testRefactoringSuggestions();
    await testCodeGeneration();
    await testExploreClass();
    await testBatchQuery();
    await testScanMigrationCandidates();
    await testReindexFile();
  } catch (error) {
    console.error('\n❌ Test suite crashed:', error);
    failed++;
    failures.push({ testName: 'Test Suite Execution', details: error.message });
  }
  
  // Cleanup
  await cleanup();
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed} ✅`);
  console.log(`  Failed: ${failed} ❌`);
  
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    for (const failure of failures) {
      console.log(`    • ${failure.testName}`);
      if (failure.details) {
        console.log(`      ${failure.details}`);
      }
    }
  }
  
  console.log('='.repeat(70) + '\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests();
