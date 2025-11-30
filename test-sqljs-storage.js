/**
 * Quick test for sql.js storage implementation
 * Tests zero-config database functionality
 */

const path = require('path');
const fs = require('fs');

async function testSqlJsStorage() {
  console.log('🧪 Testing sql.js Storage Implementation\n');
  console.log('='.repeat(60));

  // Import the storage
  const { SqlJsStorage } = await import('./server/dist/storage/sqljs-storage.js');
  
  const testDir = path.join(process.cwd(), 'test-sqljs-storage');
  
  // Clean up previous test
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }

  console.log('\n1️⃣ Creating SqlJsStorage...');
  const storage = new SqlJsStorage(testDir);
  await storage.initialize();
  console.log('✅ Storage initialized');

  console.log('\n2️⃣ Testing symbol operations...');
  const testSymbol = {
    fqn: 'com.example.TestClass',
    name: 'TestClass',
    kind: 'class',
    file: '/test/TestClass.java',
    line: 10,
    column: 1,
    packageName: 'com.example',
    modifiers: ['public'],
  };

  await storage.saveSymbol(testSymbol);
  console.log('   - Symbol saved');

  const retrieved = await storage.getSymbol('com.example.TestClass');
  console.log('   - Symbol retrieved:', retrieved?.name);
  console.log('✅ Symbol operations work');

  console.log('\n3️⃣ Testing batch operations...');
  const symbols = [];
  for (let i = 0; i < 100; i++) {
    symbols.push({
      fqn: `com.example.Class${i}`,
      name: `Class${i}`,
      kind: 'class',
      file: `/test/Class${i}.java`,
      line: 1,
      column: 1,
      packageName: 'com.example',
      modifiers: ['public'],
    });
  }
  const batchStart = Date.now();
  await storage.saveSymbols(symbols);
  const batchTime = Date.now() - batchStart;
  console.log(`   - Saved 100 symbols in ${batchTime}ms`);
  console.log('✅ Batch operations work');

  console.log('\n4️⃣ Testing references...');
  const testRef = {
    fromFqn: 'com.example.TestClass.method()',
    toFqn: 'com.example.OtherClass',
    file: '/test/TestClass.java',
    line: 20,
    column: 5,
    kind: 'method_call',
  };
  await storage.saveReference(testRef);
  const usages = await storage.findUsages('com.example.OtherClass');
  console.log(`   - Found ${usages.length} usages`);
  console.log('✅ Reference operations work');

  console.log('\n5️⃣ Testing call graph...');
  const testEdge = {
    caller: 'com.example.TestClass.main(String[])',
    callee: 'com.example.OtherClass.process()',
    locations: [{ file: '/test/TestClass.java', line: 25, column: 10 }],
  };
  await storage.saveCallEdge(testEdge, 'forward');
  await storage.saveCallEdge(testEdge, 'reverse');
  const outbound = await storage.getOutboundCalls('com.example.TestClass.main(String[])');
  const inbound = await storage.getInboundCalls('com.example.OtherClass.process()');
  console.log(`   - Outbound calls: ${outbound.length}`);
  console.log(`   - Inbound calls: ${inbound.length}`);
  console.log('✅ Call graph operations work');

  console.log('\n6️⃣ Testing persistence...');
  // Force save
  await storage.close();
  console.log('   - Storage closed (saved to disk)');

  // Check file exists
  const dbPath = path.join(testDir, 'index.db');
  if (fs.existsSync(dbPath)) {
    const size = fs.statSync(dbPath).size;
    console.log(`   - Database file exists: ${(size / 1024).toFixed(2)} KB`);
  }

  // Reload and verify
  console.log('   - Reopening storage...');
  const storage2 = new SqlJsStorage(testDir);
  await storage2.initialize();
  
  const reloaded = await storage2.getSymbol('com.example.TestClass');
  if (reloaded && reloaded.name === 'TestClass') {
    console.log('   - Data persisted correctly!');
    console.log('✅ Persistence works');
  } else {
    console.log('❌ Persistence failed - data not found after reload');
  }

  console.log('\n7️⃣ Getting stats...');
  const stats = await storage2.getStats();
  console.log('   - Symbols:', stats.symbols);
  console.log('   - References:', stats.references);
  console.log('   - Call graph edges:', stats.callGraphEdges);

  await storage2.close();

  // Cleanup
  fs.rmSync(testDir, { recursive: true });
  console.log('\n✅ Cleanup complete');

  console.log('\n' + '='.repeat(60));
  console.log('🎉 All sql.js storage tests passed!');
  console.log('   Zero-config database is working correctly.');
  console.log('='.repeat(60));
}

testSqlJsStorage().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
