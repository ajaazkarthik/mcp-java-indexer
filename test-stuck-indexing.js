/**
 * Diagnostic script to understand indexing bottlenecks
 * Tests with different batch sizes and monitors progress
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

class DiagnosticTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.projectRoot = path.join(__dirname, 'large-java-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log('Starting MCP Server with diagnostics...\n');

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
          // Non-JSON output, likely logs
        }
      });

      this.server.stderr.on('data', (data) => {
        const msg = data.toString();
        console.log(`[SERVER] ${msg}`);
        if (msg.includes('running on stdio')) {
          resolve();
        }
      });

      this.server.on('error', reject);
      
      setTimeout(() => reject(new Error('Server start timeout')), 10000);
    });
  }

  async sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = { jsonrpc: '2.0', id, method, params };
      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\n');

      // 20 minute timeout for large projects
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Timeout after 20 minutes for ${params?.name || method}`));
        }
      }, 1200000);
    });
  }

  async callTool(name, args) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async testIndexing() {
    console.log('\n========================================');
    console.log('DIAGNOSTIC: Large Project Indexing Test');
    console.log('========================================\n');
    console.log(`Project: ${this.projectRoot}`);
    console.log('Expected: ~12,000 Java files\n');
    console.log('This test will monitor progress in real-time...\n');
    
    const startTime = Date.now();
    
    try {
      const result = await this.callTool('index_project', {
        rootDir: this.projectRoot,
        sourceRoots: ['src/main/java']
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const text = result.content[0]?.text || '';
      
      console.log('\n========================================');
      console.log('INDEXING COMPLETED');
      console.log('========================================');
      console.log(`Total time: ${elapsed}s`);
      console.log('\nResult:\n' + text);
      
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error('\n========================================');
      console.error('INDEXING FAILED');
      console.error('========================================');
      console.error(`Time before failure: ${elapsed}s`);
      console.error(`Error: ${error.message}`);
    }
  }

  async stop() {
    if (this.server) {
      this.server.kill();
      console.log('\nServer stopped');
    }
  }
}

(async () => {
  const tester = new DiagnosticTester();
  try {
    await tester.start();
    await tester.testIndexing();
  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    await tester.stop();
    process.exit(0);
  }
})();
