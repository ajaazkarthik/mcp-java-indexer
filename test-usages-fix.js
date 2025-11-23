/**
 * Test specifically for find_usages fix - verifies that usages are found
 * even when symbol lookup might fail
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

class UsagesTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.projectRoot = path.join(__dirname, 'large-java-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}${colors.bold}Testing find_usages Fix${colors.reset}\n`);

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

  async test() {
    console.log(`${colors.cyan}Looking for PackageService005 usages...${colors.reset}`);
    
    const serviceFqn = 'com.largeproj.pkg005.PackageService005';
    const result = await this.callTool('find_usages', { fqn: serviceFqn });
    const text = result.content[0]?.text || '';
    
    console.log(`\n${colors.bold}Result:${colors.reset}`);
    console.log(text);
    console.log('');
    
    if (text.includes('MegaApplication.java')) {
      console.log(`${colors.green}${colors.bold}✓ SUCCESS: Found MegaApplication.java in usages!${colors.reset}\n`);
      return true;
    } else {
      console.log(`${colors.red}${colors.bold}✗ FAIL: MegaApplication.java not found in usages${colors.reset}\n`);
      return false;
    }
  }

  async stop() {
    if (this.server) {
      this.server.kill();
    }
  }
}

(async () => {
  const tester = new UsagesTester();
  let success = false;
  try {
    await tester.start();
    success = await tester.test();
  } catch (error) {
    console.error(`${colors.red}${colors.bold}Error: ${error.message}${colors.reset}`);
    console.error(error.stack);
  } finally {
    await tester.stop();
    process.exit(success ? 0 : 1);
  }
})();
