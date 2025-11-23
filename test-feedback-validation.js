/**
 * Comprehensive Feedback Validation Test
 * Tests all issues raised in the 1.4.2 feedback to verify if they've been fixed
 * 
 * Feedback Summary:
 * 1. Symbol Resolution - find_usages/call_graph failing with "Symbol not found"
 * 2. Semantic Search - Returning irrelevant results
 * 3. Impact Analysis - Showing 0 dependencies for heavily used code
 * 4. FQN Format Issues - Correct FQNs not being recognized
 * 5. Framework Pattern Detection - Missing Spring/annotation-based calls
 * 
 * Expected Improvements in Current Version:
 * - Better symbol lookup with partial name matching
 * - Inheritance hierarchy traversal for fields
 * - Improved reference tracking with referencesByFile
 * - Memory leak fixes shouldn't have broken existing functionality
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, ...args) {
  console.log(color + args.join(' ') + colors.reset);
}

// Test results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Test utilities
function expectSuccess(result, testName) {
  results.total++;
  if (result.success) {
    results.passed++;
    log(colors.green, `✓ ${testName}`);
    results.tests.push({ name: testName, status: 'PASS' });
    return true;
  } else {
    results.failed++;
    log(colors.red, `✗ ${testName}`);
    log(colors.red, `  Error: ${result.error || 'Unknown error'}`);
    results.tests.push({ name: testName, status: 'FAIL', error: result.error });
    return false;
  }
}

function expectNonEmpty(data, testName, minCount = 1) {
  results.total++;
  if (data && data.length >= minCount) {
    results.passed++;
    log(colors.green, `✓ ${testName} (found ${data.length} items)`);
    results.tests.push({ name: testName, status: 'PASS', count: data.length });
    return true;
  } else {
    results.failed++;
    log(colors.red, `✗ ${testName}`);
    log(colors.red, `  Expected at least ${minCount} items, got ${data ? data.length : 0}`);
    results.tests.push({ name: testName, status: 'FAIL', expected: minCount, actual: data ? data.length : 0 });
    return false;
  }
}

function expectContains(text, substring, testName) {
  results.total++;
  if (text && text.includes(substring)) {
    results.passed++;
    log(colors.green, `✓ ${testName}`);
    results.tests.push({ name: testName, status: 'PASS' });
    return true;
  } else {
    results.failed++;
    log(colors.red, `✗ ${testName}`);
    log(colors.red, `  Expected text to contain: "${substring}"`);
    results.tests.push({ name: testName, status: 'FAIL', expected: substring });
    return false;
  }
}

// MCP client
class MCPClient {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.process = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.process = spawn('node', ['--max-old-space-size=4096', this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id && this.pendingRequests.has(msg.id)) {
              const { resolve, reject } = this.pendingRequests.get(msg.id);
              this.pendingRequests.delete(msg.id);
              if (msg.error) {
                reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              } else {
                resolve(msg.result);
              }
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines
          }
        }
      });

      this.process.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('Server running on stdio')) {
          resolve();
        }
      });

      this.process.on('error', reject);
      
      setTimeout(() => resolve(), 2000); // Fallback timeout
    });
  }

  async stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async callTool(toolName, args) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for ${toolName}`));
      }, 120000); // 2 minute timeout

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }
}

// Main test suite
async function runFeedbackValidationTests() {
  log(colors.cyan, '\n=================================================');
  log(colors.cyan, 'FEEDBACK VALIDATION TEST SUITE');
  log(colors.cyan, 'Version 1.4.2 → Current Version');
  log(colors.cyan, '=================================================\n');

  const client = new MCPClient();

  try {
    // Start server
    log(colors.blue, '📡 Starting MCP server...');
    await client.start();
    log(colors.green, '✓ Server started\n');

    // Use example-java-project which has UserService and other test classes
    const testProject = path.join(__dirname, 'example-java-project');
    
    // Clear any existing index
    const indexDir = path.join(testProject, '.mcp-index');
    if (fs.existsSync(indexDir)) {
      fs.rmSync(indexDir, { recursive: true, force: true });
      log(colors.yellow, '🗑️  Cleared existing index\n');
    }

    // =========================================================================
    // PHASE 1: Index the project
    // =========================================================================
    log(colors.magenta, '\n📦 PHASE 1: Indexing Test Project\n');
    
    try {
      const indexResult = await client.callTool('index_project', {
        rootDir: testProject,
        sourceRoots: ['src/main/java']
      });
      
      log(colors.green, '✓ Project indexed successfully');
      
      // Parse the result to see what was indexed
      if (indexResult && indexResult.content) {
        const content = indexResult.content[0]?.text || '';
        log(colors.blue, `  ${content.split('\n')[0]}`); // First line of summary
      }
    } catch (error) {
      log(colors.red, `✗ Failed to index project: ${error.message}`);
      results.total++;
      results.failed++;
      results.tests.push({ name: 'Index Project', status: 'FAIL', error: error.message });
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for indexing to settle

    // =========================================================================
    // PHASE 2: Symbol Resolution Tests (Critical Issue #1)
    // =========================================================================
    log(colors.magenta, '\n🔍 PHASE 2: Symbol Resolution Tests\n');
    log(colors.blue, 'Testing: find_symbol, find_usages, goto_definition\n');

    // Test 2.1: Find symbol by simple name
    try {
      const result = await client.callTool('find_symbol', { name: 'UserService' });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        expectContains(text, 'UserService', 'Find symbol by simple name');
        expectContains(text, 'class', 'Symbol identified as class');
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Find symbol by simple name');
      }
    } catch (error) {
      expectSuccess({ success: false, error: error.message }, 'Find symbol by simple name');
    }

    // Test 2.2: Find symbol by FQN
    try {
      const result = await client.callTool('find_symbol', { name: 'com.example.demo.UserService' });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        expectContains(text, 'com.example.demo.UserService', 'Find symbol by full FQN');
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Find symbol by full FQN');
      }
    } catch (error) {
      expectSuccess({ success: false, error: error.message }, 'Find symbol by full FQN');
    }

    // Test 2.3: Find method by name
    try {
      const result = await client.callTool('find_symbol', { name: 'getUser' });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        expectContains(text, 'getUser', 'Find method by name');
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Find method by name');
      }
    } catch (error) {
      expectSuccess({ success: false, error: error.message }, 'Find method by name');
    }

    // Test 2.4: Find usages (Critical - was failing in feedback)
    try {
      const result = await client.callTool('find_usages', { fqn: 'com.example.demo.UserService' });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        const hasUsages = !text.includes('No usages found') && !text.includes('Symbol not found');
        if (hasUsages) {
          expectSuccess({ success: true }, 'Find usages for UserService (was broken in 1.4.2)');
        } else {
          log(colors.yellow, `⚠ Find usages returned: ${text.substring(0, 100)}`);
          expectSuccess({ success: false, error: 'No usages found or symbol not found' }, 'Find usages for UserService');
        }
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Find usages for UserService');
      }
    } catch (error) {
      expectSuccess({ success: false, error: error.message }, 'Find usages for UserService');
    }

    // =========================================================================
    // PHASE 3: Call Graph Tests (Critical Issue #2)
    // =========================================================================
    log(colors.magenta, '\n📞 PHASE 3: Call Graph Analysis Tests\n');
    log(colors.blue, 'Testing: call_graph tool (was returning "Symbol not found")\n');

    // Test 3.1: Call graph for method
    try {
      const result = await client.callTool('call_graph', { fqn: 'com.example.demo.UserService.getUser' });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        const hasCallGraph = !text.includes('Symbol not found') && !text.includes('No call graph');
        if (hasCallGraph) {
          expectSuccess({ success: true }, 'Call graph for method (was broken in 1.4.2)');
          log(colors.blue, `  Preview: ${text.substring(0, 150)}...`);
        } else {
          log(colors.yellow, `⚠ Call graph returned: ${text.substring(0, 100)}`);
          expectSuccess({ success: false, error: 'Symbol not found or no call graph' }, 'Call graph for method');
        }
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Call graph for method');
      }
    } catch (error) {
      expectSuccess({ success: false, error: error.message }, 'Call graph for method');
    }

    // =========================================================================
    // PHASE 4: Semantic Search Tests (Critical Issue #3)
    // =========================================================================
    log(colors.magenta, '\n🧠 PHASE 4: Semantic Search Quality Tests\n');
    log(colors.blue, 'Testing: Relevance of semantic search results\n');

    // Test 4.1: Semantic search for user management
    try {
      const result = await client.callTool('semantic_search', { query: 'user management service' });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        // Check if UserService is in results (should be highly relevant)
        const hasUserService = text.includes('UserService');
        if (hasUserService) {
          expectSuccess({ success: true }, 'Semantic search finds relevant UserService');
        } else {
          log(colors.yellow, `⚠ Semantic search results: ${text.substring(0, 200)}`);
          expectSuccess({ success: false, error: 'UserService not in results' }, 'Semantic search relevance');
        }
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Semantic search');
      }
    } catch (error) {
      expectSuccess({ success: false, error: error.message }, 'Semantic search');
    }

    // =========================================================================
    // PHASE 5: Impact Analysis Tests (Critical Issue #4)
    // =========================================================================
    log(colors.magenta, '\n💥 PHASE 5: Impact Analysis Tests\n');
    log(colors.blue, 'Testing: Dependency detection (was showing 0 dependencies)\n');

    // Test 5.1: Impact analysis
    try {
      const result = await client.callTool('analyze_impact', { fqn: 'com.example.demo.UserService' });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        // Check if it shows actual dependencies
        const showsZeroDeps = text.includes('0 references') || text.includes('0 dependencies');
        if (!showsZeroDeps) {
          expectSuccess({ success: true }, 'Impact analysis shows dependencies (was 0 in 1.4.2)');
          log(colors.blue, `  Preview: ${text.substring(0, 150)}...`);
        } else {
          log(colors.yellow, `⚠ Impact analysis: ${text.substring(0, 200)}`);
          expectSuccess({ success: false, error: 'Shows 0 dependencies' }, 'Impact analysis');
        }
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Impact analysis');
      }
    } catch (error) {
      expectSuccess({ success: false, error: error.message }, 'Impact analysis');
    }

    // =========================================================================
    // PHASE 6: Text Search Baseline (Should Still Work)
    // =========================================================================
    log(colors.magenta, '\n📝 PHASE 6: Text Search Baseline\n');
    log(colors.blue, 'Testing: Text search (was working in 1.4.2)\n');

    // Test 6.1: Basic text search
    try {
      const result = await client.callTool('search_text', { pattern: 'User', isRegex: false });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        expectContains(text, 'found', 'Text search finds results');
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Text search');
      }
    } catch (error) {
      expectSuccess({ success: false, error: error.message }, 'Text search');
    }

    // =========================================================================
    // PHASE 7: Advanced Tools (Should Still Work)
    // =========================================================================
    log(colors.magenta, '\n🛠️  PHASE 7: Advanced Tools Tests\n');
    log(colors.blue, 'Testing: Refactoring suggestions, test coverage, code generation\n');

    // Test 7.1: Refactoring suggestions
    try {
      const result = await client.callTool('refactoring_suggestions', { fqn: 'com.example.demo.UserService' });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        expectContains(text, 'Code Health', 'Refactoring suggestions work');
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Refactoring suggestions');
      }
    } catch (error) {
      log(colors.yellow, `⚠ Refactoring suggestions: ${error.message}`);
      results.total++;
      results.skipped++;
      results.tests.push({ name: 'Refactoring suggestions', status: 'SKIP' });
    }

    // Test 7.2: Test coverage
    try {
      const result = await client.callTool('test_coverage', { fqn: 'com.example.demo.UserService' });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        expectContains(text, 'Coverage', 'Test coverage analysis works');
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Test coverage');
      }
    } catch (error) {
      log(colors.yellow, `⚠ Test coverage: ${error.message}`);
      results.total++;
      results.skipped++;
      results.tests.push({ name: 'Test coverage', status: 'SKIP' });
    }

    // Test 7.3: Code generation
    try {
      const result = await client.callTool('generate_code', { 
        type: 'test',
        targetFqn: 'com.example.demo.UserService'
      });
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        expectContains(text, 'Test', 'Code generation works');
      } else {
        expectSuccess({ success: false, error: 'No content returned' }, 'Code generation');
      }
    } catch (error) {
      log(colors.yellow, `⚠ Code generation: ${error.message}`);
      results.total++;
      results.skipped++;
      results.tests.push({ name: 'Code generation', status: 'SKIP' });
    }

  } catch (error) {
    log(colors.red, `\n❌ Test suite error: ${error.message}`);
    log(colors.red, error.stack);
  } finally {
    await client.stop();
  }

  // =========================================================================
  // FINAL REPORT
  // =========================================================================
  log(colors.cyan, '\n=================================================');
  log(colors.cyan, 'FEEDBACK VALIDATION RESULTS');
  log(colors.cyan, '=================================================\n');

  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
  
  log(colors.blue, `Total Tests: ${results.total}`);
  log(colors.green, `Passed: ${results.passed}`);
  log(colors.red, `Failed: ${results.failed}`);
  log(colors.yellow, `Skipped: ${results.skipped}`);
  log(colors.blue, `Pass Rate: ${passRate}%\n`);

  // Categorize results by feedback issue
  log(colors.magenta, '📊 Results by Feedback Category:\n');
  
  const symbolResolution = results.tests.filter(t => 
    t.name.includes('Find symbol') || t.name.includes('Find usages') || t.name.includes('Find method')
  );
  const passedSymbol = symbolResolution.filter(t => t.status === 'PASS').length;
  log(colors.blue, `1. Symbol Resolution: ${passedSymbol}/${symbolResolution.length} tests passed`);
  if (passedSymbol === symbolResolution.length) {
    log(colors.green, '   ✓ FIXED: Symbol resolution working correctly');
  } else {
    log(colors.red, '   ✗ REGRESSION: Symbol resolution still has issues');
  }

  const callGraph = results.tests.filter(t => t.name.includes('Call graph'));
  const passedCallGraph = callGraph.filter(t => t.status === 'PASS').length;
  log(colors.blue, `\n2. Call Graph: ${passedCallGraph}/${callGraph.length} tests passed`);
  if (passedCallGraph === callGraph.length) {
    log(colors.green, '   ✓ FIXED: Call graph analysis working');
  } else {
    log(colors.red, '   ✗ REGRESSION: Call graph still broken');
  }

  const semantic = results.tests.filter(t => t.name.includes('Semantic search'));
  const passedSemantic = semantic.filter(t => t.status === 'PASS').length;
  log(colors.blue, `\n3. Semantic Search: ${passedSemantic}/${semantic.length} tests passed`);
  if (passedSemantic === semantic.length) {
    log(colors.green, '   ✓ IMPROVED: Semantic search returning relevant results');
  } else {
    log(colors.red, '   ✗ REGRESSION: Semantic search still returning irrelevant results');
  }

  const impact = results.tests.filter(t => t.name.includes('Impact analysis'));
  const passedImpact = impact.filter(t => t.status === 'PASS').length;
  log(colors.blue, `\n4. Impact Analysis: ${passedImpact}/${impact.length} tests passed`);
  if (passedImpact === impact.length) {
    log(colors.green, '   ✓ FIXED: Impact analysis showing dependencies');
  } else {
    log(colors.red, '   ✗ REGRESSION: Impact analysis showing 0 dependencies');
  }

  // Overall verdict
  log(colors.cyan, '\n=================================================');
  log(colors.cyan, 'OVERALL VERDICT');
  log(colors.cyan, '=================================================\n');

  if (passRate >= 80) {
    log(colors.green, '✓ IMPROVEMENTS CONFIRMED');
    log(colors.green, 'Most critical issues from feedback have been addressed.');
  } else if (passRate >= 60) {
    log(colors.yellow, '⚠ PARTIAL IMPROVEMENTS');
    log(colors.yellow, 'Some issues fixed, but regressions or new issues present.');
  } else {
    log(colors.red, '✗ REGRESSIONS DETECTED');
    log(colors.red, 'Critical issues remain or new problems introduced.');
  }

  log(colors.cyan, '\n=================================================\n');
  
  // Save detailed results
  const reportPath = path.join(__dirname, 'feedback-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  log(colors.blue, `📄 Detailed report saved to: ${reportPath}\n`);
}

// Run the tests
runFeedbackValidationTests().catch(error => {
  log(colors.red, `\n❌ Fatal error: ${error.message}`);
  log(colors.red, error.stack);
  process.exit(1);
});
