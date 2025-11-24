const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const serverPath = path.join(__dirname, 'server', 'dist', 'index.js');

(async () => {
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const rl = readline.createInterface({
    input: server.stdout,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    try {
      const response = JSON.parse(line);
      if (response.result) {
        console.log('=== OUTPUT ===');
        console.log(response.result.content[0].text);
        console.log('=== END ===');
        server.kill();
        process.exit(0);
      }
    } catch (err) {
      // ignore
    }
  });

  server.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('running on stdio')) {
      // Send find_symbol request
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'find_symbol',
          arguments: { name: 'String' }
        }
      };
      server.stdin.write(JSON.stringify(request) + '\n');
    }
  });
})();
