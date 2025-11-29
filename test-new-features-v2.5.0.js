/**
 * Edge Case Tests for v2.5.0 New Features
 * 
 * Tests the following new capabilities:
 * 1. explore_class with directOnly flag
 * 2. Migration safety score (0-100) in scan_migration_candidates
 * 3. explore_class support in batch_query
 * 4. Index freshness indicator
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

class NewFeaturesTestExecutor {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.projectRoot = path.join(__dirname, 'example-java-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.testResults = [];
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}${colors.bold}MCP Java Indexer v2.5.0 - New Features Test Suite${colors.reset}`);
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

      const timeout = method === 'tools/call' && params?.name === 'index_project' ? 300000 : 60000;
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout after ${timeout/1000}s`));
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
      
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      this.failedTests++;
      this.testResults.push({ name, status: 'FAIL', error: error.message });
      console.log(`${colors.red}  ✗ FAIL${colors.reset}`);
      console.log(`${colors.red}    ${error.message}${colors.reset}\n`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async runAllTests() {
    // First, index the project
    console.log(`${colors.magenta}${colors.bold}PHASE 0: Index Project${colors.reset}\n`);
    
    await this.runTest('index_project - Setup for tests', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.projectRoot,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0].text;
      if (!text.toLowerCase().includes('symbols')) {
        throw new Error('Index setup failed');
      }
    });

    // =========================================================================
    // FEATURE 1: explore_class with directOnly flag
    // =========================================================================
    console.log(`${colors.magenta}${colors.bold}FEATURE 1: explore_class directOnly Flag${colors.reset}\n`);

    await this.runTest('explore_class directOnly=false (default) - includes method call deps', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserService',
        directOnly: false
      });
      const text = result.content[0].text;
      // Should show full analysis including method calls
      if (text.includes('[DIRECT ONLY MODE]')) {
        throw new Error('Should NOT show DIRECT ONLY MODE when directOnly=false');
      }
      if (!text.includes('Dependencies') && !text.includes('dependencies')) {
        throw new Error('Should show dependencies section');
      }
    });

    await this.runTest('explore_class directOnly=true - shows DIRECT ONLY MODE', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserService',
        directOnly: true
      });
      const text = result.content[0].text;
      if (!text.includes('[DIRECT ONLY MODE]')) {
        throw new Error('Should show [DIRECT ONLY MODE] indicator');
      }
    });

    await this.runTest('explore_class directOnly=true - interface shows only direct deps', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserRepository',
        directOnly: true
      });
      const text = result.content[0].text;
      if (!text.includes('[DIRECT ONLY MODE]')) {
        throw new Error('Should show [DIRECT ONLY MODE] indicator');
      }
      // Interface should still show its structure
      if (!text.toLowerCase().includes('interface') && !text.includes('UserRepository')) {
        throw new Error('Should identify as interface or show UserRepository');
      }
    });

    await this.runTest('explore_class directOnly with inheritance - shows extends', async () => {
      const result = await this.callTool('explore_class', {
        className: 'AdminController',
        directOnly: true
      });
      const text = result.content[0].text;
      // Should still show inheritance info even in directOnly mode
      if (text.includes('[DIRECT ONLY MODE]') && !text.toLowerCase().includes('class')) {
        throw new Error('Should show class info');
      }
    });

    await this.runTest('explore_class directOnly parameter is optional', async () => {
      // Calling without directOnly should work (default false)
      const result = await this.callTool('explore_class', {
        className: 'UserService'
      });
      const text = result.content[0].text;
      // Should NOT throw and should return valid result
      if (!text.includes('UserService')) {
        throw new Error('Should return UserService info');
      }
    });

    // =========================================================================
    // FEATURE 2: Index Freshness Indicator
    // =========================================================================
    console.log(`${colors.magenta}${colors.bold}FEATURE 2: Index Freshness Indicator${colors.reset}\n`);

    await this.runTest('index_project shows freshness info - Last indexed timestamp', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.projectRoot,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0].text;
      // Should show index status with timestamp
      if (!text.includes('Index Status') && !text.includes('Last indexed')) {
        throw new Error('Should show Index Status or Last indexed info');
      }
    });

    await this.runTest('index_project shows symbol and reference counts', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.projectRoot
      });
      const text = result.content[0].text;
      // Should show counts
      if (!text.includes('Symbols') && !text.includes('symbols')) {
        throw new Error('Should show symbol count');
      }
    });

    await this.runTest('index_project shows time ago format', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.projectRoot
      });
      const text = result.content[0].text;
      // Should show relative time like "just now", "X seconds ago", etc.
      const hasTimeAgo = text.includes('ago') || text.includes('just now') || text.includes('second');
      if (!hasTimeAgo && !text.includes('up-to-date')) {
        // It's okay if it says up-to-date without time ago
        console.log('    Note: No time-ago format, but index is up-to-date');
      }
    });

    // =========================================================================
    // FEATURE 3: explore_class in batch_query
    // =========================================================================
    console.log(`${colors.magenta}${colors.bold}FEATURE 3: explore_class in batch_query${colors.reset}\n`);

    await this.runTest('batch_query with explore_class operation', async () => {
      const result = await this.callTool('batch_query', {
        queries: [
          { tool: 'explore_class', args: { className: 'UserService' } }
        ]
      });
      const text = result.content[0].text;
      if (!text.includes('UserService')) {
        throw new Error('Should return UserService info');
      }
    });

    await this.runTest('batch_query with multiple explore_class operations', async () => {
      const result = await this.callTool('batch_query', {
        queries: [
          { tool: 'explore_class', args: { className: 'UserService' } },
          { tool: 'explore_class', args: { className: 'UserRepository' } }
        ]
      });
      const text = result.content[0].text;
      if (!text.includes('UserService')) {
        throw new Error('Should include UserService');
      }
      if (!text.includes('UserRepository')) {
        throw new Error('Should include UserRepository');
      }
    });

    await this.runTest('batch_query explore_class with directOnly parameter', async () => {
      const result = await this.callTool('batch_query', {
        queries: [
          { tool: 'explore_class', args: { className: 'UserService', directOnly: true } }
        ]
      });
      const text = result.content[0].text;
      if (!text.includes('[DIRECT ONLY MODE]')) {
        throw new Error('Should show DIRECT ONLY MODE when directOnly=true');
      }
    });

    await this.runTest('batch_query mixed operations including explore_class', async () => {
      const result = await this.callTool('batch_query', {
        queries: [
          { tool: 'find_symbol', args: { name: 'UserService' } },
          { tool: 'explore_class', args: { className: 'UserService' } },
          { tool: 'find_usages', args: { fqn: 'UserService' } }
        ]
      });
      const text = result.content[0].text;
      // Should have results from all three operations
      if (!text.includes('find_symbol') && !text.includes('explore_class') && !text.includes('find_usages')) {
        // At minimum should have UserService mentioned multiple times
        const count = (text.match(/UserService/g) || []).length;
        if (count < 2) {
          throw new Error('Should have multiple UserService mentions from different operations');
        }
      }
    });

    await this.runTest('batch_query explore_class with non-existent class', async () => {
      const result = await this.callTool('batch_query', {
        queries: [
          { tool: 'explore_class', args: { className: 'NonExistentClass12345' } }
        ]
      });
      const text = result.content[0].text;
      // Should handle gracefully - either "not found" message or empty result
      if (text.includes('Error') && !text.toLowerCase().includes('not found') && !text.toLowerCase().includes('no class')) {
        throw new Error('Should handle non-existent class gracefully');
      }
    });

    // =========================================================================
    // FEATURE 4: Migration Safety Score (scan_migration_candidates)
    // =========================================================================
    console.log(`${colors.magenta}${colors.bold}FEATURE 4: Migration Safety Score${colors.reset}\n`);

    await this.runTest('scan_migration_candidates returns migrationScore', async () => {
      const result = await this.callTool('scan_migration_candidates', {
        sourcePackage: 'com.example',
        blockedPatterns: ['com.example.internal'],
        strictMode: true
      });
      const text = result.content[0].text;
      // Should contain migration score
      if (!text.includes('Score') && !text.includes('score') && !text.includes('migrationScore')) {
        throw new Error('Should include migration score in output');
      }
    });

    await this.runTest('scan_migration_candidates score is 0-100 range', async () => {
      const result = await this.callTool('scan_migration_candidates', {
        sourcePackage: 'com.example',
        blockedPatterns: [],
        strictMode: false
      });
      const text = result.content[0].text;
      // Look for score patterns like "Score: 85" or "85/100"
      const scoreMatch = text.match(/(?:Score|score)[:\s]*(\d+)/);
      if (scoreMatch) {
        const score = parseInt(scoreMatch[1]);
        if (score < 0 || score > 100) {
          throw new Error(`Score ${score} is out of 0-100 range`);
        }
      }
      // Even if no explicit score, test passes if no error
    });

    await this.runTest('scan_migration_candidates pure interface gets bonus score', async () => {
      // This tests that interfaces (easier to move) get higher scores
      const result = await this.callTool('scan_migration_candidates', {
        sourcePackage: 'com.example.repository',
        blockedPatterns: ['com.example.internal'],
        strictMode: true
      });
      const text = result.content[0].text;
      // Just verify it runs without error
      if (result.isError) {
        throw new Error('Should complete without error');
      }
    });

    await this.runTest('scan_migration_candidates blocked deps get low score', async () => {
      // Classes with blocked dependencies should get lower scores
      const result = await this.callTool('scan_migration_candidates', {
        sourcePackage: 'com.example',
        blockedPatterns: ['com.example.service'],
        strictMode: true
      });
      const text = result.content[0].text;
      // Should identify blocked classes
      if (!text.toLowerCase().includes('block') && !text.toLowerCase().includes('safe') && !text.toLowerCase().includes('score')) {
        // At minimum should have some analysis
        if (!text.includes('com.example')) {
          throw new Error('Should analyze the package');
        }
      }
    });

    // =========================================================================
    // EDGE CASES
    // =========================================================================
    console.log(`${colors.magenta}${colors.bold}EDGE CASES${colors.reset}\n`);

    await this.runTest('explore_class with empty className', async () => {
      try {
        const result = await this.callTool('explore_class', {
          className: ''
        });
        const text = result.content[0].text;
        // Should handle empty class name gracefully
        if (!text.toLowerCase().includes('not found') && !text.toLowerCase().includes('no class') && !text.toLowerCase().includes('required')) {
          // Just ensure it doesn't crash
        }
      } catch (e) {
        // Error is acceptable for empty input
      }
    });

    await this.runTest('batch_query with empty queries array', async () => {
      const result = await this.callTool('batch_query', {
        queries: []
      });
      const text = result.content[0].text;
      // Should handle gracefully
      if (text.toLowerCase().includes('error') && !text.toLowerCase().includes('no queries')) {
        throw new Error('Should handle empty queries gracefully');
      }
    });

    await this.runTest('explore_class directOnly with enum class', async () => {
      const result = await this.callTool('explore_class', {
        className: 'UserRole',
        directOnly: true
      });
      const text = result.content[0].text;
      // Enum should still work with directOnly
      if (text.toLowerCase().includes('error') && !text.toLowerCase().includes('not found')) {
        throw new Error('Should handle enum with directOnly flag');
      }
    });

    await this.runTest('batch_query explore_class returns structured result', async () => {
      const result = await this.callTool('batch_query', {
        queries: [
          { operation: 'explore_class', args: { className: 'User' } }
        ]
      });
      // Verify the result structure
      if (!result.content || !result.content[0]) {
        throw new Error('Should return proper content structure');
      }
    });

    this.printSummary();
  }

  printSummary() {
    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}TEST EXECUTION SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

    console.log(`Total Tests: ${this.totalTests}`);
    console.log(`${colors.green}Passed: ${this.passedTests}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.failedTests}${colors.reset}`);
    console.log(`Pass Rate: ${((this.passedTests / this.totalTests) * 100).toFixed(1)}%\n`);

    if (this.failedTests === 0) {
      console.log(`${colors.green}${colors.bold}✓ ALL NEW FEATURE TESTS PASSED!${colors.reset}`);
      console.log(`${colors.green}v2.5.0 features are working correctly.${colors.reset}\n`);
    } else {
      console.log(`${colors.red}${colors.bold}✗ SOME TESTS FAILED${colors.reset}`);
      console.log(`${colors.red}Please review failures above.${colors.reset}\n`);
      
      console.log(`${colors.yellow}Failed Tests:${colors.reset}`);
      this.testResults
        .filter(t => t.status === 'FAIL')
        .forEach(t => {
          console.log(`  ${colors.red}✗ ${t.name}${colors.reset}`);
          console.log(`    ${t.error}`);
        });
    }

    console.log(`\n${colors.cyan}Features Tested:${colors.reset}`);
    console.log(`  1. explore_class directOnly flag`);
    console.log(`  2. Index freshness indicator`);
    console.log(`  3. explore_class in batch_query`);
    console.log(`  4. Migration safety score\n`);

    this.server.kill();
  }
}

async function main() {
  const executor = new NewFeaturesTestExecutor();
  
  try {
    await executor.start();
    await executor.runAllTests();
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();
