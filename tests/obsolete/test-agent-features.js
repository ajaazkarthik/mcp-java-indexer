/**
 * Comprehensive Test Suite for Agent-Friendly Features
 * Tests: explore_class, batch_query, Resources API, Prompts API
 * 
 * 5 Complex Use Cases:
 * 1. Understanding a complex service class and its ecosystem
 * 2. Refactoring impact analysis for a core class
 * 3. Tracing execution flow through multiple layers
 * 4. Batch discovery of related components
 * 5. Code pattern analysis across a project
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MCPTestClient {
  constructor() {
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async start() {
    const serverPath = join(__dirname, 'server', 'dist', 'index.js');
    
    this.process = spawn('node', ['--max-old-space-size=4096', serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr.on('data', (data) => {
      // Silently ignore stderr for cleaner output
    });

    // Initialize MCP
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });

    return this;
  }

  processBuffer() {
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
        // Skip non-JSON lines
      }
    }
  }

  sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }) + '\n';

      this.process.stdin.write(request);

      // Timeout after 120 seconds (for large project indexing)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 120000);
    });
  }

  async callTool(name, args) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async listTools() {
    return this.sendRequest('tools/list', {});
  }

  async listResources() {
    return this.sendRequest('resources/list', {});
  }

  async readResource(uri) {
    return this.sendRequest('resources/read', { uri });
  }

  async listPrompts() {
    return this.sendRequest('prompts/list', {});
  }

  async getPrompt(name, args) {
    return this.sendRequest('prompts/get', { name, arguments: args });
  }

  async stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

// Test result tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '', duration = 0) {
  testResults.tests.push({ name, passed, details, duration });
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name} (${duration}ms)`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}: ${details}`);
  }
}

function logSection(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 ${title}`);
  console.log('='.repeat(60));
}

async function runTests() {
  const client = new MCPTestClient();
  
  try {
    console.log('🚀 Starting MCP Java Indexer Agent Feature Tests\n');
    
    await client.start();
    console.log('✓ MCP Server started\n');

    // ===============================================
    // PHASE 1: Test New APIs Existence
    // ===============================================
    logSection('PHASE 1: API Availability Tests');

    // Test 1.1: List Tools (check for new tools)
    let start = Date.now();
    const tools = await client.listTools();
    const toolNames = tools.tools.map(t => t.name);
    
    const newTools = ['explore_class', 'batch_query'];
    const foundNewTools = newTools.filter(t => toolNames.includes(t));
    logTest(
      'New agent tools available',
      foundNewTools.length === newTools.length,
      `Found: ${foundNewTools.join(', ')}. Missing: ${newTools.filter(t => !toolNames.includes(t)).join(', ')}`,
      Date.now() - start
    );

    // Test 1.2: List Resources
    start = Date.now();
    try {
      const resources = await client.listResources();
      const resourceUris = resources.resources?.map(r => r.uri) || [];
      const expectedResources = ['java-index://stats', 'java-index://symbols', 'java-index://files'];
      const foundResources = expectedResources.filter(r => resourceUris.includes(r));
      logTest(
        'Resources API available',
        foundResources.length === expectedResources.length,
        `Found: ${foundResources.length}/${expectedResources.length} resources`,
        Date.now() - start
      );
    } catch (e) {
      logTest('Resources API available', false, e.message, Date.now() - start);
    }

    // Test 1.3: List Prompts
    start = Date.now();
    try {
      const prompts = await client.listPrompts();
      const promptNames = prompts.prompts?.map(p => p.name) || [];
      const expectedPrompts = ['understand-class', 'refactor-safely', 'find-pattern', 'trace-flow'];
      const foundPrompts = expectedPrompts.filter(p => promptNames.includes(p));
      logTest(
        'Prompts API available',
        foundPrompts.length === expectedPrompts.length,
        `Found: ${foundPrompts.join(', ')}`,
        Date.now() - start
      );
    } catch (e) {
      logTest('Prompts API available', false, e.message, Date.now() - start);
    }

    // ===============================================
    // PHASE 2: Index Projects
    // ===============================================
    logSection('PHASE 2: Index Test Projects');

    // Index example-java-project
    console.log('\n📂 Indexing example-java-project...');
    start = Date.now();
    const exampleProjectPath = join(__dirname, 'example-java-project');
    const indexResult1 = await client.callTool('index_project', { 
      rootDir: exampleProjectPath 
    });
    const indexTime1 = Date.now() - start;
    const indexed1 = !indexResult1.isError;
    logTest('Index example-java-project', indexed1, 
      indexed1 ? `Indexed successfully` : indexResult1.content?.[0]?.text,
      indexTime1);

    // Index large-java-project
    console.log('\n📂 Indexing large-java-project...');
    start = Date.now();
    const largeProjectPath = join(__dirname, 'large-java-project');
    const indexResult2 = await client.callTool('index_project', { 
      rootDir: largeProjectPath 
    });
    const indexTime2 = Date.now() - start;
    const indexed2 = !indexResult2.isError;
    logTest('Index large-java-project', indexed2,
      indexed2 ? `Indexed successfully` : indexResult2.content?.[0]?.text,
      indexTime2);

    // ===============================================
    // PHASE 3: Resources API Deep Test
    // ===============================================
    logSection('PHASE 3: Resources API Tests');

    // Test stats resource
    start = Date.now();
    try {
      const stats = await client.readResource('java-index://stats');
      const statsContent = stats.contents?.[0]?.text || '';
      const hasSymbols = statsContent.includes('symbols') || statsContent.includes('Symbol');
      logTest(
        'Read java-index://stats resource',
        hasSymbols && statsContent.length > 50,
        `Content length: ${statsContent.length} chars`,
        Date.now() - start
      );
      console.log('   Stats preview:', statsContent.substring(0, 200) + '...');
    } catch (e) {
      logTest('Read java-index://stats resource', false, e.message, Date.now() - start);
    }

    // Test symbols resource
    start = Date.now();
    try {
      const symbols = await client.readResource('java-index://symbols');
      const symbolsContent = symbols.contents?.[0]?.text || '';
      logTest(
        'Read java-index://symbols resource',
        symbolsContent.length > 100,
        `Content length: ${symbolsContent.length} chars`,
        Date.now() - start
      );
      console.log('   Symbols preview:', symbolsContent.substring(0, 200) + '...');
    } catch (e) {
      logTest('Read java-index://symbols resource', false, e.message, Date.now() - start);
    }

    // Test files resource
    start = Date.now();
    try {
      const files = await client.readResource('java-index://files');
      const filesContent = files.contents?.[0]?.text || '';
      const hasJavaFiles = filesContent.includes('.java');
      logTest(
        'Read java-index://files resource',
        hasJavaFiles,
        `Contains .java files: ${hasJavaFiles}`,
        Date.now() - start
      );
    } catch (e) {
      logTest('Read java-index://files resource', false, e.message, Date.now() - start);
    }

    // ===============================================
    // PHASE 4: Prompts API Deep Test
    // ===============================================
    logSection('PHASE 4: Prompts API Tests');

    const promptTests = [
      { name: 'understand-class', args: { className: 'UserService' } },
      { name: 'refactor-safely', args: { symbolFqn: 'com.example.service.UserService' } },
      { name: 'find-pattern', args: { pattern: 'Repository', description: 'data access classes' } },
      { name: 'trace-flow', args: { entryPoint: 'com.example.api.UserController.getUser(Long)' } }
    ];

    for (const pt of promptTests) {
      start = Date.now();
      try {
        const prompt = await client.getPrompt(pt.name, pt.args);
        const hasMessages = prompt.messages && prompt.messages.length > 0;
        const messageContent = prompt.messages?.[0]?.content?.text || '';
        logTest(
          `Prompt: ${pt.name}`,
          hasMessages && messageContent.length > 50,
          `Generated ${prompt.messages?.length || 0} messages, ${messageContent.length} chars`,
          Date.now() - start
        );
        console.log('   Prompt preview:', messageContent.substring(0, 150) + '...');
      } catch (e) {
        logTest(`Prompt: ${pt.name}`, false, e.message, Date.now() - start);
      }
    }

    // ===============================================
    // PHASE 5: Complex Use Cases
    // ===============================================
    logSection('PHASE 5: Complex Use Cases on large-java-project');

    // First find some real classes in large-java-project
    console.log('\n🔍 Discovering classes in large-java-project...');
    const findResult = await client.callTool('find_symbol', { name: 'Service' });
    const findText = findResult.content?.[0]?.text || '';
    console.log('   Found services:', findText.substring(0, 300));

    // Extract a real service class name from the results
    const serviceMatch = findText.match(/com\.largeproj\.[a-z0-9]+\.Package[A-Za-z0-9]+/);
    const realServiceClass = serviceMatch ? serviceMatch[0].split('.').pop() : 'PackageService079';
    const realServiceFqn = serviceMatch ? serviceMatch[0] : 'com.largeproj.pkg079.PackageService079';
    console.log(`   Using real class: ${realServiceClass} (${realServiceFqn})`);

    // Use Case 1: Understanding a complex service class
    logSection('USE CASE 1: Deep Class Understanding');
    console.log('Goal: Understand a service class and its full ecosystem in ONE call');
    
    start = Date.now();
    const exploreResult = await client.callTool('explore_class', { 
      className: realServiceClass 
    });
    const exploreTime = Date.now() - start;
    const exploreText = exploreResult.content?.[0]?.text || '';
    
    const hasOverview = exploreText.includes('Overview') || exploreText.includes('overview');
    const hasInheritance = exploreText.includes('inherit') || exploreText.includes('Inherit') || exploreText.includes('extends');
    const hasMembers = exploreText.includes('method') || exploreText.includes('Method') || exploreText.includes('field');
    const hasDependencies = exploreText.includes('depend') || exploreText.includes('Depend') || exploreText.includes('uses');
    const classFound = !exploreText.includes('Class not found');
    
    logTest(
      'explore_class returns comprehensive info',
      classFound && exploreText.length > 200,
      `Found: ${classFound}, Content: ${exploreText.length} chars, Overview: ${hasOverview}, Inheritance: ${hasInheritance}, Members: ${hasMembers}`,
      exploreTime
    );
    
    // Calculate what this would cost in traditional API calls
    const traditionalCallsNeeded = 5; // find_symbol + find_usages + call_graph (inbound) + call_graph (outbound) + inheritance
    console.log(`   📊 Agent Efficiency: 1 call vs ${traditionalCallsNeeded} traditional calls`);
    console.log('   Result preview:', exploreText.substring(0, 500) + '...');

    // Use Case 2: Refactoring Impact Analysis
    logSection('USE CASE 2: Refactoring Impact Analysis');
    console.log('Goal: Find ALL places affected by changing a class');

    start = Date.now();
    const usagesResult = await client.callTool('find_usages', { fqn: realServiceFqn });
    const usagesTime = Date.now() - start;
    const usagesText = usagesResult.content?.[0]?.text || '';
    
    logTest(
      'find_usages for refactoring impact',
      !usagesResult.isError,
      `Found usages for ${realServiceFqn}`,
      usagesTime
    );
    console.log('   Usages preview:', usagesText.substring(0, 300) + '...');

    // Use Case 3: Execution Flow Tracing
    logSection('USE CASE 3: Execution Flow Tracing');
    console.log('Goal: Trace call flow through multiple layers');

    // Find a method in the class
    const methodMatch = findText.match(/com\.largeproj\.[a-z0-9.]+\.[a-zA-Z]+\([^)]*\)/);
    const realMethodFqn = methodMatch ? methodMatch[0] : `${realServiceFqn}.process()`;

    start = Date.now();
    const callGraphResult = await client.callTool('call_graph', {
      fqn: realMethodFqn,
      depth: 2,
      inbound: false
    });
    const callGraphTime = Date.now() - start;
    const callGraphText = callGraphResult.content?.[0]?.text || '';

    logTest(
      'call_graph with depth for flow tracing',
      !callGraphResult.isError,
      `Traced calls from ${realMethodFqn}`,
      callGraphTime
    );
    console.log('   Call graph preview:', callGraphText.substring(0, 300) + '...');

    // Use Case 4: Batch Discovery
    logSection('USE CASE 4: Batch Discovery of Related Components');
    console.log('Goal: Find multiple related components in ONE call');

    start = Date.now();
    const batchResult = await client.callTool('batch_query', {
      queries: [
        { tool: 'find_symbol', args: { name: 'Controller' } },
        { tool: 'find_symbol', args: { name: 'Service' } },
        { tool: 'find_symbol', args: { name: 'Repository' } },
        { tool: 'find_symbol', args: { name: 'Entity' } },
        { tool: 'find_symbol', args: { name: 'Model' } }
      ]
    });
    const batchTime = Date.now() - start;
    const batchText = batchResult.content?.[0]?.text || '';

    logTest(
      'batch_query for component discovery',
      !batchResult.isError && batchText.length > 100,
      `Batch query completed in single call`,
      batchTime
    );
    console.log(`   📊 Agent Efficiency: 1 call vs 5 traditional calls`);
    console.log('   Batch results preview:', batchText.substring(0, 400) + '...');

    // Use Case 5: Pattern Analysis Across Project
    logSection('USE CASE 5: Pattern Analysis Across Project');
    console.log('Goal: Find all implementations of a design pattern');

    start = Date.now();
    const searchResult = await client.callTool('search_text', {
      pattern: 'implements.*Repository',
      isRegex: true
    });
    const searchTime = Date.now() - start;
    const searchText = searchResult.content?.[0]?.text || '';

    logTest(
      'search_text for pattern discovery',
      !searchResult.isError,
      `Regex search completed`,
      searchTime
    );
    console.log('   Pattern matches preview:', searchText.substring(0, 300) + '...');

    // ===============================================
    // PHASE 6: Test on example-java-project
    // ===============================================
    logSection('PHASE 6: Tests on example-java-project');

    // Re-index example project to ensure it's active
    await client.callTool('index_project', { rootDir: exampleProjectPath });

    // Test explore_class on example project
    start = Date.now();
    const exploreExample = await client.callTool('explore_class', {
      className: 'UserService'
    });
    logTest(
      'explore_class on example-java-project',
      !exploreExample.isError,
      `Explored UserService`,
      Date.now() - start
    );

    // Test batch_query on example project
    start = Date.now();
    const batchExample = await client.callTool('batch_query', {
      queries: [
        { tool: 'find_symbol', args: { name: 'User' } },
        { tool: 'find_usages', args: { fqn: 'com.example.model.User' } },
        { tool: 'call_graph', args: { fqn: 'com.example.service.UserService.createUser', inbound: true } }
      ]
    });
    const batchExampleText = batchExample.content?.[0]?.text || '';
    logTest(
      'batch_query with mixed query types',
      !batchExample.isError && batchExampleText.length > 50,
      `Mixed queries completed`,
      Date.now() - start
    );

    // ===============================================
    // FINAL SUMMARY
    // ===============================================
    logSection('TEST SUMMARY');
    
    console.log(`\n📊 Results: ${testResults.passed} passed, ${testResults.failed} failed`);
    console.log(`   Total tests: ${testResults.passed + testResults.failed}`);
    console.log(`   Pass rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);

    // Honest assessment
    console.log('\n' + '='.repeat(60));
    console.log('📋 HONEST ASSESSMENT');
    console.log('='.repeat(60));

    const assessments = [];
    
    // Check if explore_class actually returns useful composite data
    if (exploreText.length > 500 && (hasOverview || hasMembers)) {
      assessments.push('✅ explore_class USEFUL: Returns comprehensive data, reduces API calls from 5 to 1');
    } else {
      assessments.push('⚠️ explore_class NEEDS WORK: Output could be more comprehensive');
    }

    // Check if batch_query actually works
    if (batchText.length > 200 && !batchResult.isError) {
      assessments.push('✅ batch_query USEFUL: Batches multiple queries, good for discovery workflows');
    } else {
      assessments.push('⚠️ batch_query NEEDS WORK: Results may not be as useful as expected');
    }

    // Check Resources API
    try {
      const statsCheck = await client.readResource('java-index://stats');
      if (statsCheck.contents?.[0]?.text?.length > 100) {
        assessments.push('✅ Resources API USEFUL: Provides index introspection without tool calls');
      } else {
        assessments.push('⚠️ Resources API NEEDS WORK: Content could be richer');
      }
    } catch {
      assessments.push('❌ Resources API NOT WORKING');
    }

    // Check Prompts API
    try {
      const promptCheck = await client.getPrompt('understand-class', { className: 'Test' });
      if (promptCheck.messages?.[0]?.content?.text?.length > 100) {
        assessments.push('✅ Prompts API USEFUL: Provides reusable workflow templates');
      } else {
        assessments.push('⚠️ Prompts API NEEDS WORK: Prompts could be more detailed');
      }
    } catch {
      assessments.push('❌ Prompts API NOT WORKING');
    }

    assessments.forEach(a => console.log(a));

    console.log('\n📈 AGENT EFFICIENCY METRICS:');
    console.log('   - explore_class: 1 call replaces ~5 individual tool calls');
    console.log('   - batch_query: 1 call replaces N individual find_symbol calls');
    console.log('   - Resources: 0 tool calls needed for index introspection');
    console.log('   - Prompts: Pre-built workflows reduce agent planning complexity');

    await client.stop();
    console.log('\n✓ Test complete');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    await client.stop();
    process.exit(1);
  }
}

runTests();
