/**
 * Large Project Validation Suite for MCP Java Indexer
 * - Targets the synthetic 12k+ file Maven project generated under large-java-project/
 * - Exercises every MCP tool with additional semantic_search and goto_definition assertions
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

class LargeProjectTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.projectRoot = path.join(__dirname, 'large-java-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    this.totalTests = 0;
    this.passed = 0;
    this.failed = 0;
    this.testResults = [];
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}${colors.bold}Starting Large Project MCP Test Suite${colors.reset}`);
      console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);

      this.server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=6144'
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
      const timeout = isIndexProject ? 900000 : 180000; // up to 15 minutes for indexing

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout after ${timeout / 1000}s for ${params?.name || method}`));
        }
      }, timeout);
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
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      this.failed++;
      this.testResults.push({ name, status: 'FAIL', error: error.message });
      console.log(`${colors.red}  ✗ FAIL${colors.reset}`);
      console.log(`${colors.red}    ${error.message}${colors.reset}\n`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  parseNumberFromText(text, label) {
    const regex = new RegExp(`${label}:\\s*(\\d+)`);
    const match = text.match(regex);
    return match ? Number(match[1]) : null;
  }

  async runAllTests() {
    const componentFqn = 'com.largeproj.pkg005.Component005_010';
    const serviceFqn = 'com.largeproj.pkg005.PackageService005';
    const megaAppFqn = 'com.largeproj.app.MegaApplication';
    const componentFile = path.join(this.projectRoot, 'src', 'main', 'java', 'com', 'largeproj', 'pkg005', 'Component005_010.java');

    await this.runTest('index_project - Large synthetic Maven project', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.projectRoot,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Indexed') || !text.includes('Statistics')) {
        throw new Error('Index summary missing expected markers');
      }
      const filesIndexed = this.parseNumberFromText(text, 'Indexed Files');
      if (!filesIndexed || filesIndexed < 12000) {
        throw new Error(`Expected >= 12000 indexed files but saw ${filesIndexed}`);
      }
      const symbols = this.parseNumberFromText(text, 'Symbols');
      if (!symbols || symbols < 40000) {
        throw new Error(`Expected >= 40000 symbols but saw ${symbols}`);
      }
    });

    await this.runTest('find_symbol - Component class lookup', async () => {
      const result = await this.callTool('find_symbol', { name: componentFqn });
      const text = result.content[0]?.text || '';
      if (!text.includes(componentFqn) || !text.includes('Component005_010')) {
        throw new Error('Component symbol details missing');
      }
    });

    await this.runTest('goto_definition - Component source mapping', async () => {
      const result = await this.callTool('goto_definition', { symbolName: componentFqn });
      const text = result.content[0]?.text || '';
      if (!text.includes('Component005_010.java')) {
        throw new Error('Goto definition did not resolve component file');
      }
    });

    await this.runTest('goto_definition - MegaApplication mapping', async () => {
      const result = await this.callTool('goto_definition', { symbolName: megaAppFqn });
      const text = result.content[0]?.text || '';
      if (!text.includes('MegaApplication.java')) {
        throw new Error('Goto definition did not resolve MegaApplication');
      }
    });

    await this.runTest('find_usages - Package service references', async () => {
      const result = await this.callTool('find_usages', { fqn: serviceFqn });
      const text = result.content[0]?.text || '';
      if (!text.includes('MegaApplication.java')) {
        throw new Error('Expected MegaApplication usage for package service');
      }
    });

    await this.runTest('call_graph - Service streamMetrics', async () => {
      const methodFqn = `${serviceFqn}.streamMetrics(ComponentContext)`;
      const result = await this.callTool('call_graph', { fqn: methodFqn });
      const text = result.content[0]?.text || '';
      if (!text.includes('Call Graph') && !text.includes('Outbound')) {
        throw new Error('Call graph output missing expected structure');
      }
    });

    await this.runTest('search_text - Telemetry keyword sweep', async () => {
      const result = await this.callTool('search_text', {
        pattern: 'telemetry metrics aggregator',
        maxResults: 5
      });
      const text = result.content[0]?.text || '';
      if (!text.toLowerCase().includes('telemetry')) {
        throw new Error('Search results missing telemetry keyword');
      }
    });

    await this.runTest('reindex_file - Component005_010 incremental', async () => {
      const result = await this.callTool('reindex_file', {
        filePath: componentFile,
        sourceRoots: ['src/main/java']
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Reindexed') && !text.includes('Skipped')) {
        throw new Error('Reindex response missing status');
      }
    });

    await this.runTest('analyze_impact - MegaApplication fan-out', async () => {
      const result = await this.callTool('analyze_impact', {
        symbolFqn: megaAppFqn,
        depth: 2
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Impact Analysis')) {
        throw new Error('Impact analysis output missing header');
      }
    });

    await this.runTest('semantic_search - Aggregator services', async () => {
      const result = await this.callTool('semantic_search', {
        query: 'telemetry metrics aggregator service',
        limit: 5,
        scope: 'classes'
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Semantic Search Results')) {
        throw new Error('Semantic search missing results header');
      }
      if (!text.includes('PackageService')) {
        throw new Error('Semantic search failed to surface package services');
      }
    });

    await this.runTest('semantic_search - Component topology intent', async () => {
      const result = await this.callTool('semantic_search', {
        query: 'component topology handoff',
        limit: 5,
        scope: 'classes'
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Semantic Search Results')) {
        throw new Error('Second semantic search missing results header');
      }
      if (!text.includes('Component')) {
        throw new Error('Semantic search did not highlight component classes');
      }
    });

    await this.runTest('explain_code - PackageService deep dive', async () => {
      const result = await this.callTool('explain_code', {
        symbolFqn: serviceFqn,
        verbosity: 'detailed'
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Code Explanation') || !text.includes('PackageService005')) {
        throw new Error('Explain code output missing expected identifiers');
      }
    });

    await this.runTest('test_coverage - PackageService005', async () => {
      const result = await this.callTool('test_coverage', {
        symbolFqn: serviceFqn,
        includeIndirect: true
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Coverage') || !text.includes('Summary')) {
        throw new Error('Coverage summary missing keywords');
      }
    });

    await this.runTest('refactoring_suggestions - PackageService005', async () => {
      const result = await this.callTool('refactoring_suggestions', {
        symbolFqn: serviceFqn,
        analysisDepth: 'thorough'
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Refactoring') || !text.includes('Health Score')) {
        throw new Error('Refactoring suggestions missing expected sections');
      }
    });

    await this.runTest('code_generation - Telemetry builder scaffold', async () => {
      const result = await this.callTool('code_generation', {
        pattern: 'builder',
        targetName: 'TelemetryRecord',
        packageName: 'com.largeproj.generated'
      });
      const text = result.content[0]?.text || '';
      if (!text.includes('Generated Code') || !text.includes('TelemetryRecordBuilder')) {
        throw new Error('Code generation did not produce builder snippet');
      }
    });
  }

  printSummary() {
    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}LARGE PROJECT TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
    const passRate = ((this.passed / this.totalTests) * 100).toFixed(1);
    console.log(`${colors.bold}Total Tests:${colors.reset} ${this.totalTests}`);
    console.log(`${colors.green}${colors.bold}Passed:${colors.reset} ${this.passed}`);
    console.log(`${colors.red}${colors.bold}Failed:${colors.reset} ${this.failed}`);
    console.log(`${colors.bold}Pass Rate:${colors.reset} ${passRate}%\n`);

    this.testResults.forEach((result, idx) => {
      const status = result.status === 'PASS'
        ? `${colors.green}✓ PASS${colors.reset}`
        : `${colors.red}✗ FAIL${colors.reset}`;
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`  ${idx + 1}. ${result.name}: ${status}${duration}`);
      if (result.error) {
        console.log(`     ${colors.red}Error: ${result.error}${colors.reset}`);
      }
    });

    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);

    return this.failed === 0;
  }

  async stop() {
    if (this.server) {
      this.server.kill();
      console.log(`${colors.cyan}Server stopped${colors.reset}\n`);
    }
  }
}

(async () => {
  const tester = new LargeProjectTester();
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
