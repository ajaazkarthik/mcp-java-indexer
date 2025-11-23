/**
 * Debug script to examine find_usages behavior for PackageService005
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

class DebugTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.projectRoot = path.join(__dirname, 'large-java-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log('Starting MCP Server for debugging...\n');

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
          console.log('✓ MCP Server started\n');
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
      }, 180000);
    });
  }

  async callTool(name, args) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async debug() {
    const serviceFqn = 'com.largeproj.pkg005.PackageService005';
    
    console.log('='.repeat(70));
    console.log('DEBUG: find_usages for PackageService005');
    console.log('='.repeat(70));
    
    // First, ensure the project is indexed
    console.log('\n1. Checking if project needs indexing...\n');
    const indexResult = await this.callTool('index_project', {
      rootDir: this.projectRoot,
      sourceRoots: ['src/main/java']
    });
    console.log(indexResult.content[0].text.split('\n').slice(0, 10).join('\n'));
    console.log('...\n');
    
    // Try find_symbol first to confirm the service exists
    console.log('2. Finding symbol for PackageService005...\n');
    const symbolResult = await this.callTool('find_symbol', { name: serviceFqn });
    console.log(symbolResult.content[0].text);
    console.log('\n');
    
    // Now try find_usages with the full FQN
    console.log('3. Finding usages with full FQN:', serviceFqn);
    console.log('-'.repeat(70));
    const usagesResult = await this.callTool('find_usages', { fqn: serviceFqn });
    console.log(usagesResult.content[0].text);
    console.log('\n');
    
    // Try with simple name
    console.log('4. Finding usages with simple name: PackageService005');
    console.log('-'.repeat(70));
    const usagesResult2 = await this.callTool('find_usages', { fqn: 'PackageService005' });
    console.log(usagesResult2.content[0].text);
    console.log('\n');
    
    // Check if MegaApplication exists
    console.log('5. Finding MegaApplication symbol...\n');
    const megaAppResult = await this.callTool('find_symbol', { name: 'MegaApplication' });
    console.log(megaAppResult.content[0].text);
    console.log('\n');
    
    // Try searching for text in MegaApplication
    console.log('6. Searching for "PackageService" in MegaApplication.java...\n');
    const searchResult = await this.callTool('search_text', { 
      pattern: 'PackageService',
      maxResults: 10
    });
    const searchText = searchResult.content[0].text;
    const lines = searchText.split('\n');
    const megaAppLines = lines.filter(line => line.includes('MegaApplication.java'));
    console.log('Lines mentioning MegaApplication.java:');
    megaAppLines.slice(0, 20).forEach(line => console.log('  ' + line));
    
    console.log('\n' + '='.repeat(70));
  }

  async stop() {
    if (this.server) {
      this.server.kill();
      console.log('\nServer stopped\n');
    }
  }
}

(async () => {
  const tester = new DebugTester();
  try {
    await tester.start();
    await tester.debug();
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    await tester.stop();
  }
})();
