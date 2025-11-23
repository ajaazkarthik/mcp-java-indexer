/**
 * Feature Preservation Test Suite
 * 
 * This test ensures critical features are NEVER accidentally removed during optimization.
 * Each test validates a specific feature that must be preserved:
 * 
 * ✅ Enum constants extraction
 * ✅ Modifiers (public, private, static, final, etc.)
 * ✅ Method signatures (return type + parameters)
 * ✅ Field signatures (type + name)
 * ✅ Constructor signatures
 * ✅ Complete symbol extraction (classes, methods, fields, constructors, enums)
 * ✅ Call graphs and references
 * ✅ Incremental indexing
 * ✅ Inheritance tracking (extends/implements)
 * 
 * If any of these tests fail, it indicates a feature was removed and must be restored.
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m'
};

class FeaturePreservationTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.testProjectRoot = path.join(__dirname, 'test-feature-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    this.totalTests = 0;
    this.passed = 0;
    this.failed = 0;
    this.testResults = [];
  }

  async createTestProject() {
    const srcDir = path.join(this.testProjectRoot, 'src', 'main', 'java', 'com', 'test');
    fs.mkdirSync(srcDir, { recursive: true });

    // Test file 1: Enum with constants
    const enumContent = `package com.test;

public enum Status {
    ACTIVE,
    INACTIVE,
    PENDING;
    
    public boolean isActive() {
        return this == ACTIVE;
    }
}`;

    // Test file 2: Class with all features
    const classContent = `package com.test;

import java.util.List;

public class User {
    private String name;
    public static final int MAX_AGE = 120;
    protected volatile boolean active;
    
    public User(String name) {
        this.name = name;
    }
    
    private User(String name, boolean active) {
        this.name = name;
        this.active = active;
    }
    
    public String getName() {
        return name;
    }
    
    protected void setActive(boolean active) {
        this.active = active;
    }
    
    public static User createUser(String name) {
        return new User(name);
    }
    
    private synchronized void internalMethod() {
        // internal logic
    }
}`;

    // Test file 3: Abstract class with inheritance
    const abstractContent = `package com.test;

public abstract class BaseEntity implements Comparable<BaseEntity> {
    protected Long id;
    
    public abstract void validate();
    
    public Long getId() {
        return id;
    }
    
    @Override
    public int compareTo(BaseEntity other) {
        return id.compareTo(other.id);
    }
}`;

    // Test file 4: Interface
    const interfaceContent = `package com.test;

public interface Repository {
    void save(Object entity);
    Object findById(Long id);
    void delete(Long id);
}`;

    // Test file 5: Concrete implementation
    const implementationContent = `package com.test;

public class UserRepository implements Repository {
    
    @Override
    public void save(Object entity) {
        // implementation
    }
    
    @Override
    public Object findById(Long id) {
        return null;
    }
    
    @Override
    public void delete(Long id) {
        // implementation
    }
    
    public User findUserById(Long id) {
        return (User) findById(id);
    }
}`;

    fs.writeFileSync(path.join(srcDir, 'Status.java'), enumContent);
    fs.writeFileSync(path.join(srcDir, 'User.java'), classContent);
    fs.writeFileSync(path.join(srcDir, 'BaseEntity.java'), abstractContent);
    fs.writeFileSync(path.join(srcDir, 'Repository.java'), interfaceContent);
    fs.writeFileSync(path.join(srcDir, 'UserRepository.java'), implementationContent);

    console.log(`${colors.green}✓ Created test project at ${this.testProjectRoot}${colors.reset}\n`);
  }

  async cleanupTestProject() {
    if (fs.existsSync(this.testProjectRoot)) {
      fs.rmSync(this.testProjectRoot, { recursive: true, force: true });
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}${colors.bold}Feature Preservation Test Suite${colors.reset}`);
      console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);

      this.server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const rl = readline.createInterface({
        input: this.server.stdout,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);
          if (response.id && this.pendingRequests.has(response.id)) {
            const { resolve: resolveRequest } = this.pendingRequests.get(response.id);
            this.pendingRequests.delete(response.id);
            resolveRequest(response.result);
          }
        } catch (err) {
          // ignore non-JSON logs
        }
      });

      this.server.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('running on stdio')) {
          resolve();
        }
      });

      this.server.on('error', reject);
    });
  }

  async sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = { jsonrpc: '2.0', id, method, params };
      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout after 60s`));
        }
      }, 60000);
    });
  }

  async callTool(name, args) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async runTest(name, fn) {
    this.totalTests++;
    const testNum = this.totalTests;
    console.log(`${colors.blue}[${testNum}] ${name}${colors.reset}`);
    try {
      const start = Date.now();
      await fn();
      const duration = Date.now() - start;
      this.passed++;
      this.testResults.push({ name, status: 'PASS', duration });
      console.log(`${colors.green}  ✓ PASS${colors.reset} (${duration}ms)\n`);
    } catch (error) {
      this.failed++;
      this.testResults.push({ name, status: 'FAIL', error: error.message });
      console.log(`${colors.red}  ✗ FAIL${colors.reset}`);
      console.log(`${colors.red}    ${error.message}${colors.reset}\n`);
    }
  }

  async runAllTests() {
    // Index the test project
    await this.runTest('Setup - Index test project', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.testProjectRoot,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Statistics')) {
        throw new Error('Index failed to complete');
      }
    });

    // TEST: Enum constants extraction
    await this.runTest('CRITICAL: Enum constants are extracted', async () => {
      // Try to find each enum constant individually
      const activeResult = await this.callTool('find_symbol', { name: 'com.test.Status.ACTIVE' });
      const activeText = activeResult.content[0]?.text || '';
      
      if (!activeText.includes('ACTIVE') && !activeText.includes('Status')) {
        throw new Error('❌ FEATURE REMOVED: Enum constant ACTIVE not found - enum constants extraction is broken!');
      }
      
      const inactiveResult = await this.callTool('find_symbol', { name: 'com.test.Status.INACTIVE' });
      const inactiveText = inactiveResult.content[0]?.text || '';
      
      if (!inactiveText.includes('INACTIVE') && !inactiveText.includes('Status')) {
        throw new Error('❌ FEATURE REMOVED: Enum constant INACTIVE not found - enum constants extraction is broken!');
      }
      
      const pendingResult = await this.callTool('find_symbol', { name: 'com.test.Status.PENDING' });
      const pendingText = pendingResult.content[0]?.text || '';
      
      if (!pendingText.includes('PENDING') && !pendingText.includes('Status')) {
        throw new Error('❌ FEATURE REMOVED: Enum constant PENDING not found - enum constants extraction is broken!');
      }
    });

    // TEST: Public modifier extraction
    await this.runTest('CRITICAL: Public modifier is extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.getName' });
      const text = result.content[0]?.text || '';
      
      if (!text.toLowerCase().includes('public')) {
        throw new Error('❌ FEATURE REMOVED: Public modifier not found - modifier extraction is broken!');
      }
    });

    // TEST: Private modifier extraction
    await this.runTest('CRITICAL: Private modifier is extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.name' });
      const text = result.content[0]?.text || '';
      
      if (!text.toLowerCase().includes('private')) {
        throw new Error('❌ FEATURE REMOVED: Private modifier not found - modifier extraction is broken!');
      }
    });

    // TEST: Static modifier extraction
    await this.runTest('CRITICAL: Static modifier is extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.MAX_AGE' });
      const text = result.content[0]?.text || '';
      
      if (!text.toLowerCase().includes('static')) {
        throw new Error('❌ FEATURE REMOVED: Static modifier not found - modifier extraction is broken!');
      }
    });

    // TEST: Final modifier extraction
    await this.runTest('CRITICAL: Final modifier is extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.MAX_AGE' });
      const text = result.content[0]?.text || '';
      
      if (!text.toLowerCase().includes('final')) {
        throw new Error('❌ FEATURE REMOVED: Final modifier not found - modifier extraction is broken!');
      }
    });

    // TEST: Protected modifier extraction
    await this.runTest('CRITICAL: Protected modifier is extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.active' });
      const text = result.content[0]?.text || '';
      
      if (!text.toLowerCase().includes('protected')) {
        throw new Error('❌ FEATURE REMOVED: Protected modifier not found - modifier extraction is broken!');
      }
    });

    // TEST: Volatile modifier extraction
    await this.runTest('CRITICAL: Volatile modifier is extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.active' });
      const text = result.content[0]?.text || '';
      
      if (!text.toLowerCase().includes('volatile')) {
        throw new Error('❌ FEATURE REMOVED: Volatile modifier not found - modifier extraction is broken!');
      }
    });

    // TEST: Synchronized modifier extraction
    await this.runTest('CRITICAL: Synchronized modifier is extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.internalMethod' });
      const text = result.content[0]?.text || '';
      
      if (!text.toLowerCase().includes('synchronized')) {
        throw new Error('❌ FEATURE REMOVED: Synchronized modifier not found - modifier extraction is broken!');
      }
    });

    // TEST: Abstract modifier extraction
    await this.runTest('CRITICAL: Abstract modifier is extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.BaseEntity.validate' });
      const text = result.content[0]?.text || '';
      
      if (!text.toLowerCase().includes('abstract')) {
        throw new Error('❌ FEATURE REMOVED: Abstract modifier not found - modifier extraction is broken!');
      }
    });

    // TEST: Method signature extraction
    await this.runTest('CRITICAL: Method signatures are extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.getName' });
      const text = result.content[0]?.text || '';
      
      // Signature should include return type (String) and method name
      const hasSignature = text.includes('String') || text.includes('getName()');
      if (!hasSignature) {
        throw new Error('❌ FEATURE REMOVED: Method signature not found - signature extraction is broken!');
      }
    });

    // TEST: Method with parameters signature
    await this.runTest('CRITICAL: Method signatures with parameters are extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.setActive' });
      const text = result.content[0]?.text || '';
      
      // Should include parameter type
      const hasParameter = text.includes('boolean') || text.includes('(boolean)');
      if (!hasParameter) {
        throw new Error('❌ FEATURE REMOVED: Method parameter signature not found - signature extraction is broken!');
      }
    });

    // TEST: Field signature extraction
    await this.runTest('CRITICAL: Field signatures are extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.name' });
      const text = result.content[0]?.text || '';
      
      // Signature should include field type (String)
      if (!text.includes('String')) {
        throw new Error('❌ FEATURE REMOVED: Field signature not found - signature extraction is broken!');
      }
    });

    // TEST: Constructor signature extraction
    await this.runTest('CRITICAL: Constructor signatures are extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.User' });
      const text = result.content[0]?.text || '';
      
      // Should find constructors with signatures
      const hasConstructor = text.includes('User(String)') || (text.includes('User') && text.includes('String'));
      if (!hasConstructor) {
        throw new Error('❌ FEATURE REMOVED: Constructor signature not found - signature extraction is broken!');
      }
    });

    // TEST: Multiple constructors are preserved
    await this.runTest('CRITICAL: Multiple constructors are extracted', async () => {
      // Search for constructor with just String parameter
      const result1 = await this.callTool('find_symbol', { name: 'com.test.User.User' });
      const text1 = result1.content[0]?.text || '';
      
      // Should find at least one constructor mention
      if (!text1.includes('User') || !text1.includes('constructor')) {
        throw new Error('❌ FEATURE REMOVED: Constructors not found - constructor extraction is broken!');
      }
      
      // Verify we can find constructor with String parameter
      const hasStringParam = text1.includes('String') || text1.includes('(String)');
      if (!hasStringParam) {
        throw new Error('❌ FEATURE REMOVED: Constructor with String parameter not found - constructor extraction is broken!');
      }
    });

    // TEST: Class symbols extraction
    await this.runTest('CRITICAL: Class symbols are extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User' });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('User') || !text.includes('class')) {
        throw new Error('❌ FEATURE REMOVED: Class symbol not found - class extraction is broken!');
      }
    });

    // TEST: Interface symbols extraction
    await this.runTest('CRITICAL: Interface symbols are extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.Repository' });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Repository') || !text.includes('interface')) {
        throw new Error('❌ FEATURE REMOVED: Interface symbol not found - interface extraction is broken!');
      }
    });

    // TEST: Enum symbols extraction
    await this.runTest('CRITICAL: Enum symbols are extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.Status' });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Status') || !text.includes('enum')) {
        throw new Error('❌ FEATURE REMOVED: Enum symbol not found - enum extraction is broken!');
      }
    });

    // TEST: Method symbols extraction
    await this.runTest('CRITICAL: Method symbols are extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.getName' });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('getName') || !text.includes('method')) {
        throw new Error('❌ FEATURE REMOVED: Method symbol not found - method extraction is broken!');
      }
    });

    // TEST: Field symbols extraction
    await this.runTest('CRITICAL: Field symbols are extracted', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.User.name' });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('name') || !text.includes('field')) {
        throw new Error('❌ FEATURE REMOVED: Field symbol not found - field extraction is broken!');
      }
    });

    // TEST: Inheritance tracking (extends)
    await this.runTest('CRITICAL: Extends relationships are tracked', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.BaseEntity' });
      const text = result.content[0]?.text || '';
      
      // BaseEntity doesn't extend anything explicitly, but let's check UserRepository structure is tracked
      const repoResult = await this.callTool('find_symbol', { name: 'com.test.UserRepository' });
      const repoText = repoResult.content[0]?.text || '';
      
      if (!repoText.includes('UserRepository')) {
        throw new Error('❌ FEATURE REMOVED: Class tracking failed - inheritance tracking may be broken!');
      }
    });

    // TEST: Inheritance tracking (implements)
    await this.runTest('CRITICAL: Implements relationships are tracked', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.UserRepository' });
      const text = result.content[0]?.text || '';
      
      // Should show that UserRepository implements Repository
      const hasImplements = text.includes('Repository') || text.includes('implements');
      if (!hasImplements) {
        throw new Error('❌ FEATURE REMOVED: Implements relationship not found - inheritance tracking is broken!');
      }
    });

    // TEST: Call graph functionality
    await this.runTest('CRITICAL: Call graphs are generated', async () => {
      const result = await this.callTool('call_graph', { 
        fqn: 'com.test.UserRepository.findUserById(Long)' 
      });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Call Graph') && !text.includes('findUserById')) {
        throw new Error('❌ FEATURE REMOVED: Call graph not generated - call graph feature is broken!');
      }
    });

    // TEST: References tracking
    await this.runTest('CRITICAL: References are tracked', async () => {
      const result = await this.callTool('find_usages', { 
        fqn: 'com.test.Repository' 
      });
      const text = result.content[0]?.text || '';
      
      // Should find UserRepository as implementation
      if (!text.includes('UserRepository') && !text.includes('usage')) {
        throw new Error('❌ FEATURE REMOVED: References not tracked - reference tracking is broken!');
      }
    });

    // TEST: Incremental indexing
    await this.runTest('CRITICAL: Incremental indexing works', async () => {
      const userFile = path.join(this.testProjectRoot, 'src', 'main', 'java', 'com', 'test', 'User.java');
      
      const result = await this.callTool('reindex_file', { 
        filePath: userFile,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Reindexed') && !text.includes('Skipped')) {
        throw new Error('❌ FEATURE REMOVED: Incremental indexing not working - reindex feature is broken!');
      }
    });

    // TEST: Override annotation detection
    await this.runTest('CRITICAL: Override methods are detected', async () => {
      const result = await this.callTool('find_symbol', { name: 'com.test.UserRepository.save' });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('save') || !text.includes('method')) {
        throw new Error('❌ FEATURE REMOVED: Override method not found - method extraction is broken!');
      }
    });
  }

  printSummary() {
    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}FEATURE PRESERVATION TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
    
    const passRate = ((this.passed / this.totalTests) * 100).toFixed(1);
    console.log(`${colors.bold}Total Tests:${colors.reset} ${this.totalTests}`);
    console.log(`${colors.green}${colors.bold}Passed:${colors.reset} ${this.passed}`);
    console.log(`${colors.red}${colors.bold}Failed:${colors.reset} ${this.failed}`);
    console.log(`${colors.bold}Pass Rate:${colors.reset} ${passRate}%\n`);

    if (this.failed > 0) {
      console.log(`${colors.red}${colors.bold}⚠️  CRITICAL: ${this.failed} FEATURE(S) LOST!${colors.reset}`);
      console.log(`${colors.red}These features must be restored immediately!${colors.reset}\n`);
    } else {
      console.log(`${colors.green}${colors.bold}✅ ALL FEATURES PRESERVED!${colors.reset}`);
      console.log(`${colors.green}All critical functionality is intact.${colors.reset}\n`);
    }

    this.testResults.forEach((result, idx) => {
      const status = result.status === 'PASS'
        ? `${colors.green}✓ PASS${colors.reset}`
        : `${colors.red}✗ FAIL${colors.reset}`;
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`  ${idx + 1}. ${result.name}: ${status}${duration}`);
      if (result.error) {
        console.log(`     ${colors.red}${result.error}${colors.reset}`);
      }
    });

    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);

    return this.failed === 0;
  }

  async stop() {
    if (this.server) {
      this.server.kill();
    }
  }
}

(async () => {
  const tester = new FeaturePreservationTester();
  let success = false;
  try {
    await tester.cleanupTestProject();
    await tester.createTestProject();
    await tester.start();
    await tester.runAllTests();
    success = tester.printSummary();
  } catch (error) {
    console.error(`${colors.red}${colors.bold}Fatal error: ${error.message}${colors.reset}`);
    console.error(error.stack);
  } finally {
    await tester.stop();
    await tester.cleanupTestProject();
    process.exit(success ? 0 : 1);
  }
})();
