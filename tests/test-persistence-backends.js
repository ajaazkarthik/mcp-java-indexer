#!/usr/bin/env node

/**
 * Storage and Serialization Tests
 * 
 * Tests for:
 * - MemoryIndex serialization (toJSON/fromJSON)
 * - Data integrity across serialization cycles
 * - Edge cases with special characters
 * - Performance with large datasets
 * 
 * Note: Storage backend is better-sqlite3 only (sql.js/file-shard disabled).
 * 
 * Created: 2025-12-03
 */

const path = require('path');
const fs = require('fs/promises');

// Test configuration
const TEST_DIR = path.join(__dirname, '..', '.test-serialization');
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

// Helper to create test index with various data types
async function createTestIndex() {
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  // Add symbols of different kinds
  const kinds = ['class', 'interface', 'method', 'field', 'enum', 'constructor'];
  for (let i = 0; i < 100; i++) {
    const kind = kinds[i % kinds.length];
    const packageName = `com.example.pkg${Math.floor(i / 10)}`;
    
    index.addSymbol({
      fqn: `${packageName}.Symbol${i}`,
      name: `Symbol${i}`,
      kind: kind,
      file: `/src/Symbol${i}.java`,
      line: i + 1,
      column: 1,
      packageName: packageName,
      modifiers: ['public'],
      javadoc: `Documentation for Symbol${i}`
    });
  }
  
  // Add files
  for (let i = 0; i < 50; i++) {
    index.addFile(
      `/src/File${i}.java`,
      `hash${i}`,
      [`com.example.pkg${i % 5}.Class${i}`],
      true,
      Date.now() - i * 1000
    );
  }
  
  // Add references
  for (let i = 0; i < 50; i++) {
    index.addReference({
      fromFqn: `com.example.pkg${i % 5}.Symbol${i}`,
      toFqn: `com.example.pkg${(i + 1) % 5}.Symbol${i + 1}`,
      file: `/src/File${i}.java`,
      line: i + 10,
      column: 5,
      kind: ['method_call', 'field_access', 'instantiation', 'type_ref'][i % 4]
    });
  }
  
  // Add call graph edges
  for (let i = 0; i < 30; i++) {
    index.addCallGraphEdge(
      `com.example.pkg${i % 3}.Method${i}`,
      `com.example.pkg${(i + 1) % 3}.Method${i + 1}`,
      `/src/File${i}.java`,
      i + 5,
      'method_call'
    );
  }
  
  // Add inheritance
  for (let i = 0; i < 20; i++) {
    index.addInheritance(
      `com.example.pkg${i % 4}.Child${i}`,
      `com.example.pkg${i % 4}.Parent${i % 5}`
    );
  }
  
  return index;
}

// ============================================================================
// TEST SUITE 1: MemoryIndex Serialization (toJSON/fromJSON)
// ============================================================================

