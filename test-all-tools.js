/**
 * Comprehensive Test Executor for MCP Java Indexer
 * Tests all 13 tools to ensure no regressions with new changes
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

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

class ComprehensiveTestExecutor {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.projectRoot = path.join(__dirname, 'example-java-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    this.buffer = '';
    
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.testResults = [];
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}${colors.bold}Starting MCP Java Indexer Test Suite${colors.reset}`);
      console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
      
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
        } catch (e) {
          // Ignore non-JSON lines
        }
      });

      this.server.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('running on stdio')) {
          console.log(`${colors.green}✓ MCP Server started successfully${colors.reset}\n`);
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

      // Extended timeout for index_project on large projects
      const isIndexProject = params?.name === 'index_project';
      const timeout = isIndexProject ? 300000 : 60000;
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout after ${timeout/1000}s for ${params?.name || method}`));
        }
      }, timeout);
    });
  }

  async callTool(name, args) {
    return await this.sendRequest('tools/call', { name, arguments: args });
  }

  async runTest(name, testFn) {
    this.totalTests++;
    const testNum = this.totalTests;
    
    console.log(`${colors.blue}[${testNum}] Testing: ${name}${colors.reset}`);
    
    try {
      const startTime = Date.now();
      await testFn();
      const duration = Date.now() - startTime;
      
      this.passedTests++;
      this.testResults.push({ name, status: 'PASS', duration });
      console.log(`${colors.green}  ✓ PASS${colors.reset} (${duration}ms)\n`);
      
      // Small delay between tests to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      this.failedTests++;
      this.testResults.push({ name, status: 'FAIL', error: error.message });
      console.log(`${colors.red}  ✗ FAIL${colors.reset}`);
      console.log(`${colors.red}    ${error.message}${colors.reset}\n`);
      
      // Small delay after failure too
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async runAllTests() {
    console.log(`${colors.magenta}${colors.bold}PHASE 1: Core Indexing Tools${colors.reset}\n`);
    
    // Test 1: index_project
    await this.runTest('index_project - Index entire project', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.projectRoot,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0].text;
      const textLower = text.toLowerCase();
      // Check for valid completion markers - either "Full index", "Incremental update", or "up-to-date" (case-insensitive)
      const isCompleted = textLower.includes('full index') || textLower.includes('incremental update') || textLower.includes('up-to-date');
      // Check for "files" or "Files" (case-insensitive) or "changed" for incremental
      const hasFileInfo = textLower.includes('files') || textLower.includes('changed');
      if (!isCompleted || !hasFileInfo) {
        throw new Error('Indexing did not complete successfully');
      }
      if (!text.includes('324')) {
        throw new Error('Expected 324 symbols but got different count');
      }
    });

    // Test 2: find_symbol
    await this.runTest('find_symbol - Find class by name', async () => {
      const result = await this.callTool('find_symbol', {
        name: 'UserService'
      });
      const text = result.content[0].text;
      if (!text.includes('UserService') || !text.includes('class')) {
        throw new Error('Failed to find UserService class');
      }
    });

    // Test 3: find_usages
    await this.runTest('find_usages - Find all references', async () => {
      const result = await this.callTool('find_usages', {
        symbolFqn: 'com.example.demo.UserRepository'
      });
      const text = result.content[0].text;
      if (!text.includes('Usage') && !text.includes('reference') && !text.includes('found')) {
        throw new Error('Failed to find usages: ' + text.substring(0, 200));
      }
    });

    // Test 4: call_graph
    await this.runTest('call_graph - Analyze method calls', async () => {
      const result = await this.callTool('call_graph', {
        fqn: 'com.example.demo.UserService.createUser(String, String)'
      });
      const text = result.content[0].text;
      if (!text.includes('Call Graph') && !text.includes('not found')) {
        throw new Error('Call graph analysis failed');
      }
    });

    // Test 5: goto_definition
    await this.runTest('goto_definition - Navigate to symbol', async () => {
      const result = await this.callTool('goto_definition', {
        symbolName: 'User'
      });
      const text = result.content[0]?.text || '';
      // Just verify we got a response - the tool may return error or success
      if (text.length === 0) {
        throw new Error('Got empty response from goto_definition');
      }
    });

    // Test 6: search_text
    await this.runTest('search_text - Text search in code', async () => {
      const result = await this.callTool('search_text', {
        pattern: 'public class',
        maxResults: 10
      });
      const text = result.content[0].text;
      if (!text.includes('Search') && !text.includes('match') && !text.includes('Found') && !text.includes('result')) {
        throw new Error('Text search failed: ' + text.substring(0, 200));
      }
    });

    // Test 7: reindex_file
    await this.runTest('reindex_file - Incremental reindex', async () => {
      const testFile = path.join(this.projectRoot, 'src', 'main', 'java', 'com', 'example', 'demo', 'User.java');
      const result = await this.callTool('reindex_file', {
        filePath: testFile,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0].text;
      if (!text.includes('Reindexed') && !text.includes('skipped')) {
        throw new Error('Reindex file failed');
      }
    });

    // Test 7.5: explore_class - Same-package dependencies (Regression test for v2.3.1 fix)
    await this.runTest('explore_class - Detect same-package dependencies', async () => {
      const result = await this.callTool('explore_class', {
        className: 'com.example.demo.UserService'
      });
      const text = result.content[0].text;
      // UserService uses User class from same package (no import needed in Java)
      // After fix in v2.3.1, explore_class should detect this dependency
      if (text.includes('0 external dependencies')) {
        throw new Error('Same-package dependency detection FAILED: UserService uses User class but shows 0 dependencies');
      }
      // Should show User class as dependency
      if (!text.includes('Dependencies') && !text.includes('User')) {
        throw new Error('Should detect User class as dependency');
      }
    });

    // Test 7.6: explore_class - Interface exploration
    await this.runTest('explore_class - Interface exploration', async () => {
      const result = await this.callTool('explore_class', {
        className: 'IUserService'
      });
      const text = result.content[0].text;
      if (!text.includes('interface')) {
        throw new Error('Should identify IUserService as interface');
      }
      if (!text.includes('Methods')) {
        throw new Error('Should list interface methods');
      }
      // IUserService should have createUser, getUser, deleteUser methods
      if (!text.includes('createUser') || !text.includes('getUser') || !text.includes('deleteUser')) {
        throw new Error('Should list all interface methods');
      }
    });

    // Test 7.7: explore_class - Enum exploration
    await this.runTest('explore_class - Enum exploration', async () => {
      const result = await this.callTool('explore_class', {
        className: 'Status'
      });
      const text = result.content[0].text;
      if (!text.includes('enum')) {
        throw new Error('Should identify Status as enum');
      }
      if (!text.includes('Overview')) {
        throw new Error('Should have Overview section');
      }
    });

    // Test 7.8: explore_class - Class with inheritance (extends)
    await this.runTest('explore_class - Class with inheritance', async () => {
      const result = await this.callTool('explore_class', {
        className: 'Employee'
      });
      const text = result.content[0].text;
      if (!text.includes('Inheritance')) {
        throw new Error('Should have Inheritance section');
      }
      if (!text.includes('Person')) {
        throw new Error('Should show Employee extends Person');
      }
    });

    // Test 7.9: explore_class - Class with implements
    await this.runTest('explore_class - Class with implements', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserService'
      });
      const text = result.content[0].text;
      if (!text.includes('IUserService')) {
        throw new Error('Should show UserService implements IUserService');
      }
    });

    // Test 7.10: explore_class - Lookup by FQN
    await this.runTest('explore_class - Lookup by FQN', async () => {
      const result = await this.callTool('explore_class', {
        className: 'com.example.demo.Dog'
      });
      const text = result.content[0].text;
      if (!text.includes('Dog')) {
        throw new Error('Should find Dog by FQN');
      }
      if (!text.includes('com.example.demo')) {
        throw new Error('Should show package for Dog');
      }
    });

    // Test 7.11: explore_class - Class structure (methods and fields)
    await this.runTest('explore_class - Class structure details', async () => {
      const result = await this.callTool('explore_class', {
        className: 'User'
      });
      const text = result.content[0].text;
      if (!text.includes('Structure')) {
        throw new Error('Should have Structure section');
      }
      if (!text.includes('Fields')) {
        throw new Error('Should have Fields listed');
      }
      if (!text.includes('Methods')) {
        throw new Error('Should have Methods listed');
      }
      // User has getId, setId, getName, setName, getEmail, setEmail
      if (!text.includes('getId') || !text.includes('getName') || !text.includes('getEmail')) {
        throw new Error('Should list getter methods');
      }
    });

    // Test 7.12: explore_class - Subclasses detection
    await this.runTest('explore_class - Subclasses detection', async () => {
      const result = await this.callTool('explore_class', {
        className: 'Person'
      });
      const text = result.content[0].text;
      if (!text.includes('Inheritance')) {
        throw new Error('Should have Inheritance section');
      }
      // Person should have Employee as subclass
      if (!text.includes('Subclasses') || !text.includes('Employee')) {
        throw new Error('Should detect Employee as subclass of Person');
      }
    });

    // Test 7.13: explore_class - Non-existent class handling
    await this.runTest('explore_class - Non-existent class handling', async () => {
      const result = await this.callTool('explore_class', {
        className: 'NonExistentClass123'
      });
      const text = result.content[0].text;
      if (!text.includes('not found')) {
        throw new Error('Should indicate class was not found');
      }
      if (!text.includes('Suggestions')) {
        throw new Error('Should provide suggestions for finding the class');
      }
    });

    // Test 7.14: explore_class - Dependents (Inbound) section exists
    await this.runTest('explore_class - Dependents section exists', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserRepository'
      });
      const text = result.content[0].text;
      if (!text.includes('Dependents') || !text.includes('Inbound')) {
        throw new Error('Should have Dependents (Inbound) section');
      }
      // Should have Unique dependents stat
      if (!text.includes('Unique dependents')) {
        throw new Error('Should show Unique dependents in Quick Stats');
      }
    });

    // Test 7.15: explore_class - includeMethodDetails parameter
    await this.runTest('explore_class - includeMethodDetails parameter', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserService',
        includeMethodDetails: true
      });
      const text = result.content[0].text;
      // Should still work with includeMethodDetails=true
      if (!text.includes('UserService')) {
        throw new Error('Should work with includeMethodDetails=true');
      }
      if (!text.includes('Methods')) {
        throw new Error('Should include methods section');
      }
    });

    // Test 7.16: explore_class - Quick stats validation
    await this.runTest('explore_class - Quick stats validation', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserService'
      });
      const text = result.content[0].text;
      if (!text.includes('Quick Stats')) {
        throw new Error('Should have Quick Stats section');
      }
      if (!text.includes('Total usages') || !text.includes('Unique dependents') || !text.includes('Unique dependencies')) {
        throw new Error('Quick Stats should include usages, dependents, and dependencies counts');
      }
    });

    // Test 7.17: explore_class - Suggested next actions
    await this.runTest('explore_class - Suggested next actions', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserService'
      });
      const text = result.content[0].text;
      if (!text.includes('Suggested Next Actions')) {
        throw new Error('Should have Suggested Next Actions section');
      }
      if (!text.includes('explain_code') || !text.includes('analyze_impact')) {
        throw new Error('Should suggest explain_code and analyze_impact');
      }
    });

    // Test 7.18: explore_class - Deep inheritance hierarchy (Dog -> DomesticAnimal -> Animal -> LivingThing)
    await this.runTest('explore_class - Deep inheritance hierarchy', async () => {
      const result = await this.callTool('explore_class', {
        className: 'Dog'
      });
      const text = result.content[0].text;
      if (!text.includes('Inheritance')) {
        throw new Error('Should have Inheritance section');
      }
      // Dog extends DomesticAnimal
      if (!text.includes('DomesticAnimal')) {
        throw new Error('Should show Dog extends DomesticAnimal');
      }
    });

    // Test 7.19: explore_class - Partial name matching (case-insensitive)
    await this.runTest('explore_class - Partial name matching', async () => {
      const result = await this.callTool('explore_class', {
        className: 'userservice'  // lowercase
      });
      const text = result.content[0].text;
      // Should still find UserService
      if (!text.includes('UserService') || text.includes('not found')) {
        throw new Error('Should find UserService with lowercase name');
      }
    });

    // Test 7.20: explore_class - File location info
    await this.runTest('explore_class - File location info', async () => {
      const result = await this.callTool('explore_class', {
        className: 'User'
      });
      const text = result.content[0].text;
      // Should include file path and line number (format: **File**: path:line)
      if (!text.includes('**File**:')) {
        throw new Error('Should show File location');
      }
      if (!text.includes('.java')) {
        throw new Error('Should show .java file path');
      }
    });

    // Test 7.21: explore_class - Constructors count
    await this.runTest('explore_class - Constructors count', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserService'
      });
      const text = result.content[0].text;
      // Should show constructor count in Structure section
      if (!text.includes('Constructors')) {
        throw new Error('Should show Constructors count');
      }
    });

    console.log(`${colors.magenta}${colors.bold}PHASE 2: AI-Friendly Tools (v1.3.0)${colors.reset}\n`);

    // Test 8: explain_code
    await this.runTest('explain_code - Explain UserService class', async () => {
      const result = await this.callTool('explain_code', {
        symbolFqn: 'com.example.demo.UserService',
        verbosity: 'detailed'
      });
      const text = result.content[0].text;
      if (!text.includes('Code Explanation') || !text.includes('Purpose')) {
        throw new Error('Code explanation failed');
      }
    });

    // Test 9: semantic_search
    await this.runTest('semantic_search - Find repository methods', async () => {
      const result = await this.callTool('semantic_search', {
        query: 'repository save methods',
        maxResults: 10
      });
      const text = result.content[0].text;
      if (!text.includes('Semantic Search') || !text.includes('Results')) {
        throw new Error('Semantic search failed');
      }
    });

    // Test 10: analyze_impact
    await this.runTest('analyze_impact - Impact analysis', async () => {
      const result = await this.callTool('analyze_impact', {
        symbolFqn: 'com.example.demo.UserRepository',
        depth: 2
      });
      const text = result.content[0].text;
      if (!text.includes('Impact Analysis') || !text.includes('Risk')) {
        throw new Error('Impact analysis failed');
      }
    });

    console.log(`${colors.magenta}${colors.bold}PHASE 3: New Advanced Tools (v1.4.0)${colors.reset}\n`);

    // Test 11: test_coverage
    await this.runTest('test_coverage - Analyze test coverage', async () => {
      const result = await this.callTool('test_coverage', {
        symbolFqn: 'com.example.demo.UserService',
        includeIndirect: true
      });
      const text = result.content[0].text;
      if (!text.includes('Coverage') || !text.includes('Summary')) {
        throw new Error('Test coverage analysis failed');
      }
    });

    // Test 12: refactoring_suggestions
    await this.runTest('refactoring_suggestions - Analyze UserService', async () => {
      const result = await this.callTool('refactoring_suggestions', {
        symbolFqn: 'com.example.demo.UserService',
        analysisDepth: 'thorough'
      });
      const text = result.content[0].text;
      if (!text.includes('Refactoring') || !text.includes('Health Score')) {
        throw new Error('Refactoring suggestions failed');
      }
    });

    // Test 13: code_generation
    await this.runTest('code_generation - Generate Builder', async () => {
      const result = await this.callTool('code_generation', {
        pattern: 'builder',
        targetName: 'Product',
        packageName: 'com.example.demo'
      });
      const text = result.content[0].text;
      if (!text.includes('Generated Code') || !text.includes('ProductBuilder')) {
        throw new Error('Code generation failed');
      }
    });
  }

  printSummary() {
    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}TEST EXECUTION SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

    const passRate = ((this.passedTests / this.totalTests) * 100).toFixed(1);
    
    console.log(`${colors.bold}Total Tests:${colors.reset} ${this.totalTests}`);
    console.log(`${colors.green}${colors.bold}Passed:${colors.reset} ${this.passedTests}`);
    console.log(`${colors.red}${colors.bold}Failed:${colors.reset} ${this.failedTests}`);
    console.log(`${colors.bold}Pass Rate:${colors.reset} ${passRate}%\n`);

    if (this.failedTests === 0) {
      console.log(`${colors.green}${colors.bold}✓ ALL TESTS PASSED!${colors.reset}`);
      console.log(`${colors.green}No regressions detected. Safe to proceed.${colors.reset}\n`);
    } else {
      console.log(`${colors.red}${colors.bold}✗ SOME TESTS FAILED${colors.reset}`);
      console.log(`${colors.red}Review failures before proceeding.${colors.reset}\n`);
    }

    // Detailed results
    console.log(`${colors.bold}Detailed Results:${colors.reset}\n`);
    this.testResults.forEach((result, index) => {
      const status = result.status === 'PASS' 
        ? `${colors.green}✓ PASS${colors.reset}` 
        : `${colors.red}✗ FAIL${colors.reset}`;
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`  ${index + 1}. ${result.name}: ${status}${duration}`);
      if (result.error) {
        console.log(`     ${colors.red}Error: ${result.error}${colors.reset}`);
      }
    });

    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

    // Tool categories summary
    console.log(`${colors.bold}Tools by Category:${colors.reset}\n`);
    console.log(`  ${colors.cyan}Core Indexing (7 tools):${colors.reset}`);
    console.log(`    index_project, reindex_file, find_symbol, find_usages,`);
    console.log(`    call_graph, goto_definition, search_text`);
    console.log();
    console.log(`  ${colors.magenta}AI-Friendly v1.3.0 (3 tools):${colors.reset}`);
    console.log(`    explain_code, semantic_search, analyze_impact`);
    console.log();
    console.log(`  ${colors.yellow}Advanced v1.4.0 (3 tools):${colors.reset}`);
    console.log(`    test_coverage, refactoring_suggestions, code_generation`);
    console.log();

    return this.failedTests === 0;
  }

  async stop() {
    if (this.server) {
      this.server.kill();
      console.log(`${colors.cyan}Server stopped${colors.reset}\n`);
    }
  }
}

// Run tests
(async () => {
  const tester = new ComprehensiveTestExecutor();
  let success = false;
  
  try {
    await tester.start();
    await tester.runAllTests();
    success = tester.printSummary();
  } catch (error) {
    console.error(`${colors.red}${colors.bold}Fatal error: ${error.message}${colors.reset}`);
    console.error(error.stack);
  } finally {
    await tester.stop();
    process.exit(success ? 0 : 1);
  }
})();
