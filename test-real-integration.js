/**
 * Real-world integration test using actual Java project
 * Tests the complete flow: index → query → memory usage
 */

const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
const { IndexerClient } = require('./server/dist/indexer-client.js');
const path = require('path');
const fs = require('fs/promises');

// Create a small test Java project
const testProject = {
  'src/com/example/Main.java': `
package com.example;

public class Main {
    public static void main(String[] args) {
        UserService service = new UserService();
        service.createUser("John Doe");
    }
}`,

  'src/com/example/UserService.java': `
package com.example;

public class UserService {
    private UserRepository repository = new UserRepository();
    
    public void createUser(String name) {
        User user = new User(name);
        repository.save(user);
    }
    
    public User findUser(String name) {
        return repository.findByName(name);
    }
}`,

  'src/com/example/UserRepository.java': `
package com.example;

import java.util.HashMap;
import java.util.Map;

public class UserRepository {
    private Map<String, User> users = new HashMap<>();
    
    public void save(User user) {
        users.put(user.getName(), user);
    }
    
    public User findByName(String name) {
        return users.get(name);
    }
}`,

  'src/com/example/User.java': `
package com.example;

public class User {
    private String name;
    
    public User(String name) {
        this.name = name;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
}`
};

async function setupTestProject() {
  const testDir = path.join(__dirname, 'test-java-project');
  
  // Clean and create test project
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (e) {}
  
  for (const [filePath, content] of Object.entries(testProject)) {
    const fullPath = path.join(testDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
  
  return testDir;
}

async function testFullIntegration() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Real-World Integration Test');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const testDir = await setupTestProject();
  console.log(`✅ Test Java project created at: ${testDir}\n`);
  
  const memoryIndex = new MemoryIndexWithStorage();
  memoryIndex.setIndexDir(testDir);
  
  // Wait for storage to initialize
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('📦 Indexing Java files...');
  const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
  const startTime = Date.now();
  
  const indexerClient = new IndexerClient();
  await indexerClient.start();
  
  const javaFiles = [
    path.join(testDir, 'src/com/example/Main.java'),
    path.join(testDir, 'src/com/example/UserService.java'),
    path.join(testDir, 'src/com/example/UserRepository.java'),
    path.join(testDir, 'src/com/example/User.java')
  ];
  
  const sourceRoots = [path.join(testDir, 'src')];
  
  try {
    const results = await indexerClient.indexFiles(javaFiles, sourceRoots);
    
    console.log(`  ✅ Indexed ${results.length} files in ${Date.now() - startTime}ms\n`);
    
    // Add symbols to index
    let totalSymbols = 0;
    let totalReferences = 0;
    
    for (const result of results) {
      if (result.symbols) {
        for (const symbol of result.symbols) {
          memoryIndex.addSymbol(symbol);
          totalSymbols++;
        }
      }
      
      if (result.references) {
        for (const ref of result.references) {
          memoryIndex.addReference(ref);
          totalReferences++;
        }
      }
    }
    
    console.log(`📊 Index Statistics:`);
    console.log(`  Symbols: ${totalSymbols}`);
    console.log(`  References: ${totalReferences}\n`);
    
    // Wait for writes to flush
    await memoryIndex.flush();
    
    console.log('🔍 Testing Queries:\n');
    
    // Test 1: Find UserService class
    console.log('1. Find UserService class:');
    const userServiceSymbols = memoryIndex.findSymbols('UserService');
    console.log(`  Found ${userServiceSymbols.length} symbols`);
    if (userServiceSymbols.length > 0) {
      console.log(`  ✅ ${userServiceSymbols[0].fqn} at ${userServiceSymbols[0].file}:${userServiceSymbols[0].line}`);
    }
    
    // Test 2: Find usages of User class
    console.log('\n2. Find usages of User class:');
    const userUsages = memoryIndex.findUsages('com.example.User');
    console.log(`  Found ${userUsages.length} usages`);
    for (const usage of userUsages) {
      console.log(`  - ${usage.kind}: ${usage.fromFqn} → ${usage.toFqn}`);
    }
    
    // Test 3: Find createUser method
    console.log('\n3. Find createUser method:');
    const createUserSymbols = memoryIndex.findSymbols('createUser');
    if (createUserSymbols.length > 0) {
      const method = createUserSymbols[0];
      console.log(`  ✅ Found: ${method.fqn}`);
      
      // Get outbound calls from createUser
      console.log('\n  Outbound calls from createUser:');
      const outboundCalls = memoryIndex.getOutboundCalls(method.fqn);
      console.log(`  Found ${outboundCalls.length} calls`);
      for (const edge of outboundCalls) {
        console.log(`    → ${edge.callee} (${edge.locations.length} locations)`);
      }
    }
    
    // Test 4: Find who calls save method
    console.log('\n4. Find who calls save method:');
    const saveSymbols = memoryIndex.findSymbols('save');
    if (saveSymbols.length > 0) {
      const saveMethod = saveSymbols.find(s => s.kind === 'method');
      if (saveMethod) {
        console.log(`  Method: ${saveMethod.fqn}`);
        const inboundCalls = memoryIndex.getInboundCalls(saveMethod.fqn);
        console.log(`  Inbound calls: ${inboundCalls.length}`);
        for (const edge of inboundCalls) {
          console.log(`    ← ${edge.caller}`);
        }
      }
    }
    
    // Test 5: Inheritance
    console.log('\n5. Check HashMap inheritance:');
    const hashMapSymbols = memoryIndex.findSymbols('HashMap');
    if (hashMapSymbols.length > 0) {
      console.log(`  Found HashMap references: ${hashMapSymbols.length}`);
    }
    
    const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
    const memUsed = endMem - startMem;
    
    console.log(`\n💾 Memory Usage:`);
    console.log(`  Before indexing: ${startMem.toFixed(2)} MB`);
    console.log(`  After indexing: ${endMem.toFixed(2)} MB`);
    console.log(`  Memory increase: ${memUsed.toFixed(2)} MB`);
    
    // Get final stats
    const stats = memoryIndex.getStats();
    console.log(`\n📈 Final Statistics:`);
    console.log(`  Cached symbols: ${stats.symbols}`);
    console.log(`  Tracked files: ${stats.allFiles}`);
    console.log(`  Indexed files: ${stats.indexedFiles}`);
    
    await indexerClient.stop();
    await memoryIndex.close();
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✅ Integration test PASSED!');
    console.log('═══════════════════════════════════════════════════════\n');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    await indexerClient.stop();
    await memoryIndex.close();
    return false;
  }
}

async function main() {
  try {
    const success = await testFullIntegration();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
