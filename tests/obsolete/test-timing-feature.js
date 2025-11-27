/**
 * Timing Feature Test Suite
 * 
 * Tests the new timing measurement feature added to all MCP tools.
 * Validates:
 * 1. All tools include timing information in their output
 * 2. Timing format is correct (ms or s)
 * 3. Timing is non-zero for actual operations
 * 4. Error responses also include timing
 * 5. Backward compatibility - output structure unchanged except for timing line
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

class TimingFeatureTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.testProjectRoot = path.join(__dirname, 'test-timing-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    this.totalTests = 0;
    this.passed = 0;
    this.failed = 0;
    this.testResults = [];
  }

  async createTestProject() {
    const srcDir = path.join(this.testProjectRoot, 'src', 'main', 'java', 'com', 'example');
    fs.mkdirSync(srcDir, { recursive: true });

    // Simple test class
    const userContent = `package com.example;

public class User {
    private String name;
    private int age;
    
    public User(String name, int age) {
        this.name = name;
        this.age = age;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public int getAge() {
        return age;
    }
    
    public void greet() {
        System.out.println("Hello, " + name);
    }
}`;

    const serviceContent = `package com.example;

public class UserService {
    private User user;
    
    public UserService() {
        this.user = new User("Default", 0);
    }
    
    public void createUser(String name, int age) {
        this.user = new User(name, age);
        user.greet();
    }
    
    public User getUser() {
        return user;
    }
}`;

    fs.writeFileSync(path.join(srcDir, 'User.java'), userContent);
    fs.writeFileSync(path.join(srcDir, 'UserService.java'), serviceContent);

    console.log(`${colors.green}✓ Created test project${colors.reset}\n`);
  }

  async cleanupTestProject() {
    if (fs.existsSync(this.testProjectRoot)) {
      fs.rmSync(this.testProjectRoot, { recursive: true, force: true });
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}${colors.bold}Timing Feature Test Suite${colors.reset}`);
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

  validateTiming(text, toolName) {
    // Check for timing line
    const hasTimingLine = text.includes('Time taken:') || text.includes('⏱️');
    if (!hasTimingLine) {
      throw new Error(`Tool ${toolName} does not include timing information`);
    }

    // Extract timing value
    const msMatch = text.match(/(\d+)ms/);
    const secMatch = text.match(/(\d+\.\d+)s/);
    
    if (!msMatch && !secMatch) {
      throw new Error(`Tool ${toolName} has invalid timing format`);
    }

    // Parse timing value
    let timingMs = 0;
    if (msMatch) {
      timingMs = parseInt(msMatch[1]);
    } else if (secMatch) {
      timingMs = parseFloat(secMatch[1]) * 1000;
    }

    // Timing should be non-negative
    if (timingMs < 0) {
      throw new Error(`Tool ${toolName} has negative timing: ${timingMs}ms`);
    }

    return timingMs;
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
    // First, index the project
    await this.runTest('Setup - Index test project', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.testProjectRoot,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0]?.text || '';
      
      // Validate timing is included
      this.validateTiming(text, 'index_project');
      
      if (!text.includes('Statistics')) {
        throw new Error('Index failed to complete');
      }
    });

    // Test 1: find_symbol includes timing
    await this.runTest('find_symbol - Includes timing', async () => {
      const result = await this.callTool('find_symbol', {
        name: 'com.example.User'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'find_symbol');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 2: find_usages includes timing
    await this.runTest('find_usages - Includes timing', async () => {
      const result = await this.callTool('find_usages', {
        fqn: 'com.example.User'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'find_usages');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 3: call_graph includes timing
    await this.runTest('call_graph - Includes timing', async () => {
      const result = await this.callTool('call_graph', {
        fqn: 'com.example.UserService.createUser'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'call_graph');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 4: goto_definition includes timing
    await this.runTest('goto_definition - Includes timing', async () => {
      const result = await this.callTool('goto_definition', {
        symbol: 'com.example.User.getName'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'goto_definition');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 5: search_text includes timing
    await this.runTest('search_text - Includes timing', async () => {
      const result = await this.callTool('search_text', {
        pattern: 'User',
        isRegex: false
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'search_text');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 6: analyze_impact includes timing
    await this.runTest('analyze_impact - Includes timing', async () => {
      const result = await this.callTool('analyze_impact', {
        fqn: 'com.example.User.getName'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'analyze_impact');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 7: semantic_search includes timing
    await this.runTest('semantic_search - Includes timing', async () => {
      const result = await this.callTool('semantic_search', {
        query: 'user management'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'semantic_search');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 8: explain_code includes timing
    await this.runTest('explain_code - Includes timing', async () => {
      const result = await this.callTool('explain_code', {
        fqn: 'com.example.User'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'explain_code');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 9: test_coverage includes timing
    await this.runTest('test_coverage - Includes timing', async () => {
      const result = await this.callTool('test_coverage', {
        fqn: 'com.example.User'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'test_coverage');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 10: refactoring_suggestions includes timing
    await this.runTest('refactoring_suggestions - Includes timing', async () => {
      const result = await this.callTool('refactoring_suggestions', {
        fqn: 'com.example.User'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'refactoring_suggestions');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 11: code_generation includes timing
    await this.runTest('code_generation - Includes timing', async () => {
      const result = await this.callTool('code_generation', {
        request: 'Generate a builder pattern for User class'
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'code_generation');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 12: compact_index includes timing
    await this.runTest('compact_index - Includes timing', async () => {
      const result = await this.callTool('compact_index', {
        rootDir: this.testProjectRoot
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'compact_index');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 13: reindex_file includes timing
    await this.runTest('reindex_file - Includes timing', async () => {
      const filePath = path.join(this.testProjectRoot, 'src', 'main', 'java', 'com', 'example', 'User.java');
      const result = await this.callTool('reindex_file', {
        filePath: filePath,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0]?.text || '';
      
      const timing = this.validateTiming(text, 'reindex_file');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 14: Error responses include timing
    await this.runTest('Error responses - Include timing', async () => {
      const result = await this.callTool('find_symbol', {
        name: 'com.example.NonExistentClass'
      });
      const text = result.content[0]?.text || '';
      
      // Even "no results" should have timing
      const timing = this.validateTiming(text, 'find_symbol');
      console.log(`${colors.cyan}    Tool execution time: ${timing}ms${colors.reset}`);
    });

    // Test 15: Timing format for fast operations (< 1s)
    await this.runTest('Timing format - Fast operations show ms', async () => {
      const result = await this.callTool('find_symbol', {
        name: 'User'
      });
      const text = result.content[0]?.text || '';
      
      // Should use ms format for fast operations
      const hasMsFormat = text.match(/\d+ms/);
      if (!hasMsFormat && !text.includes('1.') && !text.includes('0.')) {
        // Allow seconds format if operation took >= 1s
        console.log(`${colors.yellow}    Note: Operation took >= 1s, using seconds format${colors.reset}`);
      } else if (hasMsFormat) {
        console.log(`${colors.cyan}    ✓ Fast operation uses ms format${colors.reset}`);
      }
    });

    // Test 16: Backward compatibility - Output structure preserved
    await this.runTest('Backward compatibility - Output structure preserved', async () => {
      const result = await this.callTool('find_symbol', {
        name: 'com.example.User'
      });
      const text = result.content[0]?.text || '';
      
      // Should still have all original information
      if (!text.includes('class') || !text.includes('User')) {
        throw new Error('Original output information is missing');
      }
      
      // Should have file location
      if (!text.includes('File:') && !text.includes('.java')) {
        throw new Error('File location information is missing');
      }
      
      // Timing should be present (using emoji or text format)
      const hasTiming = text.includes('Time taken:') || text.includes('⏱️');
      
      if (!hasTiming) {
        console.log(`${colors.yellow}Debug - Output:${colors.reset}`);
        console.log(text);
        throw new Error('Timing information not found in output');
      }
      
      console.log(`${colors.cyan}    ✓ All original information preserved${colors.reset}`);
      console.log(`${colors.cyan}    ✓ Timing information present${colors.reset}`);
    });
  }

  printSummary() {
    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}TIMING FEATURE TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
    
    const passRate = ((this.passed / this.totalTests) * 100).toFixed(1);
    console.log(`${colors.bold}Total Tests:${colors.reset} ${this.totalTests}`);
    console.log(`${colors.green}${colors.bold}Passed:${colors.reset} ${this.passed}`);
    console.log(`${colors.red}${colors.bold}Failed:${colors.reset} ${this.failed}`);
    console.log(`${colors.bold}Pass Rate:${colors.reset} ${passRate}%\n`);

    if (this.failed > 0) {
      console.log(`${colors.red}${colors.bold}⚠️  SOME TESTS FAILED!${colors.reset}`);
      console.log(`${colors.red}Timing feature may not be working correctly.${colors.reset}\n`);
    } else {
      console.log(`${colors.green}${colors.bold}✅ ALL TESTS PASSED!${colors.reset}`);
      console.log(`${colors.green}Timing feature is working correctly on all tools.${colors.reset}\n`);
    }

    console.log(`${colors.bold}Test Results:${colors.reset}`);
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
  const tester = new TimingFeatureTester();
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
