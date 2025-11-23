#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Quick Test of Optimizations...\n');

// Start the indexer server
const serverPath = join(__dirname, 'server', 'dist', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let responseBuffer = '';
let requestId = 1;

const rl = readline.createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.result) {
      console.log('\n✅ INDEX RESULT:');
      console.log(msg.result.content[0].text);
      server.kill();
      process.exit(0);
    }
  } catch (e) {
    // Not JSON
  }
});

server.stderr.on('data', (data) => {
  console.log('[Java/Server]', data.toString().trim());
});

server.on('exit', (code) => {
  console.log(`\nServer exited with code ${code}`);
  process.exit(code || 0);
});

// Wait for server to start
setTimeout(() => {
  console.log('\n📤 Sending index request...\n');
  
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: 'index_project',
      arguments: {
        rootDir: join(__dirname, 'example-java-project'),
        sourceRoots: ['src/main/java']
      }
    }
  };
  
  server.stdin.write(JSON.stringify(request) + '\n');
}, 1000);
