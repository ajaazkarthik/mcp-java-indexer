const { spawn } = require('child_process');
const path = require('path');

async function inspectMethodFQNs() {
  console.log('Starting MCP server to inspect method FQNs...\n');
  
  const serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
  const process = spawn('node', ['--max-old-space-size=4096', serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname
  });

  let messageId = 0;
  const pendingRequests = new Map();
  let buffer = '';

  process.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pendingRequests.has(msg.id)) {
          const { resolve, reject } = pendingRequests.get(msg.id);
          pendingRequests.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  async function callTool(toolName, args) {
    return new Promise((resolve, reject) => {
      const id = ++messageId;
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      };

      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Timeout`));
      }, 60000);

      pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  try {
    // Index the project
    console.log('Indexing project...');
    await callTool('index_project', {
      rootDir: path.join(__dirname, 'example-java-project'),
      sourceRoots: ['src/main/java']
    });
    console.log('✓ Indexed\n');

    // Find UserService class
    console.log('Looking for UserService methods...');
    const result = await callTool('find_symbol', { name: 'UserService' });
    const text = result.content[0]?.text || '';
    
    // Extract FQN patterns from the output
    const lines = text.split('\n');
    console.log('\nUserService symbols found:');
    for (const line of lines) {
      if (line.includes('FQN:') || line.includes('com.example')) {
        console.log('  ' + line.trim());
      }
    }

    // Try different FQN formats for createUser method
    console.log('\n\nTesting different FQN formats for createUser method:\n');
    
    const formats = [
      'com.example.demo.UserService.createUser',
      'com.example.demo.UserService.createUser(String,String)',
      'com.example.demo.UserService.createUser(java.lang.String,java.lang.String)',
      'createUser'
    ];

    for (const fqn of formats) {
      console.log(`Testing: "${fqn}"`);
      try {
        const cgResult = await callTool('call_graph', { fqn });
        const cgText = cgResult.content[0]?.text || '';
        if (cgText.includes('Symbol not found')) {
          console.log('  ✗ Symbol not found');
        } else {
          console.log('  ✓ Found! Call graph generated');
          // Show first few lines
          const preview = cgText.split('\n').slice(0, 5).join('\n');
          console.log('  Preview:', preview.substring(0, 100));
        }
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
      }
    }

    // Now let's check what method FQNs actually exist in the index
    console.log('\n\nSearching for all method symbols with "create"...');
    const searchResult = await callTool('find_symbol', { name: 'create' });
    const searchText = searchResult.content[0]?.text || '';
    const methodLines = searchText.split('\n').filter(l => 
      l.includes('method') && l.includes('FQN:')
    );
    
    console.log(`Found ${methodLines.length} methods with "create":`);
    for (const line of methodLines.slice(0, 10)) {
      console.log('  ' + line.trim());
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.kill();
  }
}

inspectMethodFQNs().catch(console.error);
