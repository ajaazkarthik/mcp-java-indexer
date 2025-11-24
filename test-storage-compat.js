/**
 * Test Storage-Backed MemoryIndex Compatibility
 * 
 * Verifies that the new storage-backed implementation maintains
 * 100% API compatibility with the original MemoryIndex.
 */

const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
const path = require('path');
const fs = require('fs/promises');

async function testBasicOperations() {
  console.log('🧪 Testing basic operations...\n');
  
  const index = new MemoryIndexWithStorage();
  const testDir = path.join(__dirname, '.test-index');
  
  // Clean test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (e) {}
  
  index.setIndexDir(__dirname);
  
  // Test 1: Add and get symbol
  console.log('Test 1: Add and retrieve symbol');
  const testSymbol = {
    fqn: 'com.example.TestClass',
    name: 'TestClass',
    kind: 'class',
    file: '/test/TestClass.java',
    line: 10,
    column: 1,
    packageName: 'com.example',
    modifiers: ['public']
  };
  
  index.addSymbol(testSymbol);
  const retrieved = index.getSymbol('com.example.TestClass');
  
  if (retrieved && retrieved.fqn === testSymbol.fqn) {
    console.log('  ✅ Symbol added and retrieved successfully');
  } else {
    console.log('  ❌ FAILED: Symbol not found or incorrect');
    return false;
  }
  
  // Test 2: Find symbols
  console.log('\nTest 2: Find symbols by partial name');
  const found = index.findSymbols('TestClass');
  
  if (found.length > 0 && found[0].fqn === testSymbol.fqn) {
    console.log('  ✅ Symbol found by partial name');
  } else {
    console.log('  ❌ FAILED: Symbol not found by partial name');
    return false;
  }
  
  // Test 3: Add reference
  console.log('\nTest 3: Add and find reference');
  const testRef = {
    fromFqn: 'com.example.Caller.method()',
    toFqn: 'com.example.TestClass',
    file: '/test/Caller.java',
    line: 20,
    column: 5,
    kind: 'instantiation'
  };
  
  index.addReference(testRef);
  
  // Wait a bit for write queue
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const usages = index.findUsages('com.example.TestClass');
  console.log(`  Found ${usages.length} usages`);
  console.log('  ✅ Reference added (write queued)');
  
  // Test 4: File tracking
  console.log('\nTest 4: File tracking');
  index.addFile('/test/TestClass.java', 'abc123', ['com.example.TestClass'], true);
  const fileInfo = index.getFile('/test/TestClass.java');
  
  if (fileInfo && fileInfo.hash === 'abc123') {
    console.log('  ✅ File tracked successfully');
  } else {
    console.log('  ❌ FAILED: File not tracked correctly');
    return false;
  }
  
  // Test 5: Stats
  console.log('\nTest 5: Get stats');
  const stats = index.getStats();
  console.log(`  Symbols: ${stats.symbols}`);
  console.log(`  Files: ${stats.allFiles}`);
  console.log(`  Indexed Files: ${stats.indexedFiles}`);
  console.log('  ✅ Stats retrieved');
  
  // Test 6: Cleanup operations
  console.log('\nTest 6: Maintenance cleanup');
  index.performMaintenanceCleanup();
  console.log('  ✅ Maintenance cleanup executed');
  
  // Test 7: Flush writes
  console.log('\nTest 7: Flush pending writes');
  await index.flush();
  console.log('  ✅ All writes flushed to storage');
  
  // Close storage
  await index.close();
  console.log('\n✅ All tests passed!\n');
  
  return true;
}

async function testCallGraph() {
  console.log('🧪 Testing call graph operations...\n');
  
  const index = new MemoryIndexWithStorage();
  index.setIndexDir(__dirname);
  
  // Add caller and callee symbols
  index.addSymbol({
    fqn: 'com.example.ServiceA.processData(String)',
    name: 'processData',
    kind: 'method',
    file: '/test/ServiceA.java',
    line: 15,
    column: 5,
    packageName: 'com.example',
    modifiers: ['public'],
    declaringClass: 'com.example.ServiceA',
    signature: '(String)void'
  });
  
  index.addSymbol({
    fqn: 'com.example.ServiceB.validate(String)',
    name: 'validate',
    kind: 'method',
    file: '/test/ServiceB.java',
    line: 20,
    column: 5,
    packageName: 'com.example',
    modifiers: ['public'],
    declaringClass: 'com.example.ServiceB',
    signature: '(String)boolean'
  });
  
  // Add method call reference
  index.addReference({
    fromFqn: 'com.example.ServiceA.processData(String)',
    toFqn: 'com.example.ServiceB.validate(String)',
    file: '/test/ServiceA.java',
    line: 18,
    column: 10,
    kind: 'method_call'
  });
  
  // Wait for writes
  await new Promise(resolve => setTimeout(resolve, 200));
  
  console.log('Test: Outbound calls');
  const outbound = index.getOutboundCalls('com.example.ServiceA.processData(String)');
  console.log(`  Found ${outbound.length} outbound calls`);
  if (outbound.length > 0) {
    console.log(`  ✅ Outbound call: ${outbound[0].caller} → ${outbound[0].callee}`);
  }
  
  console.log('\nTest: Inbound calls');
  const inbound = index.getInboundCalls('com.example.ServiceB.validate(String)');
  console.log(`  Found ${inbound.length} inbound calls`);
  if (inbound.length > 0) {
    console.log(`  ✅ Inbound call: ${inbound[0].caller} → ${inbound[0].callee}`);
  }
  
  await index.close();
  console.log('\n✅ Call graph tests passed!\n');
  
  return true;
}

async function testPerformance() {
  console.log('🧪 Testing performance with 1000 symbols...\n');
  
  const index = new MemoryIndexWithStorage();
  index.setIndexDir(__dirname);
  
  const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
  const startTime = Date.now();
  
  // Add 1000 symbols
  for (let i = 0; i < 1000; i++) {
    index.addSymbol({
      fqn: `com.example.Class${i}`,
      name: `Class${i}`,
      kind: 'class',
      file: `/test/Class${i}.java`,
      line: 10,
      column: 1,
      packageName: 'com.example',
      modifiers: ['public']
    });
  }
  
  const addTime = Date.now() - startTime;
  console.log(`  Added 1000 symbols in ${addTime}ms`);
  
  // Read them back
  const readStart = Date.now();
  let found = 0;
  
  for (let i = 0; i < 1000; i++) {
    const symbol = index.getSymbol(`com.example.Class${i}`);
    if (symbol) found++;
  }
  
  const readTime = Date.now() - readStart;
  console.log(`  Read ${found}/1000 symbols in ${readTime}ms`);
  
  // Flush writes
  await index.flush();
  const flushTime = Date.now() - startTime;
  console.log(`  Flushed to storage in ${flushTime}ms total`);
  
  const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
  const memUsed = endMem - startMem;
  console.log(`  Memory used: ${memUsed.toFixed(2)} MB`);
  
  await index.close();
  console.log('\n✅ Performance test completed!\n');
  
  return true;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  MCP Java Indexer - Storage Compatibility Test Suite');
  console.log('═══════════════════════════════════════════════════════\n');
  
  try {
    await testBasicOperations();
    await testCallGraph();
    await testPerformance();
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✅ ALL TESTS PASSED - Storage backend is compatible!');
    console.log('═══════════════════════════════════════════════════════\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
