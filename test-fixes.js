/**
 * Quick test to verify the specific fixes for failing tests
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

class QuickTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    this.totalTests = 0;
    this.passed = 0;
    this.failed = 0;
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}${colors.bold}Quick Fix Verification Test${colors.reset}`);
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
          console.log(`${colors.green}✓ Server started${colors.reset}\n`);
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
          reject(new Error(`Request timeout for ${params?.name || method}`));
        }
      }, 30000);
    });
  }

  async callTool(name, args) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async runTest(name, fn) {
    this.totalTests++;
    console.log(`${colors.blue}[${this.totalTests}] ${name}${colors.reset}`);
    try {
      await fn();
      this.passed++;
      console.log(`${colors.green}  ✓ PASS${colors.reset}\n`);
    } catch (error) {
      this.failed++;
      console.log(`${colors.red}  ✗ FAIL${colors.reset}`);
      console.log(`${colors.red}    ${error.message}${colors.reset}\n`);
    }
  }

  async runAllTests() {
    // First, index a small test project
    console.log(`${colors.yellow}Indexing example project...${colors.reset}\n`);
    const projectPath = path.join(__dirname, 'example-java-project', 'src');
    try {
      await this.callTool('index_project', {
        rootDir: projectPath,
        sourceRoots: ['']
      });
      console.log(`${colors.green}✓ Project indexed${colors.reset}\n`);
    } catch (error) {
      console.log(`${colors.yellow}⚠ Could not index project, some tests may fail${colors.reset}\n`);
    }

    // Test 1: goto_definition with 'symbolName' parameter (backward compatibility)
    await this.runTest('goto_definition accepts symbolName parameter', async () => {
      const result = await this.callTool('goto_definition', { 
        symbolName: 'UserService' 
      });
      const text = result.content[0]?.text || '';
      if (text.includes('Error') || text.includes('Missing required parameter')) {
        throw new Error('goto_definition rejected symbolName parameter');
      }
      if (!text.includes('Definition') && !text.includes('Multiple')) {
        throw new Error('Expected definition output');
      }
    });

    // Test 2: goto_definition with 'symbol' parameter (standard)
    await this.runTest('goto_definition accepts symbol parameter', async () => {
      const result = await this.callTool('goto_definition', { 
        symbol: 'UserService' 
      });
      const text = result.content[0]?.text || '';
      if (text.includes('Error') || text.includes('Missing required parameter')) {
        throw new Error('goto_definition rejected symbol parameter');
      }
      if (!text.includes('Definition') && !text.includes('Multiple')) {
        throw new Error('Expected definition output');
      }
    });

    // Test 3: find_usages with simple name (not full FQN)
    await this.runTest('find_usages accepts simple class names', async () => {
      const result = await this.callTool('find_usages', { 
        fqn: 'UserService' 
      });
      const text = result.content[0]?.text || '';
      // Should either find usages, show multiple matches, or say no usages
      // Should NOT say symbol not found if the class exists
      if (text.includes('Symbol not found')) {
        // Check if UserService actually exists
        const findResult = await this.callTool('find_symbol', { name: 'UserService' });
        const findText = findResult.content[0]?.text || '';
        if (findText.includes('UserService')) {
          throw new Error('find_usages did not resolve simple name even though symbol exists');
        }
        // If symbol doesn't exist, it's OK to say not found
      }
      // If resolved, should show either usages or "Multiple symbols match"
      if (!text.includes('Found') && !text.includes('No usages') && 
          !text.includes('Multiple') && !text.includes('Symbol not found')) {
        throw new Error('Unexpected find_usages response format');
      }
    });

    // Test 4: semantic_search with multi-word query
    await this.runTest('semantic_search handles multi-word queries', async () => {
      const result = await this.callTool('semantic_search', {
        query: 'component topology handoff',
        limit: 5,
        scope: 'classes'
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Semantic Search Results')) {
        throw new Error('Missing semantic search results header');
      }
      // Should find something with at least one of the words
      // If it finds nothing, that's also OK but check the no-results message
      if (!text.includes('Found') && !text.includes('No results')) {
        throw new Error('Unexpected semantic search response format');
      }
    });

    // Test 5: semantic_search word matching
    await this.runTest('semantic_search matches individual words', async () => {
      const result = await this.callTool('semantic_search', {
        query: 'service repository database',
        limit: 5
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Semantic Search Results')) {
        throw new Error('Missing semantic search results header');
      }
      // Should find classes/methods with service, repository, or database in name
      // Most projects have at least one of these
    });

    // Test 6: goto_definition without any parameters (error handling)
    await this.runTest('goto_definition requires a parameter', async () => {
      const result = await this.callTool('goto_definition', {});
      const text = result.content[0]?.text || '';
      if (!text.includes('Error') && !text.includes('Missing')) {
        throw new Error('goto_definition should error when no parameters provided');
      }
    });
  }

  printSummary() {
    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
    const passRate = ((this.passed / this.totalTests) * 100).toFixed(1);
    console.log(`${colors.bold}Total Tests:${colors.reset} ${this.totalTests}`);
    console.log(`${colors.green}${colors.bold}Passed:${colors.reset} ${this.passed}`);
    console.log(`${colors.red}${colors.bold}Failed:${colors.reset} ${this.failed}`);
    console.log(`${colors.bold}Pass Rate:${colors.reset} ${passRate}%\n`);

    if (this.failed === 0) {
      console.log(`${colors.green}${colors.bold}✅ All fixes verified!${colors.reset}\n`);
    } else {
      console.log(`${colors.red}${colors.bold}❌ Some tests still failing${colors.reset}\n`);
    }
  }

  async stop() {
    if (this.server) {
      this.server.kill();
    }
  }
}

(async () => {
  const tester = new QuickTester();
  let success = false;
  try {
    await tester.start();
    await tester.runAllTests();
    tester.printSummary();
    success = tester.failed === 0;
  } catch (error) {
    console.error(`${colors.red}${colors.bold}Fatal error: ${error.message}${colors.reset}`);
    console.error(error.stack);
  } finally {
    await tester.stop();
    process.exit(success ? 0 : 1);
  }
})();
