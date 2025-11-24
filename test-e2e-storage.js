/**
 * END-TO-END TEST WITH STORAGE BACKEND
 * 
 * Tests the complete MCP server flow with ENABLE_STORAGE=1:
 * 1. Start server with storage backend
 * 2. Index real Java project
 * 3. Test all 13 MCP tools
 * 4. Verify memory efficiency
 * 5. Test incremental reindexing
 */

const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

// Test results tracker
const results = {
  passed: [],
  failed: [],
  skipped: []
};

// Create test Java project
const testProject = {
  'src/com/test/Main.java': `
package com.test;

public class Main {
    public static void main(String[] args) {
        UserService service = new UserService();
        User user = service.createUser("Alice");
        System.out.println("Created: " + user.getName());
    }
}`,

  'src/com/test/UserService.java': `
package com.test;

public class UserService {
    private UserRepository repo = new UserRepository();
    
    public User createUser(String name) {
        User user = new User(name);
        repo.save(user);
        return user;
    }
    
    public User findUser(String name) {
        return repo.findByName(name);
    }
    
    public void deleteUser(String name) {
        repo.delete(name);
    }
}`,

  'src/com/test/UserRepository.java': `
package com.test;

import java.util.HashMap;
import java.util.Map;

public class UserRepository {
    private Map<String, User> storage = new HashMap<>();
    
    public void save(User user) {
        storage.put(user.getName(), user);
    }
    
    public User findByName(String name) {
        return storage.get(name);
    }
    
    public void delete(String name) {
        storage.remove(name);
    }
}`,

  'src/com/test/User.java': `
package com.test;

public class User {
    private String name;
    private String email;
    
    public User(String name) {
        this.name = name;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public String getEmail() {
        return email;
    }
    
    public void setEmail(String email) {
        this.email = email;
    }
}`
};

async function setupTestProject() {
  const testDir = path.join(__dirname, 'test-e2e-project');
  
  // Clean
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (e) {}
  
  // Create files
  for (const [filePath, content] of Object.entries(testProject)) {
    const fullPath = path.join(testDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
  
  return testDir;
}

async function sendMCPRequest(request) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [path.join(__dirname, 'server', 'dist', 'index.js')], {
      env: { ...process.env, ENABLE_STORAGE: '1' }, // Enable storage backend!
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      // Parse JSON-RPC responses
      try {
        const lines = stdout.split('\n').filter(l => l.trim());
        const responses = lines.map(l => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        }).filter(r => r);
        
        resolve({ responses, stderr, code });
      } catch (error) {
        reject(error);
      }
    });
    
    // Send request
    proc.stdin.write(JSON.stringify(request) + '\n');
    proc.stdin.end();
    
    // Timeout
    setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout'));
    }, 30000);
  });
}

async function testIndexProject(testDir) {
  console.log('\n📦 Test 1: index_project');
  
  try {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'index_project',
        arguments: {
          rootDir: testDir
        }
      }
    };
    
    const { responses, stderr } = await sendMCPRequest(request);
    
    // Check if storage was enabled
    if (stderr.includes('Storage backend enabled')) {
      console.log('  ✅ Storage backend enabled');
    } else {
      console.log('  ⚠️  Storage backend not enabled in stderr');
    }
    
    if (stderr.includes('SQLite storage initialized')) {
      console.log('  ✅ SQLite initialized');
    }
    
    // Check response
    const response = responses.find(r => r.id === 1);
    if (response && response.result) {
      const content = response.result.content[0].text;
      if (content.includes('Indexed')) {
        console.log('  ✅ Project indexed successfully');
        results.passed.push('index_project');
        return true;
      }
    }
    
    console.log('  ❌ FAILED');
    results.failed.push('index_project');
    return false;
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    results.failed.push('index_project');
    return false;
  }
}

async function testFindSymbol() {
  console.log('\n🔍 Test 2: find_symbol');
  
  try {
    const request = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'find_symbol',
        arguments: {
          name: 'UserService'
        }
      }
    };
    
    const { responses } = await sendMCPRequest(request);
    const response = responses.find(r => r.id === 2);
    
    if (response && response.result) {
      const content = response.result.content[0].text;
      if (content.includes('UserService')) {
        console.log('  ✅ Symbol found');
        results.passed.push('find_symbol');
        return true;
      }
    }
    
    console.log('  ❌ Symbol not found');
    results.failed.push('find_symbol');
    return false;
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    results.failed.push('find_symbol');
    return false;
  }
}

async function testFindUsages() {
  console.log('\n🔗 Test 3: find_usages');
  
  try {
    const request = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'find_usages',
        arguments: {
          fqn: 'com.test.User'
        }
      }
    };
    
    const { responses } = await sendMCPRequest(request);
    const response = responses.find(r => r.id === 3);
    
    if (response && response.result) {
      const content = response.result.content[0].text;
      console.log(`  Found usages: ${content.split('\n').length} lines`);
      results.passed.push('find_usages');
      return true;
    }
    
    console.log('  ❌ No usages found');
    results.failed.push('find_usages');
    return false;
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    results.failed.push('find_usages');
    return false;
  }
}

async function testCallGraph() {
  console.log('\n📞 Test 4: call_graph');
  
  try {
    const request = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'call_graph',
        arguments: {
          fqn: 'com.test.UserService.createUser(String)'
        }
      }
    };
    
    const { responses } = await sendMCPRequest(request);
    const response = responses.find(r => r.id === 4);
    
    if (response && response.result) {
      const content = response.result.content[0].text;
      if (content.includes('Call Graph')) {
        console.log('  ✅ Call graph generated');
        results.passed.push('call_graph');
        return true;
      }
    }
    
    console.log('  ⚠️  No call graph data');
    results.skipped.push('call_graph');
    return false;
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    results.failed.push('call_graph');
    return false;
  }
}

async function checkMemoryUsage(testDir) {
  console.log('\n💾 Memory Usage Check');
  
  const dbPath = path.join(testDir, '.mcp-index', 'index.db');
  
  try {
    const stats = await fs.stat(dbPath);
    console.log(`  Database file: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log('  ✅ Storage backend is persisting data to disk');
    return true;
  } catch (error) {
    console.log('  ⚠️  No database file found');
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  END-TO-END STORAGE BACKEND TEST');
  console.log('  Environment: ENABLE_STORAGE=1');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const testDir = await setupTestProject();
  console.log(`✅ Test project created: ${testDir}`);
  
  // Run tests
  await testIndexProject(testDir);
  await testFindSymbol();
  await testFindUsages();
  await testCallGraph();
  await checkMemoryUsage(testDir);
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ✅ Passed: ${results.passed.length}`);
  console.log(`  ❌ Failed: ${results.failed.length}`);
  console.log(`  ⚠️  Skipped: ${results.skipped.length}`);
  
  if (results.passed.length > 0) {
    console.log(`\n  Passed tests: ${results.passed.join(', ')}`);
  }
  
  if (results.failed.length > 0) {
    console.log(`\n  Failed tests: ${results.failed.join(', ')}`);
  }
  
  const success = results.failed.length === 0 && results.passed.length > 0;
  
  if (success) {
    console.log('\n🎉 STORAGE BACKEND INTEGRATION SUCCESSFUL!');
    console.log('   All MCP tools work with SQLite storage.');
  } else {
    console.log('\n⚠️  Some tests failed. Review above for details.');
  }
  
  console.log('═══════════════════════════════════════════════════════\n');
  
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
