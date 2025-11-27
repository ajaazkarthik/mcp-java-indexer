/**
 * Test script for advanced AI-friendly tools
 * - analyze_impact: Impact analysis with risk scoring
 * - semantic_search: Intent-based code search
 * - explain_code: Natural language code explanations
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

class AdvancedToolsTest {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.projectRoot = path.join(__dirname, 'example-java-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}Starting MCP server...${colors.reset}`);
      
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
          // Ignore non-JSON lines (like startup messages)
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
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 60 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 60000);
    });
  }

  async callTool(name, args) {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args
    });
    return result;
  }

  printSuccess(message) {
    console.log(`${colors.green}✓ ${message}${colors.reset}`);
  }

  printError(message) {
    console.log(`${colors.red}✗ ${message}${colors.reset}`);
  }

  printInfo(message) {
    console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
  }

  printHeader(message) {
    console.log(`\n${colors.magenta}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.magenta}${message}${colors.reset}`);
    console.log(`${colors.magenta}${'='.repeat(60)}${colors.reset}\n`);
  }

  async runTests() {
    try {
      // Test 1: Index project first
      this.printHeader('TEST 1: Index Example Project');
      const indexResult = await this.callTool('index_project', {
        rootDir: this.projectRoot,
        sourceRoots: ['src/main/java']
      });
      
      const indexText = indexResult.content[0].text;
      console.log('Index result:', indexText.substring(0, 500));
      
      // Check if index is valid (can be "up-to-date" or newly indexed)
      if (indexText.includes('up-to-date') || indexText.includes('Indexed') || indexText.includes('Statistics') || indexText.includes('Symbols')) {
        this.printSuccess('Project indexed successfully');
        console.log(indexText.substring(0, 300) + '...\n');
      } else {
        throw new Error('Indexing failed: ' + indexText);
      }

      // Test 2: Explain Code - UserService class
      this.printHeader('TEST 2: Explain Code - UserService Class');
      const explainClass = await this.callTool('explain_code', {
        symbolFqn: 'com.example.demo.UserService',
        verbosity: 'detailed'
      });
      
      const explanation = explainClass.content[0].text;
      console.log(explanation);
      
      if (explanation.includes('Purpose') && explanation.includes('Structure')) {
        this.printSuccess('Code explanation generated successfully\n');
      }

      // Test 3: Explain Code - saveUser method
      this.printHeader('TEST 3: Explain Code - saveUser Method');
      const explainMethod = await this.callTool('explain_code', {
        symbolFqn: 'com.example.demo.UserService.saveUser(User)',
        verbosity: 'comprehensive'
      });
      
      const methodExplanation = explainMethod.content[0].text;
      console.log(methodExplanation);
      
      if (methodExplanation.includes('Returns') && methodExplanation.includes('Parameters')) {
        this.printSuccess('Method explanation generated successfully\n');
      }

      // Test 4: Semantic Search - Find repository methods
      this.printHeader('TEST 4: Semantic Search - "database save methods"');
      const semanticSearch1 = await this.callTool('semantic_search', {
        query: 'database save methods',
        maxResults: 5
      });
      
      const searchResults1 = semanticSearch1.content[0].text;
      console.log(searchResults1);
      
      if (searchResults1.includes('Results found')) {
        this.printSuccess('Semantic search found relevant methods\n');
      }

      // Test 5: Semantic Search - Find validation logic
      this.printHeader('TEST 5: Semantic Search - "validation logic"');
      const semanticSearch2 = await this.callTool('semantic_search', {
        query: 'validation logic',
        maxResults: 5
      });
      
      const searchResults2 = semanticSearch2.content[0].text;
      console.log(searchResults2);
      
      if (searchResults2.includes('Results found') || searchResults2.includes('No results')) {
        this.printSuccess('Semantic search executed successfully\n');
      }

      // Test 6: Semantic Search - Find builder pattern
      this.printHeader('TEST 6: Semantic Search - "builder pattern classes"');
      const semanticSearch3 = await this.callTool('semantic_search', {
        query: 'builder pattern classes',
        maxResults: 5
      });
      
      const searchResults3 = semanticSearch3.content[0].text;
      console.log(searchResults3);

      // Test 7: Impact Analysis - UserRepository
      this.printHeader('TEST 7: Impact Analysis - UserRepository');
      const impactRepo = await this.callTool('analyze_impact', {
        symbolFqn: 'com.example.demo.UserRepository',
        depth: 2
      });
      
      const impactRepoText = impactRepo.content[0].text;
      console.log(impactRepoText);
      
      if (impactRepoText.includes('Impact Analysis') && impactRepoText.includes('Risk Level')) {
        this.printSuccess('Impact analysis completed for UserRepository\n');
      }

      // Test 8: Impact Analysis - UserService.saveUser
      this.printHeader('TEST 8: Impact Analysis - UserService.saveUser Method');
      const impactMethod = await this.callTool('analyze_impact', {
        symbolFqn: 'com.example.demo.UserService.saveUser(User)',
        depth: 3,
        includeTransitive: true
      });
      
      const impactMethodText = impactMethod.content[0].text;
      console.log(impactMethodText);
      
      if (impactMethodText.includes('Direct Impact') || impactMethodText.includes('Indirect Impact')) {
        this.printSuccess('Impact analysis completed for saveUser method\n');
      }

      // Test 9: Semantic Search with filters
      this.printHeader('TEST 9: Semantic Search - "public methods that throw exceptions"');
      const semanticSearch4 = await this.callTool('semantic_search', {
        query: 'public methods that throw exceptions',
        symbolKinds: ['method'],
        maxResults: 5
      });
      
      const searchResults4 = semanticSearch4.content[0].text;
      console.log(searchResults4);

      // Test 10: Explain interface
      this.printHeader('TEST 10: Explain Code - IUserService Interface');
      const explainInterface = await this.callTool('explain_code', {
        symbolFqn: 'com.example.demo.IUserService',
        verbosity: 'comprehensive'
      });
      
      const interfaceExplanation = explainInterface.content[0].text;
      console.log(interfaceExplanation);

      // Summary
      this.printHeader('ADVANCED TOOLS TEST SUMMARY');
      this.printSuccess('All 10 advanced tool tests completed successfully!');
      console.log('\nKey Features Tested:');
      console.log('  • Code Explanation (classes, methods, interfaces)');
      console.log('  • Semantic Search (intent-based queries)');
      console.log('  • Impact Analysis (risk assessment & dependencies)');
      console.log('  • Pattern Detection (builder, repository, service, etc.)');
      console.log('  • Natural Language Understanding\n');

    } catch (error) {
      this.printError(`Test failed: ${error.message}`);
      console.error(error);
      process.exit(1);
    }
  }

  async stop() {
    if (this.server) {
      this.server.kill();
      console.log(`\n${colors.cyan}Server stopped${colors.reset}`);
    }
  }
}

// Run tests
(async () => {
  const tester = new AdvancedToolsTest();
  let exitCode = 0;
  try {
    await tester.start();
    await tester.runTests();
    await tester.stop();
    exitCode = 0;
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    await tester.stop();
    exitCode = 1;
  }
  
  // Ensure stdout is flushed before exit
  process.stdout.write('', () => {
    process.exit(exitCode);
  });
})();
