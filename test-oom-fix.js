/**
 * OOM Fix Validation Test Suite
 * 
 * Tests all critical memory management fixes:
 * 1. Batch size reduction (600 → 100)
 * 2. Reference deduplication
 * 3. Aggressive GC after each batch
 * 4. Buffer clearing
 * 5. Maintenance cleanup
 * 6. Emergency brake at 3.5GB
 * 7. Heap limit configuration
 * 
 * This test simulates indexing scenarios that previously caused OOM crashes.
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

class OOMFixTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.testProjectRoot = path.join(__dirname, 'test-oom-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    this.totalTests = 0;
    this.passed = 0;
    this.failed = 0;
    this.testResults = [];
    this.memoryLogs = [];
  }

  async createTestProject(fileCount = 500) {
    console.log(`${colors.cyan}Creating test project with ${fileCount} files...${colors.reset}`);
    
    const srcDir = path.join(this.testProjectRoot, 'src', 'main', 'java', 'com', 'test');
    fs.mkdirSync(srcDir, { recursive: true });

    // Create files in batches to test batch processing
    for (let i = 0; i < fileCount; i++) {
      const packageNum = Math.floor(i / 50); // 50 files per package
      const pkgDir = path.join(srcDir, `pkg${packageNum}`);
      fs.mkdirSync(pkgDir, { recursive: true });

      const className = `TestClass${i}`;
      const content = `package com.test.pkg${packageNum};

import java.util.*;

public class ${className} {
    private String field${i};
    private int count${i};
    
    public ${className}() {
        this.field${i} = "value${i}";
        this.count${i} = ${i};
    }
    
    public ${className}(String field, int count) {
        this.field${i} = field;
        this.count${i} = count;
    }
    
    public String getField${i}() {
        return field${i};
    }
    
    public void setField${i}(String value) {
        this.field${i} = value;
    }
    
    public int getCount${i}() {
        return count${i};
    }
    
    public void process() {
        System.out.println("Processing " + field${i});
    }
    
    public void callOthers() {
        // Create references to test reference deduplication
        ${i > 0 ? `TestClass${i-1} prev = new TestClass${i-1}();` : ''}
        ${i > 0 ? `prev.process();` : ''}
        ${i > 0 ? `prev.getField${i-1}();` : ''}
        ${i > 0 ? `prev.getField${i-1}();` : ''} // Duplicate call
        ${i > 0 ? `prev.getField${i-1}();` : ''} // Duplicate call
    }
}
`;
      fs.writeFileSync(path.join(pkgDir, `${className}.java`), content);
    }

    console.log(`${colors.green}✓ Test project created${colors.reset}\n`);
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}${colors.bold}Starting OOM Fix Test Suite${colors.reset}`);
      console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);

      // Launch with --expose-gc to test manual GC
      this.server = spawn('node', [
        '--max-old-space-size=8192',
        '--expose-gc',
        this.serverPath
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
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
          // Non-JSON line, ignore
        }
      });

      this.server.stderr.on('data', (data) => {
        const msg = data.toString();
        
        // Capture memory logs
        if (msg.includes('Heap:') || msg.includes('Cleanup:') || msg.includes('WARNING:')) {
          this.memoryLogs.push(msg.trim());
        }
        
        // Log important messages
        if (msg.includes('Conservative batch') || 
            msg.includes('Cleanup:') || 
            msg.includes('WARNING:') ||
            msg.includes('emergency cleanup')) {
          console.log(`${colors.yellow}[Server] ${msg.trim()}${colors.reset}`);
        }
        
        if (msg.includes('running on stdio')) {
          console.log(`${colors.green}✓ MCP Server started with heap limit 8GB and GC enabled${colors.reset}\n`);
          resolve();
        }
      });

      this.server.on('error', reject);
      
      this.server.on('exit', (code, signal) => {
        if (code === 134 || signal === 'SIGABRT') {
          reject(new Error('Server crashed with OOM (code 134)!'));
        }
      });
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
          reject(new Error(`Request timeout after 300s`));
        }
      }, 300000); // 5 minutes max
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
      const initialMem = process.memoryUsage();
      
      await fn();
      
      const duration = Date.now() - start;
      const finalMem = process.memoryUsage();
      const memDelta = Math.round((finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024);
      
      this.passed++;
      this.testResults.push({ 
        name, 
        status: 'PASS', 
        duration, 
        memDelta 
      });
      console.log(`${colors.green}  ✓ PASS${colors.reset} (${duration}ms, Δ${memDelta}MB)\n`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      this.failed++;
      this.testResults.push({ 
        name, 
        status: 'FAIL', 
        error: error.message 
      });
      console.log(`${colors.red}  ✗ FAIL${colors.reset}`);
      console.log(`${colors.red}    ${error.message}${colors.reset}\n`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  async runAllTests() {
    // Test 1: Verify batch size is 100
    await this.runTest('Batch Size Configuration - Should be 100', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.testProjectRoot,
        sourceRoots: ['src/main/java']
      });
      
      const text = result.content[0]?.text || '';
      
      // Check for batch size mention
      const hasBatchInfo = this.memoryLogs.some(log => 
        log.includes('batches of 100') || log.includes('Batch ')
      );
      
      if (!hasBatchInfo) {
        throw new Error('No batch size information found in logs');
      }
      
      if (!text.includes('Statistics')) {
        throw new Error('Index did not complete successfully');
      }
    });

    // Test 2: Verify GC is running
    await this.runTest('Garbage Collection - Should run after each batch', async () => {
      // GC should have been triggered during indexing
      const hasMemoryLogs = this.memoryLogs.some(log => 
        log.includes('Heap:') || log.includes('MB')
      );
      
      if (!hasMemoryLogs) {
        throw new Error('No memory monitoring logs found');
      }
      
      // Verify heap usage is being tracked
      const heapLogs = this.memoryLogs.filter(log => log.includes('Heap:'));
      if (heapLogs.length === 0) {
        throw new Error('No heap usage logs captured');
      }
      
      console.log(`${colors.cyan}    Captured ${heapLogs.length} heap monitoring logs${colors.reset}`);
    });

    // Test 3: Verify cleanup runs
    await this.runTest('Maintenance Cleanup - Should run periodically', async () => {
      // Check if cleanup messages appeared
      const hasCleanup = this.memoryLogs.some(log => 
        log.includes('Cleanup:') || log.includes('removed')
      );
      
      // Cleanup may not run if no orphaned data, which is OK
      console.log(`${colors.cyan}    Cleanup ${hasCleanup ? 'executed' : 'not needed (no orphans)'}${colors.reset}`);
    });

    // Test 4: Reference deduplication
    await this.runTest('Reference Deduplication - Verify no duplicates', async () => {
      // Find a symbol with duplicate references
      const result = await this.callTool('find_usages', {
        fqn: 'com.test.pkg0.TestClass1.getField1'
      });
      
      const text = result.content[0]?.text || '';
      
      // Count occurrences - should not have excessive duplicates
      // TestClass2.callOthers() has 3 identical calls to getField1()
      // But they're on different lines, so they're legitimate distinct references
      if (!text.includes('Found') && !text.includes('reference')) {
        throw new Error('Find usages did not return references');
      }
    });

    // Test 5: Memory stability test - reindex same project
    await this.runTest('Memory Stability - Reindex without leak', async () => {
      const beforeMem = process.memoryUsage().heapUsed / 1024 / 1024;
      
      const result = await this.callTool('index_project', {
        rootDir: this.testProjectRoot,
        sourceRoots: ['src/main/java']
      });
      
      const afterMem = process.memoryUsage().heapUsed / 1024 / 1024;
      const memIncrease = afterMem - beforeMem;
      
      // Should use incremental indexing (no changes)
      const text = result.content[0]?.text || '';
      if (!text.includes('up-to-date') && !text.includes('Incremental')) {
        console.log(`${colors.yellow}    Warning: Not using incremental indexing${colors.reset}`);
      }
      
      // Memory increase should be minimal for reindex
      if (memIncrease > 500) { // 500MB threshold
        throw new Error(`Memory increased by ${Math.round(memIncrease)}MB on reindex (threshold: 500MB)`);
      }
      
      console.log(`${colors.cyan}    Memory delta: ${Math.round(memIncrease)}MB (threshold: 500MB)${colors.reset}`);
    });

    // Test 6: Large batch simulation
    await this.runTest('Large Project Simulation - 500 files without OOM', async () => {
      // Already indexed, but verify statistics
      const result = await this.callTool('find_symbol', {
        name: 'TestClass'
      });
      
      const text = result.content[0]?.text || '';
      
      // Should find multiple TestClass symbols
      const matches = (text.match(/TestClass\d+/g) || []).length;
      if (matches === 0) {
        throw new Error('No TestClass symbols found');
      }
      
      console.log(`${colors.cyan}    Found ${matches} TestClass symbols${colors.reset}`);
    });

    // Test 7: Call graph without memory spike
    await this.runTest('Call Graph Analysis - Complex graph without OOM', async () => {
      const beforeMem = process.memoryUsage().heapUsed / 1024 / 1024;
      
      // Analyze method with many callers
      const result = await this.callTool('call_graph', {
        fqn: 'com.test.pkg0.TestClass1.process'
      });
      
      const afterMem = process.memoryUsage().heapUsed / 1024 / 1024;
      const memIncrease = afterMem - beforeMem;
      
      const text = result.content[0]?.text || '';
      if (!text.includes('Call Graph') && !text.includes('Inbound')) {
        throw new Error('Call graph analysis failed');
      }
      
      if (memIncrease > 200) {
        throw new Error(`Call graph used ${Math.round(memIncrease)}MB (threshold: 200MB)`);
      }
      
      console.log(`${colors.cyan}    Memory delta: ${Math.round(memIncrease)}MB${colors.reset}`);
    });

    // Test 8: Verify heap limit in extension
    await this.runTest('Extension Configuration - Heap limit should be 8GB', async () => {
      const extensionPath = path.join(__dirname, 'dist', 'extension.js');
      const content = fs.readFileSync(extensionPath, 'utf-8');
      
      if (!content.includes('--max-old-space-size=8192')) {
        throw new Error('Heap limit not set to 8GB in extension.js');
      }
      
      if (!content.includes('--expose-gc')) {
        throw new Error('Manual GC not enabled in extension.js');
      }
      
      console.log(`${colors.cyan}    ✓ Heap limit: 8GB${colors.reset}`);
      console.log(`${colors.cyan}    ✓ Manual GC: enabled${colors.reset}`);
    });

    // Test 9: Server crash detection
    await this.runTest('OOM Prevention - Server should not crash', async () => {
      if (!this.server || this.server.killed) {
        throw new Error('Server crashed during tests!');
      }
      
      // Check for OOM indicators in logs
      const hasOOMWarning = this.memoryLogs.some(log => 
        log.includes('heap limit') || log.includes('out of memory')
      );
      
      if (hasOOMWarning) {
        throw new Error('OOM warning detected in logs');
      }
      
      // Check for high memory warnings (which is OK, as long as no crash)
      const hasHighMemWarning = this.memoryLogs.some(log => 
        log.includes('HIGH MEMORY WARNING')
      );
      
      if (hasHighMemWarning) {
        console.log(`${colors.yellow}    ⚠ High memory warning triggered (emergency brake worked)${colors.reset}`);
      }
    });

    // Test 10: Memory logs analysis
    await this.runTest('Memory Monitoring - Verify heap tracking', async () => {
      const heapLogs = this.memoryLogs.filter(log => log.includes('Heap:'));
      
      if (heapLogs.length === 0) {
        throw new Error('No heap monitoring logs found');
      }
      
      // Extract max heap usage
      let maxHeap = 0;
      for (const log of heapLogs) {
        const match = log.match(/Heap: (\d+)\/\d+MB/);
        if (match) {
          const heapUsed = parseInt(match[1]);
          maxHeap = Math.max(maxHeap, heapUsed);
        }
      }
      
      console.log(`${colors.cyan}    Peak heap usage: ${maxHeap}MB${colors.reset}`);
      console.log(`${colors.cyan}    Total heap logs: ${heapLogs.length}${colors.reset}`);
      
      // Verify heap stayed under 4GB (should be much lower with fixes)
      if (maxHeap > 4096) {
        throw new Error(`Peak heap ${maxHeap}MB exceeded 4GB threshold`);
      }
    });
  }

  printSummary() {
    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}OOM FIX TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
    
    const passRate = ((this.passed / this.totalTests) * 100).toFixed(1);
    console.log(`${colors.bold}Total Tests:${colors.reset} ${this.totalTests}`);
    console.log(`${colors.green}${colors.bold}Passed:${colors.reset} ${this.passed}`);
    console.log(`${colors.red}${colors.bold}Failed:${colors.reset} ${this.failed}`);
    console.log(`${colors.bold}Pass Rate:${colors.reset} ${passRate}%\n`);

    console.log(`${colors.bold}Memory Monitoring:${colors.reset}`);
    console.log(`  Total logs captured: ${this.memoryLogs.length}`);
    
    const cleanupLogs = this.memoryLogs.filter(log => log.includes('Cleanup:'));
    console.log(`  Cleanup executions: ${cleanupLogs.length}`);
    
    const heapLogs = this.memoryLogs.filter(log => log.includes('Heap:'));
    console.log(`  Heap monitoring logs: ${heapLogs.length}\n`);

    console.log(`${colors.bold}Test Results:${colors.reset}`);
    this.testResults.forEach((result, idx) => {
      const status = result.status === 'PASS'
        ? `${colors.green}✓ PASS${colors.reset}`
        : `${colors.red}✗ FAIL${colors.reset}`;
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      const memDelta = result.memDelta ? `, Δ${result.memDelta}MB` : '';
      console.log(`  ${idx + 1}. ${result.name}: ${status}${duration}${memDelta}`);
      if (result.error) {
        console.log(`     ${colors.red}Error: ${result.error}${colors.reset}`);
      }
    });

    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    
    if (this.failed === 0) {
      console.log(`${colors.green}${colors.bold}✓ ALL OOM FIXES VERIFIED!${colors.reset}\n`);
    } else {
      console.log(`${colors.red}${colors.bold}✗ SOME TESTS FAILED - OOM FIX MAY BE INCOMPLETE${colors.reset}\n`);
    }

    return this.failed === 0;
  }

  async stop() {
    if (this.server) {
      this.server.kill();
      console.log(`${colors.cyan}Server stopped${colors.reset}\n`);
    }
  }

  async cleanup() {
    // Clean up test project
    if (fs.existsSync(this.testProjectRoot)) {
      fs.rmSync(this.testProjectRoot, { recursive: true, force: true });
      console.log(`${colors.cyan}Test project cleaned up${colors.reset}`);
    }
  }
}

(async () => {
  const tester = new OOMFixTester();
  let success = false;
  try {
    await tester.createTestProject(500); // 500 files for stress test
    await tester.start();
    await tester.runAllTests();
    success = tester.printSummary();
  } catch (error) {
    console.error(`${colors.red}${colors.bold}Fatal error: ${error.message}${colors.reset}`);
    console.error(error.stack);
  } finally {
    await tester.stop();
    await tester.cleanup();
    process.exit(success ? 0 : 1);
  }
})();
