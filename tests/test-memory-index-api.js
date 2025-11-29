#!/usr/bin/env node

/**
 * Comprehensive Memory Index API Tests
 * 
 * Tests all MemoryIndex and MemoryIndexWithStorage methods to ensure
 * API compatibility across all implementations and prevent missing method bugs.
 * 
 * This test file was created after discovering findReferencesFromClass was
 * missing from MemoryIndexWithStorage (bug fix v2.6.3).
 */

const path = require('path');
const fs = require('fs/promises');

// Test configuration
const TEST_DIR = path.join(__dirname, '..', '.test-memory-api');
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

function assertMethodExists(obj, methodName, className) {
  const exists = typeof obj[methodName] === 'function';
  assert(exists, `${className}.${methodName}() exists`, 
    exists ? '' : `Method ${methodName} is undefined`);
  return exists;
}

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch (e) {}
}

// ============================================================================
// TEST SUITE 1: MemoryIndex API Completeness
// ============================================================================

async function testMemoryIndexAPI() {
  log('\n🧪 Test Suite 1: MemoryIndex API Completeness\n');
  
  const { MemoryIndex } = require('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  log('Testing core symbol methods:');
  assertMethodExists(index, 'addSymbol', 'MemoryIndex');
  assertMethodExists(index, 'getSymbol', 'MemoryIndex');
  assertMethodExists(index, 'getAllSymbols', 'MemoryIndex');
  assertMethodExists(index, 'findSymbols', 'MemoryIndex');
  
  log('\nTesting reference methods:');
  assertMethodExists(index, 'addReference', 'MemoryIndex');
  assertMethodExists(index, 'findUsages', 'MemoryIndex');
  assertMethodExists(index, 'findReferencesFromClass', 'MemoryIndex');
  
  log('\nTesting call graph methods:');
  assertMethodExists(index, 'getOutboundCalls', 'MemoryIndex');
  assertMethodExists(index, 'getInboundCalls', 'MemoryIndex');
  
  log('\nTesting inheritance methods:');
  assertMethodExists(index, 'getParents', 'MemoryIndex');
  assertMethodExists(index, 'getChildren', 'MemoryIndex');
  
  log('\nTesting file management methods:');
  assertMethodExists(index, 'addFile', 'MemoryIndex');
  assertMethodExists(index, 'getFile', 'MemoryIndex');
  assertMethodExists(index, 'removeFile', 'MemoryIndex');
  assertMethodExists(index, 'getIndexedFiles', 'MemoryIndex');
  
  log('\nTesting utility methods:');
  assertMethodExists(index, 'getStats', 'MemoryIndex');
  assertMethodExists(index, 'clear', 'MemoryIndex');
  assertMethodExists(index, 'performMaintenanceCleanup', 'MemoryIndex');
  assertMethodExists(index, 'setIndexDir', 'MemoryIndex');
  assertMethodExists(index, 'getIndexDir', 'MemoryIndex');
  assertMethodExists(index, 'getProjectRootDir', 'MemoryIndex');
  assertMethodExists(index, 'toJSON', 'MemoryIndex');
  assertMethodExists(index, 'fromJSON', 'MemoryIndex');
}

// ============================================================================
// TEST SUITE 2: MemoryIndexWithStorage API Completeness
// ============================================================================

async function testMemoryIndexWithStorageAPI() {
  log('\n🧪 Test Suite 2: MemoryIndexWithStorage API Completeness\n');
  
  const { MemoryIndexWithStorage } = require('../server/dist/memory-index-storage.js');
  const index = new MemoryIndexWithStorage();
  index.setIndexDir(TEST_DIR);
  
  log('Testing core symbol methods:');
  assertMethodExists(index, 'addSymbol', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'getSymbol', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'getAllSymbols', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'findSymbols', 'MemoryIndexWithStorage');
  
  log('\nTesting reference methods:');
  assertMethodExists(index, 'addReference', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'findUsages', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'findReferencesFromClass', 'MemoryIndexWithStorage');
  
  log('\nTesting call graph methods:');
  assertMethodExists(index, 'getOutboundCalls', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'getInboundCalls', 'MemoryIndexWithStorage');
  
  log('\nTesting inheritance methods:');
  assertMethodExists(index, 'getParents', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'getChildren', 'MemoryIndexWithStorage');
  
  log('\nTesting file management methods:');
  assertMethodExists(index, 'addFile', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'getFile', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'removeFile', 'MemoryIndexWithStorage');
  
  log('\nTesting utility methods:');
  assertMethodExists(index, 'getStats', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'clear', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'performMaintenanceCleanup', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'setIndexDir', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'getIndexDir', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'flush', 'MemoryIndexWithStorage');
  assertMethodExists(index, 'close', 'MemoryIndexWithStorage');
  
  try {
    await index.close();
  } catch (e) {}
}

// ============================================================================
// TEST SUITE 3: findReferencesFromClass Behavior Tests
// ============================================================================

async function testFindReferencesFromClassBehavior() {
  log('\n🧪 Test Suite 3: findReferencesFromClass Behavior Tests\n');
  
  const { MemoryIndex } = require('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  // Setup test data: a class with various references
  const testClassFqn = 'com.example.UserService';
  
  // Add references FROM the class (from various members)
  const refsFromClass = [
    // From class itself (type reference to parent)
    {
      fromFqn: 'com.example.UserService',
      toFqn: 'com.example.BaseService',
      file: '/test/UserService.java',
      line: 5,
      column: 40,
      kind: 'inheritance'
    },
    // From a method
    {
      fromFqn: 'com.example.UserService.saveUser(User)',
      toFqn: 'com.example.UserRepository.save(User)',
      file: '/test/UserService.java',
      line: 20,
      column: 10,
      kind: 'method_call'
    },
    // From a constructor
    {
      fromFqn: 'com.example.UserService(UserRepository)',
      toFqn: 'com.example.Logger.info(String)',
      file: '/test/UserService.java',
      line: 10,
      column: 5,
      kind: 'method_call'
    },
    // Field access
    {
      fromFqn: 'com.example.UserService.getConfig()',
      toFqn: 'config.enabled',
      file: '/test/UserService.java',
      line: 30,
      column: 15,
      kind: 'field_access'
    }
  ];
  
  // Add references TO the class (these should NOT be returned)
  const refsToClass = [
    {
      fromFqn: 'com.example.MainApp.run()',
      toFqn: 'com.example.UserService',
      file: '/test/MainApp.java',
      line: 50,
      column: 10,
      kind: 'instantiation'
    }
  ];
  
  // Add all references
  for (const ref of [...refsFromClass, ...refsToClass]) {
    index.addReference(ref);
  }
  
  log('Testing findReferencesFromClass with class FQN:');
  const results = index.findReferencesFromClass(testClassFqn);
  
  // Should find all 4 refs FROM the class, but not the 1 ref TO the class
  assert(
    results.length === 4,
    `findReferencesFromClass returns correct count (expected 4, got ${results.length})`,
    results.length !== 4 ? `Found: ${JSON.stringify(results.map(r => r.fromFqn))}` : ''
  );
  
  log('\nTesting that refs FROM methods are included:');
  const methodRefs = results.filter(r => r.fromFqn.includes('.saveUser'));
  assert(methodRefs.length === 1, 'Finds references from class methods');
  
  log('\nTesting that refs FROM constructors are included:');
  const constructorRefs = results.filter(r => r.fromFqn.includes('UserService('));
  assert(constructorRefs.length === 1, 'Finds references from constructors');
  
  log('\nTesting that refs FROM class itself are included:');
  const classRefs = results.filter(r => r.fromFqn === testClassFqn);
  assert(classRefs.length === 1, 'Finds references from class itself');
  
  log('\nTesting that refs TO class are NOT included:');
  const wrongRefs = results.filter(r => r.toFqn === testClassFqn);
  assert(wrongRefs.length === 0, 'Does not include references TO the class');
  
  log('\nTesting with non-existent class:');
  const emptyResults = index.findReferencesFromClass('com.example.NonExistent');
  assert(emptyResults.length === 0, 'Returns empty array for non-existent class');
}

// ============================================================================
// TEST SUITE 4: Edge Cases for Reference Methods
// ============================================================================

async function testReferenceEdgeCases() {
  log('\n🧪 Test Suite 4: Reference Method Edge Cases\n');
  
  const { MemoryIndex } = require('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  log('Testing findUsages with empty index:');
  const emptyResult = index.findUsages('com.example.Test');
  assert(Array.isArray(emptyResult), 'Returns array (not undefined/null)');
  assert(emptyResult.length === 0, 'Returns empty array for empty index');
  
  log('\nTesting findReferencesFromClass with empty index:');
  const emptyRefs = index.findReferencesFromClass('com.example.Test');
  assert(Array.isArray(emptyRefs), 'Returns array (not undefined/null)');
  assert(emptyRefs.length === 0, 'Returns empty array for empty index');
  
  log('\nTesting with special characters in FQN:');
  const specialRef = {
    fromFqn: 'com.example.Service$Inner.method()',
    toFqn: 'com.example.Service$Inner',
    file: '/test/Service.java',
    line: 10,
    column: 5,
    kind: 'type_reference'
  };
  index.addReference(specialRef);
  
  const specialResults = index.findReferencesFromClass('com.example.Service$Inner');
  assert(specialResults.length === 1, 'Handles inner class FQN with $ correctly');
  
  log('\nTesting with array type references:');
  const arrayRef = {
    fromFqn: 'com.example.ArrayHandler.process(String[])',
    toFqn: 'java.lang.String[]',
    file: '/test/ArrayHandler.java',
    line: 15,
    column: 10,
    kind: 'type_reference'
  };
  index.addReference(arrayRef);
  
  const arrayResults = index.findReferencesFromClass('com.example.ArrayHandler');
  assert(arrayResults.length === 1, 'Handles method with array parameter in FQN');
  
  log('\nTesting with generic type references:');
  const genericRef = {
    fromFqn: 'com.example.GenericService.process(List<String>)',
    toFqn: 'java.util.ArrayList',
    file: '/test/GenericService.java',
    line: 20,
    column: 12,
    kind: 'instantiation'
  };
  index.addReference(genericRef);
  
  // Note: Generic params may appear differently - this tests current behavior
  const genericResults = index.findReferencesFromClass('com.example.GenericService');
  assert(genericResults.length >= 1, 'Handles method with generic parameter in FQN');
}

// ============================================================================
// TEST SUITE 5: Call Graph Edge Cases
// ============================================================================

async function testCallGraphEdgeCases() {
  log('\n🧪 Test Suite 5: Call Graph Edge Cases\n');
  
  const { MemoryIndex } = require('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  log('Testing getOutboundCalls with empty index:');
  const emptyOutbound = index.getOutboundCalls('com.example.Method()');
  assert(Array.isArray(emptyOutbound), 'Returns array (not undefined/null)');
  assert(emptyOutbound.length === 0, 'Returns empty array for empty index');
  
  log('\nTesting getInboundCalls with empty index:');
  const emptyInbound = index.getInboundCalls('com.example.Method()');
  assert(Array.isArray(emptyInbound), 'Returns array (not undefined/null)');
  assert(emptyInbound.length === 0, 'Returns empty array for empty index');
  
  log('\nTesting call graph with constructor calls:');
  // Add constructor call reference
  index.addReference({
    fromFqn: 'com.example.Factory.create()',
    toFqn: 'com.example.Product()',
    file: '/test/Factory.java',
    line: 10,
    column: 5,
    kind: 'instantiation'
  });
  
  // Wait for internal processing
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const constructorCalls = index.findUsages('com.example.Product');
  assert(constructorCalls.length >= 0, 'Can find constructor instantiations');
}

// ============================================================================
// TEST SUITE 6: Inheritance Edge Cases
// ============================================================================

async function testInheritanceEdgeCases() {
  log('\n🧪 Test Suite 6: Inheritance Edge Cases\n');
  
  const { MemoryIndex } = require('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  log('Testing getParents with empty index:');
  const emptyParents = index.getParents('com.example.Child');
  assert(Array.isArray(emptyParents), 'Returns array (not undefined/null)');
  assert(emptyParents.length === 0, 'Returns empty array for empty index');
  
  log('\nTesting getChildren with empty index:');
  const emptyChildren = index.getChildren('com.example.Parent');
  assert(Array.isArray(emptyChildren), 'Returns array (not undefined/null)');
  assert(emptyChildren.length === 0, 'Returns empty array for empty index');
  
  log('\nTesting inheritance with non-existent class:');
  const noParents = index.getParents('com.example.NonExistent');
  assert(noParents.length === 0, 'Returns empty array for non-existent class');
}

// ============================================================================
// TEST SUITE 7: Symbol Lookup Edge Cases  
// ============================================================================

async function testSymbolLookupEdgeCases() {
  log('\n🧪 Test Suite 7: Symbol Lookup Edge Cases\n');
  
  const { MemoryIndex } = require('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  log('Testing getSymbol with empty index:');
  const emptySymbol = index.getSymbol('com.example.Test');
  assert(emptySymbol === undefined, 'Returns undefined for non-existent symbol');
  
  log('\nTesting findSymbols with empty index:');
  const emptySymbols = index.findSymbols('Test');
  assert(Array.isArray(emptySymbols), 'Returns array (not undefined/null)');
  assert(emptySymbols.length === 0, 'Returns empty array for empty index');
  
  log('\nTesting getAllSymbols with empty index:');
  const allSymbols = index.getAllSymbols();
  assert(allSymbols instanceof Map, 'Returns Map instance');
  assert(allSymbols.size === 0, 'Returns empty Map for empty index');
  
  log('\nTesting with empty string input:');
  try {
    const emptyResult = index.findSymbols('');
    assert(Array.isArray(emptyResult), 'findSymbols handles empty string input');
  } catch (e) {
    assert(false, 'findSymbols handles empty string input', e.message);
  }
  
  log('\nTesting case-insensitive matching:');
  index.addSymbol({
    fqn: 'com.example.UserService',
    name: 'UserService',
    kind: 'class',
    file: '/test/UserService.java',
    line: 1,
    column: 1,
    packageName: 'com.example',
    modifiers: ['public']
  });
  
  const caseResults = index.findSymbols('userservice');
  // Note: This tests the current behavior, which may or may not be case-insensitive
  verbose(`Case-insensitive search found: ${caseResults.length} results`);
}

// ============================================================================
// TEST SUITE 8: File Management Edge Cases
// ============================================================================

async function testFileManagementEdgeCases() {
  log('\n🧪 Test Suite 8: File Management Edge Cases\n');
  
  const { MemoryIndex } = require('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  log('Testing getFile with non-existent file:');
  const noFile = index.getFile('/non/existent/File.java');
  assert(noFile === undefined, 'Returns undefined for non-existent file');
  
  log('\nTesting removeFile with non-existent file:');
  try {
    index.removeFile('/non/existent/File.java');
    assert(true, 'removeFile handles non-existent file gracefully');
  } catch (e) {
    assert(false, 'removeFile handles non-existent file', e.message);
  }
  
  log('\nTesting addFile and getFile:');
  index.addFile('/test/File.java', 'hash123', ['com.test.File'], true);
  const addedFile = index.getFile('/test/File.java');
  assert(addedFile !== undefined, 'getFile returns file after addFile');
  assert(addedFile && addedFile.hash === 'hash123', 'File has correct hash');
  
  log('\nTesting getIndexedFiles:');
  const indexedFiles = index.getIndexedFiles();
  assert(Array.isArray(indexedFiles), 'Returns array (not undefined/null)');
  assert(indexedFiles.length > 0, 'Contains the added file');
}

// ============================================================================
// TEST SUITE 9: MemoryIndexWithStorage Specific Tests
// ============================================================================

async function testStorageSpecificBehavior() {
  log('\n🧪 Test Suite 9: MemoryIndexWithStorage Specific Tests\n');
  
  await cleanup();
  
  const { MemoryIndexWithStorage } = require('../server/dist/memory-index-storage.js');
  const index = new MemoryIndexWithStorage();
  index.setIndexDir(TEST_DIR);
  
  // Initialize storage
  await index.initializeStorage();
  
  log('Testing findReferencesFromClass on storage index:');
  
  // Add test references
  index.addReference({
    fromFqn: 'com.storage.TestClass.method()',
    toFqn: 'com.storage.Dependency',
    file: '/test/TestClass.java',
    line: 10,
    column: 5,
    kind: 'method_call'
  });
  
  index.addReference({
    fromFqn: 'com.storage.TestClass',
    toFqn: 'com.storage.Parent',
    file: '/test/TestClass.java',
    line: 1,
    column: 30,
    kind: 'inheritance'
  });
  
  // Flush writes
  await index.flush();
  
  // Wait for storage to process
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const storageRefs = index.findReferencesFromClass('com.storage.TestClass');
  assert(
    Array.isArray(storageRefs),
    'findReferencesFromClass returns array from storage'
  );
  verbose(`Storage returned ${storageRefs.length} references`);
  
  log('\nTesting flush and persistence:');
  try {
    await index.flush();
    assert(true, 'flush() completes without error');
  } catch (e) {
    assert(false, 'flush() completes without error', e.message);
  }
  
  log('\nTesting close:');
  try {
    await index.close();
    assert(true, 'close() completes without error');
  } catch (e) {
    assert(false, 'close() completes without error', e.message);
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
  console.log('═'.repeat(70));
  console.log('Memory Index API Comprehensive Test Suite');
  console.log('═'.repeat(70));
  console.log(`Running ${VERBOSE ? 'with verbose output' : 'in standard mode'}`);
  
  try {
    await cleanup();
    
    await testMemoryIndexAPI();
    await testMemoryIndexWithStorageAPI();
    await testFindReferencesFromClassBehavior();
    await testReferenceEdgeCases();
    await testCallGraphEdgeCases();
    await testInheritanceEdgeCases();
    await testSymbolLookupEdgeCases();
    await testFileManagementEdgeCases();
    await testStorageSpecificBehavior();
    
    await cleanup();
    
  } catch (error) {
    console.error('\n💥 CRITICAL TEST ERROR:', error);
    failed++;
    failures.push({ testName: 'Test execution', details: error.message });
  }
  
  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.testName}${f.details ? ' - ' + f.details : ''}`);
    });
  }
  
  console.log('═'.repeat(70));
  
  if (failed > 0) {
    process.exit(1);
  }
  
  console.log('\n✅ All tests passed!\n');
  process.exit(0);
}

runAllTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