async function testSerializationRoundtrip() {
  log('\n🧪 Test Suite 1: MemoryIndex Serialization Round-trip\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  const original = await createTestIndex();
  const originalStats = original.getStats();
  
  log('Testing toJSON:');
  const json = original.toJSON();
  assert(typeof json === 'object', 'toJSON returns object');
  assert(Array.isArray(json.symbols), 'JSON has symbols array');
  assert(Array.isArray(json.files), 'JSON has files array');
  assert(Array.isArray(json.references), 'JSON has references array');
  assert(Array.isArray(json.callGraph), 'JSON has callGraph array');
  assert(Array.isArray(json.inheritance), 'JSON has inheritance array');
  
  log('\nTesting fromJSON:');
  const restored = new MemoryIndex();
  restored.fromJSON(json);
  
  const restoredStats = restored.getStats();
  assert(restoredStats.symbols === originalStats.symbols, 
    `Symbol count preserved (${originalStats.symbols})`);
  assert(restoredStats.files === originalStats.files, 
    `File count preserved (${originalStats.files})`);
  
  log('\nTesting symbol data integrity:');
  const testSymbol = restored.getSymbol('com.example.pkg0.Symbol0');
  assert(testSymbol !== undefined, 'Can retrieve restored symbol');
  if (testSymbol) {
    assert(testSymbol.name === 'Symbol0', 'Symbol name preserved');
    assert(testSymbol.kind === 'class', 'Symbol kind preserved');
    assert(testSymbol.packageName === 'com.example.pkg0', 'Package name preserved');
    assert(testSymbol.javadoc === 'Documentation for Symbol0', 'Javadoc preserved');
  }
  
  log('\nTesting file data integrity:');
  const testFile = restored.getFile('/src/File0.java');
  assert(testFile !== undefined, 'Can retrieve restored file');
  if (testFile) {
    assert(testFile.hash === 'hash0', 'File hash preserved');
  }
}

// ============================================================================
// TEST SUITE 2: Reference Serialization
// ============================================================================

async function testReferenceSerialization() {
  log('\n🧪 Test Suite 2: Reference Serialization\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  const original = new MemoryIndex();
  
  // Add symbols
  original.addSymbol({ fqn: 'com.example.A', name: 'A', kind: 'class', file: '/A.java', line: 1 });
  original.addSymbol({ fqn: 'com.example.B', name: 'B', kind: 'class', file: '/B.java', line: 1 });
  
  // Add various reference types
  const refTypes = ['method_call', 'field_access', 'instantiation', 'type_ref', 'annotation'];
  for (let i = 0; i < refTypes.length; i++) {
    original.addReference({
      fromFqn: 'com.example.A',
      toFqn: 'com.example.B',
      file: '/A.java',
      line: 10 + i,
      column: 5,
      kind: refTypes[i]
    });
  }
  
  log('Testing reference preservation:');
  const json = original.toJSON();
  assert(json.references.length === refTypes.length, `All ${refTypes.length} references in JSON`);
  
  const restored = new MemoryIndex();
  restored.fromJSON(json);
  
  const usages = restored.findUsages('com.example.B');
  assert(usages.length === refTypes.length, `All ${refTypes.length} references restored`);
  
  log('\nTesting reference properties:');
  const firstRef = usages[0];
  assert(firstRef.fromFqn === 'com.example.A', 'fromFqn preserved');
  assert(firstRef.toFqn === 'com.example.B', 'toFqn preserved');
  assert(typeof firstRef.line === 'number', 'line preserved');
  assert(typeof firstRef.kind === 'string', 'kind preserved');
}

// ============================================================================
// TEST SUITE 3: Call Graph Serialization
// ============================================================================

async function testCallGraphSerialization() {
  log('\n🧪 Test Suite 3: Call Graph Serialization\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  const original = new MemoryIndex();
  
  // Add method symbols
  original.addSymbol({ fqn: 'com.example.A.methodA()', name: 'methodA', kind: 'method', file: '/A.java', line: 10 });
  original.addSymbol({ fqn: 'com.example.B.methodB()', name: 'methodB', kind: 'method', file: '/B.java', line: 10 });
  original.addSymbol({ fqn: 'com.example.C.methodC()', name: 'methodC', kind: 'method', file: '/C.java', line: 10 });
  
  // A calls B, B calls C
  original.addCallGraphEdge('com.example.A.methodA()', 'com.example.B.methodB()', '/A.java', 15, 'method_call');
  original.addCallGraphEdge('com.example.B.methodB()', 'com.example.C.methodC()', '/B.java', 15, 'method_call');
  
  log('Testing call graph serialization:');
  const json = original.toJSON();
  assert(json.callGraph.length === 2, 'Call graph has 2 caller entries');
  
  const restored = new MemoryIndex();
  restored.fromJSON(json);
  
  log('\nTesting outbound calls:');
  const outboundA = restored.getOutboundCalls('com.example.A.methodA()');
  assert(outboundA.length === 1, 'A has 1 outbound call');
  assert(outboundA[0].callee === 'com.example.B.methodB()', 'A calls B');
  
  log('\nTesting inbound calls:');
  const inboundC = restored.getInboundCalls('com.example.C.methodC()');
  assert(inboundC.length === 1, 'C has 1 inbound call');
  assert(inboundC[0].caller === 'com.example.B.methodB()', 'C is called by B');
}

// ============================================================================
// TEST SUITE 4: Inheritance Serialization
// ============================================================================

async function testInheritanceSerialization() {
  log('\n🧪 Test Suite 4: Inheritance Serialization\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  const original = new MemoryIndex();
  
  // Add class hierarchy
  original.addSymbol({ fqn: 'com.example.Base', name: 'Base', kind: 'class', file: '/Base.java', line: 1 });
  original.addSymbol({ fqn: 'com.example.Interface', name: 'Interface', kind: 'interface', file: '/Interface.java', line: 1 });
  original.addSymbol({ fqn: 'com.example.Child', name: 'Child', kind: 'class', file: '/Child.java', line: 1 });
  original.addSymbol({ fqn: 'com.example.GrandChild', name: 'GrandChild', kind: 'class', file: '/GrandChild.java', line: 1 });
  
  // Child extends Base and implements Interface
  original.addInheritance('com.example.Child', 'com.example.Base');
  original.addInheritance('com.example.Child', 'com.example.Interface');
  // GrandChild extends Child
  original.addInheritance('com.example.GrandChild', 'com.example.Child');
  
  log('Testing inheritance serialization:');
  const json = original.toJSON();
  assert(json.inheritance.length >= 2, 'Inheritance has entries');
  
  const restored = new MemoryIndex();
  restored.fromJSON(json);
  
  log('\nTesting getParents:');
  const childParents = restored.getParents('com.example.Child');
  assert(childParents.length === 2, 'Child has 2 parents');
  assert(childParents.includes('com.example.Base'), 'Child extends Base');
  assert(childParents.includes('com.example.Interface'), 'Child implements Interface');
  
  log('\nTesting getChildren:');
  const baseChildren = restored.getChildren('com.example.Base');
  assert(baseChildren.length === 1, 'Base has 1 child');
  assert(baseChildren[0] === 'com.example.Child', 'Base child is Child');
}

async function testLargeIndexPerformance() {
  log('\n🧪 Test Suite 4: Large Index Performance\n');
  
  const { Persistence } = await import('../server/dist/persistence.js');
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  await setupTestDir();
  
  const persistence = new Persistence(TEST_SUBDIR);
  const index = new MemoryIndex();
  
  log('Creating large index (1000 symbols):');
  const startCreate = Date.now();
  
  for (let i = 0; i < 1000; i++) {
    index.addSymbol({
      fqn: `com.example.pkg${i % 20}.Class${i}`,
      name: `Class${i}`,
      kind: 'class',
      file: `/src/pkg${i % 20}/Class${i}.java`,
      line: i + 1,
      column: 1,
      packageName: `com.example.pkg${i % 20}`,
      modifiers: ['public']
    });
  }
  
  const createTime = Date.now() - startCreate;
  log(`  Created in ${createTime}ms`);
  assert(createTime < 5000, `Creation time reasonable (<5s): ${createTime}ms`);
  
  log('\nTesting save performance:');
  const startSave = Date.now();
  await persistence.save(index);
  const saveTime = Date.now() - startSave;
  log(`  Saved in ${saveTime}ms`);
  assert(saveTime < 10000, `Save time reasonable (<10s): ${saveTime}ms`);
  
  log('\nTesting load performance:');
  const loadedIndex = new MemoryIndex();
  const startLoad = Date.now();
  await persistence.load(loadedIndex);
  const loadTime = Date.now() - startLoad;
  log(`  Loaded in ${loadTime}ms`);
  assert(loadTime < 10000, `Load time reasonable (<10s): ${loadTime}ms`);
  
  log('\nVerifying loaded data:');
  assert(loadedIndex.getStats().totalSymbols === 1000, 'All 1000 symbols loaded');
  
  await cleanup();
}

// ============================================================================
// TEST SUITE 5: Special Characters and Edge Cases
// ============================================================================

async function testSpecialCharacters() {
  log('\n🧪 Test Suite 5: Special Characters and Edge Cases\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  const index = new MemoryIndex();
  
  log('Testing inner class with $ character:');
  index.addSymbol({
    fqn: 'com.example.Outer$Inner',
    name: 'Inner',
    kind: 'class',
    file: '/src/Outer.java',
    line: 10
  });
  
  log('Testing method with $ in name:');
  index.addSymbol({
    fqn: 'com.example.Test.method$impl(String)',
    name: 'method$impl',
    kind: 'method',
    file: '/src/Test.java',
    line: 20
  });
  
  log('Testing Unicode in class names:');
  index.addSymbol({
    fqn: 'com.example.日本語.クラス',
    name: 'クラス',
    kind: 'class',
    file: '/src/Japanese.java',
    line: 5,
    javadoc: '日本語のドキュメント'
  });
  
  // Serialize and restore
  const json = index.toJSON();
  const restored = new MemoryIndex();
  restored.fromJSON(json);
  
  const innerClass = restored.getSymbol('com.example.Outer$Inner');
  assert(innerClass !== undefined, 'Inner class with $ preserved');
  
  const methodImpl = restored.getSymbol('com.example.Test.method$impl(String)');
  assert(methodImpl !== undefined, 'Method with $ preserved');
  
  const unicode = restored.getSymbol('com.example.日本語.クラス');
  assert(unicode !== undefined, 'Unicode class name preserved');
  assert(unicode && unicode.javadoc === '日本語のドキュメント', 'Unicode javadoc preserved');
  
  log('\nTesting empty strings and arrays:');
  index.addSymbol({
    fqn: 'com.example.Empty',
    name: 'Empty',
    kind: 'class',
    file: '/src/Empty.java',
    line: 1,
    javadoc: '',  // Empty string
    modifiers: []  // Empty array
  });
  
  const json2 = index.toJSON();
  const restored2 = new MemoryIndex();
  restored2.fromJSON(json2);
  
  const emptySymbol = restored2.getSymbol('com.example.Empty');
  assert(emptySymbol !== undefined, 'Symbol with empty fields preserved');
  
  log('\nTesting very long FQNs:');
  const longFqn = 'com.' + 'a'.repeat(500) + '.VeryLongClass';
  index.addSymbol({
    fqn: longFqn,
    name: 'VeryLongClass',
    kind: 'class',
    file: '/src/VeryLong.java',
    line: 1
  });
  
  const json3 = index.toJSON();
  const restored3 = new MemoryIndex();
  restored3.fromJSON(json3);
  
  const longSymbol = restored3.getSymbol(longFqn);
  assert(longSymbol !== undefined, 'Very long FQN preserved');
}

// ============================================================================
// TEST SUITE 6: Large Index Performance
// ============================================================================

async function testLargeIndexPerformance() {
  log('\n🧪 Test Suite 6: Large Index Performance\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  const index = new MemoryIndex();
  
  log('Creating large index (1000 symbols):');
  const startCreate = Date.now();
  
  for (let i = 0; i < 1000; i++) {
    index.addSymbol({
      fqn: `com.example.pkg${i % 20}.Class${i}`,
      name: `Class${i}`,
      kind: 'class',
      file: `/src/pkg${i % 20}/Class${i}.java`,
      line: i + 1,
      column: 1,
      packageName: `com.example.pkg${i % 20}`,
      modifiers: ['public']
    });
  }
  
  const createTime = Date.now() - startCreate;
  log(`  Created in ${createTime}ms`);
  assert(createTime < 5000, `Creation time reasonable (<5s): ${createTime}ms`);
  
  log('\nTesting toJSON performance:');
  const startJson = Date.now();
  const json = index.toJSON();
  const jsonTime = Date.now() - startJson;
  log(`  toJSON in ${jsonTime}ms`);
  assert(jsonTime < 5000, `toJSON time reasonable (<5s): ${jsonTime}ms`);
  assert(json.symbols.length === 1000, 'All 1000 symbols in JSON');
  
  log('\nTesting fromJSON performance:');
  const restored = new MemoryIndex();
  const startRestore = Date.now();
  restored.fromJSON(json);
  const restoreTime = Date.now() - startRestore;
  log(`  fromJSON in ${restoreTime}ms`);
  assert(restoreTime < 5000, `fromJSON time reasonable (<5s): ${restoreTime}ms`);
  
  assert(restored.getStats().symbols === 1000, 'All 1000 symbols restored');
}

// ============================================================================
// TEST SUITE 7: Multiple Serialization Cycles
// ============================================================================

async function testMultipleCycles() {
  log('\n🧪 Test Suite 7: Multiple Serialization Cycles\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  let index = new MemoryIndex();
  
  log('Testing multiple serialize/deserialize cycles:');
  
  // Cycle 1: Initial data
  for (let i = 0; i < 10; i++) {
    index.addSymbol({
      fqn: `com.example.Class${i}`,
      name: `Class${i}`,
      kind: 'class',
      file: `/src/Class${i}.java`,
      line: 1
    });
  }
  
  // Multiple cycles
  for (let cycle = 1; cycle <= 5; cycle++) {
    const json = index.toJSON();
    const restored = new MemoryIndex();
    restored.fromJSON(json);
    
    assert(restored.getStats().symbols === 10, 
      `Cycle ${cycle}: All 10 symbols preserved`);
    
    index = restored;  // Use restored for next cycle
  }
  
  log('\nTesting data integrity after 5 cycles:');
  const finalSymbol = index.getSymbol('com.example.Class0');
  assert(finalSymbol !== undefined, 'Symbol survives multiple cycles');
  assert(finalSymbol && finalSymbol.name === 'Class0', 'Symbol data preserved');
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  STORAGE AND SERIALIZATION TEST SUITE');
  console.log('  Testing MemoryIndex serialization and data integrity');
  console.log('='.repeat(70));
  
  try {
    await testSerializationRoundtrip();
    await testReferenceSerialization();
    await testCallGraphSerialization();
    await testInheritanceSerialization();
    await testSpecialCharacters();
    await testLargeIndexPerformance();
    await testMultipleCycles();
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
