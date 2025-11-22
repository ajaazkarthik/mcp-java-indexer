const { MemoryIndex } = await import('./server/dist/memory-index.js');
const { IndexerClient } = await import('./server/dist/indexer-client.js');
const { Persistence } = await import('./server/dist/persistence.js');
const path = await import('path');

async function testInheritance() {
  console.log('🧪 Testing Inheritance Tracking...\n');

  const memoryIndex = new MemoryIndex();
  const indexerClient = new IndexerClient();
  
  const rootDir = 'd:\\workspace\\repo\\github-playground\\mcp-java-indexer\\example-java-project';
  memoryIndex.setIndexDir(rootDir);

  try {
    await indexerClient.start();
    console.log('✅ Indexer started\n');

    const files = [
      path.join(rootDir, 'src/main/java/com/example/demo/Person.java'),
      path.join(rootDir, 'src/main/java/com/example/demo/Employee.java'),
      path.join(rootDir, 'src/main/java/com/example/demo/Status.java')
    ];

    const results = await indexerClient.indexFiles(files, [path.join(rootDir, 'src/main/java')]);

    for (const result of results) {
      console.log(`\n📝 Processing: ${path.basename(result.file)}`);
      
      for (const symbol of result.symbols) {
        memoryIndex.addSymbol(symbol);
        if (symbol.extends || symbol.implements) {
          console.log(`  → ${symbol.kind} ${symbol.name}`);
          if (symbol.extends) console.log(`    extends: ${symbol.extends}`);
          if (symbol.implements) console.log(`    implements: ${JSON.stringify(symbol.implements)}`);
        }
      }
    }

    const stats = memoryIndex.getStats();
    console.log('\n📊 Statistics:');
    console.log(`  Symbols: ${stats.symbols}`);
    console.log(`  Inheritance Relations: ${stats.inheritanceRelations}`);

    // Try to find Employee.NO
    console.log('\n🔍 Testing symbol search:');
    const NO = memoryIndex.findSymbols('Employee.NO');
    console.log(`  Employee.NO: ${NO.length > 0 ? '✅ Found' : '❌ Not found'}`);
    if (NO.length > 0) {
      console.log(`    FQN: ${NO[0].fqn}`);
      console.log(`    Location: ${NO[0].file}:${NO[0].line}`);
    }

    // Try enum constants
    const ACTIVE = memoryIndex.findSymbols('Status.ACTIVE');
    console.log(`  Status.ACTIVE: ${ACTIVE.length > 0 ? '✅ Found' : '❌ Not found'}`);
    if (ACTIVE.length > 0) {
      console.log(`    FQN: ${ACTIVE[0].fqn}`);
    }

    await indexerClient.stop();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testInheritance();
