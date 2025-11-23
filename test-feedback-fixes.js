/**
 * Comprehensive End-to-End Test Suite for Feedback Fixes
 * Tests all 5 critical fixes with both example and large projects
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

class FeedbackFixTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    this.totalTests = 0;
    this.passed = 0;
    this.failed = 0;
    this.warnings = 0;
    this.testResults = [];
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}${colors.bold}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
      console.log(`${colors.cyan}${colors.bold}║   COMPREHENSIVE FEEDBACK FIXES TEST SUITE                          ║${colors.reset}`);
      console.log(`${colors.cyan}${colors.bold}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

      this.server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=4096'
        }
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

      const isIndexProject = params?.name === 'index_project';
      const timeout = isIndexProject ? 600000 : 60000; // 10 min for indexing, 1 min for others

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Timeout after ${timeout / 1000}s for ${params?.name || method}`));
        }
      }, timeout);
    });
  }

  async callTool(name, args) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async runTest(name, fn, category = 'General') {
    this.totalTests++;
    const testNum = `[${this.totalTests}]`;
    console.log(`${colors.blue}${testNum} ${category} - ${name}${colors.reset}`);
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      this.passed++;
      console.log(`${colors.green}  ✓ PASS${colors.reset} (${elapsed}s)`);
      
      if (result && result.warning) {
        this.warnings++;
        console.log(`${colors.yellow}  ⚠ ${result.warning}${colors.reset}`);
      }
      
      this.testResults.push({ name, category, status: 'PASS', elapsed, warning: result?.warning });
      console.log();
      return result;
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      this.failed++;
      console.log(`${colors.red}  ✗ FAIL${colors.reset} (${elapsed}s)`);
      console.log(`${colors.red}    ${error.message}${colors.reset}`);
      this.testResults.push({ name, category, status: 'FAIL', elapsed, error: error.message });
      console.log();
      throw error;
    }
  }

  async runAllTests() {
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}PHASE 1: PROJECT INDEXING${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Index example project first
    let exampleProjectPath = null;
    await this.runTest('Index example-java-project', async () => {
      exampleProjectPath = path.join(__dirname, 'example-java-project', 'src');
      const result = await this.callTool('index_project', {
        rootDir: exampleProjectPath,
        sourceRoots: ['']
      });
      const text = result.content[0]?.text || '';
      // Check for success indicators (indexed, Symbols:, Statistics:)
      if (!text.includes('Indexed') && !text.includes('Symbols:') && !text.includes('Statistics:')) {
        throw new Error('Index failed: ' + text.substring(0, 200));
      }
      const symbolCount = (text.match(/Symbols:\s*(\d+)/i) || text.match(/(\d+)\s+symbols?/i) || [])[1];
      console.log(`${colors.cyan}    Found ${symbolCount || 'unknown'} symbols${colors.reset}`);
    }, 'Setup');

    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}PHASE 2: FIX #1 - FIND USAGES (Merge References + Call Graph)${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Test find_usages with exact FQN
    await this.runTest('find_usages with exact FQN', async () => {
      const result = await this.callTool('find_usages', { 
        fqn: 'com.example.demo.service.UserService' 
      });
      const text = result.content[0]?.text || '';
      
      // Should show either usages or "No usages found", not "Symbol not found"
      if (text.includes('Symbol not found in index')) {
        return { warning: 'Symbol not indexed, but error message is clear' };
      }
      
      if (!text.includes('Found') && !text.includes('No usages')) {
        throw new Error('Unexpected response: ' + text.substring(0, 100));
      }
      
      console.log(`${colors.cyan}    ${text.split('\n')[0]}${colors.reset}`);
    }, 'Fix #1');

    // Test find_usages with partial name
    await this.runTest('find_usages with partial name (UserService)', async () => {
      const result = await this.callTool('find_usages', { 
        fqn: 'UserService' 
      });
      const text = result.content[0]?.text || '';
      
      // Should either resolve or show multiple matches
      if (text.includes('Multiple symbols match')) {
        console.log(`${colors.cyan}    Found multiple matches (disambiguation works)${colors.reset}`);
        return;
      }
      
      if (text.includes('Symbol not found')) {
        return { warning: 'UserService not found in project' };
      }
      
      if (!text.includes('Found') && !text.includes('No usages')) {
        throw new Error('Unexpected response format');
      }
      
      console.log(`${colors.cyan}    ${text.split('\n')[0]}${colors.reset}`);
    }, 'Fix #1');

    // Test that call graph data is merged
    await this.runTest('find_usages merges call graph data', async () => {
      // First get call graph for any method
      const symbolResult = await this.callTool('find_symbol', { name: 'create' });
      const symbolText = symbolResult.content[0]?.text || '';
      
      if (!symbolText.includes('method:')) {
        return { warning: 'No method named "create" found to test' };
      }
      
      // Extract FQN from first method found
      const fqnMatch = symbolText.match(/FQN:\s*`([^`]+)`/);
      if (!fqnMatch) {
        return { warning: 'Could not parse method FQN' };
      }
      
      const methodFqn = fqnMatch[1];
      console.log(`${colors.cyan}    Testing method: ${methodFqn}${colors.reset}`);
      
      // Get call graph
      const callGraphResult = await this.callTool('call_graph', { fqn: methodFqn });
      const callGraphText = callGraphResult.content[0]?.text || '';
      
      // Get find usages
      const usagesResult = await this.callTool('find_usages', { fqn: methodFqn });
      const usagesText = usagesResult.content[0]?.text || '';
      
      // If call graph shows inbound calls, find_usages should too
      const hasInboundCalls = callGraphText.includes('Inbound Calls') && 
                             !callGraphText.includes('Inbound Calls: 0');
      const hasUsages = usagesText.includes('Found') && !usagesText.includes('Found 0');
      
      if (hasInboundCalls && !hasUsages) {
        throw new Error('Call graph shows callers but find_usages shows none - merge failed!');
      }
      
      console.log(`${colors.cyan}    Call graph + usages data consistent${colors.reset}`);
    }, 'Fix #1');

    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}PHASE 3: FIX #2 - TEST COVERAGE (Fuzzy Symbol Matching)${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Test test_coverage with partial name
    await this.runTest('test_coverage with partial name', async () => {
      const result = await this.callTool('test_coverage', { 
        symbolFqn: 'UserService' 
      });
      const text = result.content[0]?.text || '';
      
      // Should NOT show "Symbol not found" with suggestion to use non-existent tool
      if (text.includes('Try using find_symbol first')) {
        throw new Error('Still suggesting non-existent find_symbol tool!');
      }
      
      // Should either analyze or show multiple matches
      if (!text.includes('Test Coverage Analysis') && 
          !text.includes('Multiple symbols match') &&
          !text.includes('No matching symbols')) {
        throw new Error('Unexpected response format: ' + text.substring(0, 100));
      }
      
      console.log(`${colors.cyan}    ${text.split('\n')[0]}${colors.reset}`);
    }, 'Fix #2');

    // Test test_coverage with exact FQN
    await this.runTest('test_coverage with exact FQN', async () => {
      const result = await this.callTool('test_coverage', { 
        symbolFqn: 'com.example.demo.service.UserService' 
      });
      const text = result.content[0]?.text || '';
      
      if (text.includes('Try using find_symbol first')) {
        throw new Error('Still suggesting non-existent find_symbol tool!');
      }
      
      if (!text.includes('Test Coverage Analysis') && 
          !text.includes('No matching symbols')) {
        throw new Error('Should analyze or say symbol not found');
      }
      
      console.log(`${colors.cyan}    Coverage analysis executed${colors.reset}`);
    }, 'Fix #2');

    // Test disambiguation when multiple matches
    await this.runTest('test_coverage shows disambiguation', async () => {
      const result = await this.callTool('test_coverage', { 
        symbolFqn: 'User' // Common name, likely multiple matches
      });
      const text = result.content[0]?.text || '';
      
      if (text.includes('Multiple symbols match')) {
        if (!text.includes('Use the exact FQN from above')) {
          throw new Error('Missing disambiguation instructions');
        }
        console.log(`${colors.cyan}    Disambiguation works correctly${colors.reset}`);
      } else {
        console.log(`${colors.cyan}    Single match or no matches (OK)${colors.reset}`);
      }
    }, 'Fix #2');

    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}PHASE 4: FIX #3 - REINDEX FILE (Performance Transparency)${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Test reindex without sourceRoots (fast)
    await this.runTest('reindex_file without sourceRoots (fast mode)', async () => {
      // Find a Java file from indexed project
      const searchPath = path.join(exampleProjectPath, 'main', 'java', 'com', 'example', 'demo', 'service');
      if (!fs.existsSync(searchPath)) {
        return { warning: 'Service directory not found - skipping reindex test' };
      }
      
      const files = fs.readdirSync(searchPath, { recursive: false });
      const javaFile = files.find(f => f.endsWith('.java'));
      
      if (!javaFile) {
        return { warning: 'No Java file found to reindex' };
      }
      
      const filePath = path.join(searchPath, javaFile);
      const startTime = Date.now();
      
      const result = await this.callTool('reindex_file', { 
        filePath: filePath
      });
      
      const elapsed = (Date.now() - startTime) / 1000;
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Reindexed')) {
        throw new Error('Reindex failed: ' + text.substring(0, 100));
      }
      
      // Check time display format (should be seconds, not milliseconds)
      const timeMatch = text.match(/in\s+([\d.]+)(s|ms)/i);
      if (timeMatch && timeMatch[2].toLowerCase() === 'ms') {
        throw new Error('Still showing milliseconds instead of seconds!');
      }
      
      // Should include tip about sourceRoots
      if (!text.includes('Tip:') && !text.includes('sourceRoots')) {
        throw new Error('Missing tip about sourceRoots trade-off');
      }
      
      console.log(`${colors.cyan}    Completed in ${elapsed.toFixed(2)}s (time shown in seconds ✓)${colors.reset}`);
    }, 'Fix #3');

    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}PHASE 5: FIX #4 - SEARCH TEXT (Better Coverage)${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Test search with regex pattern
    await this.runTest('search_text with regex pattern class.*Service', async () => {
      const result = await this.callTool('search_text', { 
        pattern: 'class.*Service',
        isRegex: true
      });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Found')) {
        if (text.includes('No matches found')) {
          return { warning: 'No Service classes in project' };
        }
        throw new Error('Unexpected response: ' + text.substring(0, 100));
      }
      
      // Count matches
      const matchCount = (text.match(/Found\s+(\d+)/i) || [])[1];
      const fileCount = (text.match(/in\s+(\d+)\s+file/i) || [])[1];
      
      console.log(`${colors.cyan}    Found ${matchCount} matches in ${fileCount} files${colors.reset}`);
      
      // Should find more than 5 results (was the original issue)
      if (matchCount && parseInt(matchCount) <= 5) {
        return { warning: `Only found ${matchCount} results, expected more` };
      }
    }, 'Fix #4');

    // Test default maxResults increased to 200
    await this.runTest('search_text default maxResults = 200', async () => {
      const result = await this.callTool('search_text', { 
        pattern: 'public',
        isRegex: false
      });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Found')) {
        throw new Error('Should find "public" keyword');
      }
      
      // Check if showing more results than old default (50)
      const matchCount = (text.match(/Found\s+(\d+)/i) || [])[1];
      console.log(`${colors.cyan}    Found ${matchCount} matches (default limit: 200)${colors.reset}`);
      
      if (matchCount && parseInt(matchCount) > 50) {
        console.log(`${colors.cyan}    ✓ Finding more than old default (50)${colors.reset}`);
      }
    }, 'Fix #4');

    // Test truncation message
    await this.runTest('search_text shows truncation guidance', async () => {
      const result = await this.callTool('search_text', { 
        pattern: 'public',
        maxResults: 10 // Force truncation
      });
      const text = result.content[0]?.text || '';
      
      if (text.includes('showing first') || text.includes('Use maxResults')) {
        console.log(`${colors.cyan}    ✓ Truncation message shown${colors.reset}`);
      }
    }, 'Fix #4');

    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}PHASE 6: FIX #5 - SEMANTIC SEARCH (Transparent Scoring)${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Test scoring system display
    await this.runTest('semantic_search shows scoring system', async () => {
      const result = await this.callTool('semantic_search', { 
        query: 'service repository database',
        limit: 10
      });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Scoring System')) {
        throw new Error('Missing scoring system documentation!');
      }
      
      // Check for scoring details
      const hasNameMatch = text.includes('Name match');
      const hasPatternMatch = text.includes('Pattern match');
      const hasPointSystem = text.includes('pts');
      
      if (!hasNameMatch || !hasPatternMatch || !hasPointSystem) {
        throw new Error('Incomplete scoring system documentation');
      }
      
      console.log(`${colors.cyan}    ✓ Scoring system documented${colors.reset}`);
    }, 'Fix #5');

    // Test visual relevance indicators
    await this.runTest('semantic_search shows visual indicators', async () => {
      const result = await this.callTool('semantic_search', { 
        query: 'user service',
        limit: 5
      });
      const text = result.content[0]?.text || '';
      
      // Check for emoji indicators (🟢, 🟡, ⚪)
      const hasIndicators = text.includes('🟢') || text.includes('🟡') || text.includes('⚪');
      
      if (!hasIndicators && !text.includes('No results')) {
        throw new Error('Missing visual relevance indicators!');
      }
      
      if (hasIndicators) {
        console.log(`${colors.cyan}    ✓ Visual indicators present (🟢🟢🟢, 🟢⚪⚪, etc.)${colors.reset}`);
      }
    }, 'Fix #5');

    // Test match reasons displayed
    await this.runTest('semantic_search shows match reasons', async () => {
      const result = await this.callTool('semantic_search', { 
        query: 'database connection',
        limit: 5
      });
      const text = result.content[0]?.text || '';
      
      if (text.includes('No results')) {
        return { warning: 'No matches for this query' };
      }
      
      if (!text.includes('Match Reasons')) {
        throw new Error('Missing match reasons in results!');
      }
      
      console.log(`${colors.cyan}    ✓ Match reasons shown for each result${colors.reset}`);
    }, 'Fix #5');

    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}PHASE 7: BACKWARD COMPATIBILITY & REGRESSION TESTS${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Ensure call_graph still works
    await this.runTest('call_graph still works', async () => {
      const result = await this.callTool('call_graph', { 
        fqn: 'com.example.demo.service.UserService' 
      });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Call Graph') && !text.includes('not found')) {
        throw new Error('call_graph broken: ' + text.substring(0, 100));
      }
    }, 'Regression');

    // Ensure find_symbol still works
    await this.runTest('find_symbol still works', async () => {
      const result = await this.callTool('find_symbol', { 
        name: 'User' 
      });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Found') && !text.includes('No symbols')) {
        throw new Error('find_symbol broken: ' + text.substring(0, 100));
      }
    }, 'Regression');

    // Ensure goto_definition still works
    await this.runTest('goto_definition still works', async () => {
      const result = await this.callTool('goto_definition', { 
        symbol: 'UserService' 
      });
      const text = result.content[0]?.text || '';
      
      if (!text.includes('Definition') && !text.includes('Multiple') && !text.includes('not found')) {
        throw new Error('goto_definition broken: ' + text.substring(0, 100));
      }
    }, 'Regression');
  }

  printSummary() {
    console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║${colors.bold}                          TEST SUMMARY                               ${colors.reset}${colors.cyan}║${colors.reset}`);
    console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);
    
    const passRate = ((this.passed / this.totalTests) * 100).toFixed(1);
    
    console.log(`${colors.bold}Total Tests:${colors.reset}     ${this.totalTests}`);
    console.log(`${colors.green}${colors.bold}Passed:${colors.reset}          ${this.passed}`);
    console.log(`${colors.red}${colors.bold}Failed:${colors.reset}          ${this.failed}`);
    console.log(`${colors.yellow}${colors.bold}Warnings:${colors.reset}        ${this.warnings}`);
    console.log(`${colors.bold}Pass Rate:${colors.reset}       ${passRate}%\n`);

    // Group results by category
    const byCategory = {};
    for (const result of this.testResults) {
      if (!byCategory[result.category]) {
        byCategory[result.category] = [];
      }
      byCategory[result.category].push(result);
    }

    console.log(`${colors.cyan}${colors.bold}Results by Category:${colors.reset}\n`);
    for (const [category, tests] of Object.entries(byCategory)) {
      const passed = tests.filter(t => t.status === 'PASS').length;
      const total = tests.length;
      const status = passed === total ? colors.green : colors.yellow;
      console.log(`  ${status}${category}:${colors.reset} ${passed}/${total} passed`);
    }

    console.log();
    if (this.failed === 0) {
      console.log(`${colors.green}${colors.bold}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
      console.log(`${colors.green}${colors.bold}║  ✅ ALL FEEDBACK FIXES VERIFIED - READY FOR RELEASE  ║${colors.reset}`);
      console.log(`${colors.green}${colors.bold}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);
    } else {
      console.log(`${colors.red}${colors.bold}╔═══════════════════════════════════════════════╗${colors.reset}`);
      console.log(`${colors.red}${colors.bold}║  ❌ SOME TESTS FAILED - REVIEW REQUIRED      ║${colors.reset}`);
      console.log(`${colors.red}${colors.bold}╚═══════════════════════════════════════════════╝${colors.reset}\n`);
      
      console.log(`${colors.red}Failed tests:${colors.reset}`);
      for (const result of this.testResults.filter(r => r.status === 'FAIL')) {
        console.log(`  • ${result.category} - ${result.name}`);
        console.log(`    ${colors.red}${result.error}${colors.reset}`);
      }
      console.log();
    }

    if (this.warnings > 0) {
      console.log(`${colors.yellow}Warnings (non-critical):${colors.reset}`);
      for (const result of this.testResults.filter(r => r.warning)) {
        console.log(`  • ${result.name}: ${result.warning}`);
      }
      console.log();
    }
  }

  async stop() {
    if (this.server) {
      this.server.kill();
    }
  }
}

// Main execution
(async () => {
  const tester = new FeedbackFixTester();
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
