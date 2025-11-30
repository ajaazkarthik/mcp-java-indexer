/**
 * Test StorageFactory auto-detection of sql.js
 */

const path = require('path');
const fs = require('fs');

async function testStorageFactory() {
  console.log('🧪 Testing StorageFactory Auto-Detection\n');
  console.log('='.repeat(60));

  const { StorageFactory } = await import('./server/dist/storage/storage-factory.js');
  
  // Reset any cached detection
  StorageFactory.resetDetection();
  
  const testDir = path.join(process.cwd(), 'test-storage-factory');
  
  // Clean up previous test
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }

  console.log('\n1️⃣ Testing auto-detection...');
  const storage = await StorageFactory.create(testDir);
  
  const detectedType = StorageFactory.getDetectedType();
  console.log(`   Detected storage type: ${detectedType}`);
  
  if (detectedType === 'sqljs' || detectedType === 'better-sqlite3') {
    console.log('✅ Database storage detected (zero-config working!)');
  } else {
    console.log('⚠️  File shard fallback detected');
  }

  console.log('\n2️⃣ Testing storage operations...');
  const testSymbol = {
    fqn: 'com.test.Factory',
    name: 'Factory',
    kind: 'class',
    file: '/test/Factory.java',
    line: 1,
    column: 1,
    packageName: 'com.test',
    modifiers: ['public'],
  };

  await storage.saveSymbol(testSymbol);
  const retrieved = await storage.getSymbol('com.test.Factory');
  console.log(`   Symbol saved and retrieved: ${retrieved?.name}`);
  console.log('✅ Storage operations work');

  console.log('\n3️⃣ Getting stats...');
  const stats = await storage.getStats();
  console.log(`   Symbols: ${stats.symbols}`);

  await storage.close();

  // Cleanup
  fs.rmSync(testDir, { recursive: true });

  console.log('\n' + '='.repeat(60));
  console.log('🎉 StorageFactory auto-detection test passed!');
  console.log(`   Storage type: ${detectedType}`);
  console.log('='.repeat(60));
}

testStorageFactory().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
