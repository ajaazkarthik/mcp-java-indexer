const { spawn } = require('child_process');
const path = require('path');

async function diagnoseCallGraph() {
  console.log('=== DIAGNOSING CALL GRAPH ===\n');
  
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
      } catch (e) {}
    }
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  async function callTool(toolName, args) {
    return new Promise((resolve, reject) => {
      const id = ++messageId;
      const request = { jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args } };
      const timeout = setTimeout(() => { pendingRequests.delete(id); reject(new Error(`Timeout`)); }, 60000);
      pendingRequests.set(id, {
        resolve: (result) => { clearTimeout(timeout); resolve(result); },
        reject: (error) => { clearTimeout(timeout); reject(error); }
      });
      process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  try {
    // Index
    console.log('Indexing...');
    await callTool('index_project', {
      rootDir: path.join(__dirname, 'example-java-project'),
      sourceRoots: ['src/main/java']
    });
    console.log('✓ Indexed\n');

    // Check what references exist
    console.log('Looking for references FROM createUser method...\n');
    const result = await callTool('find_usages', { 
      fqn: 'com.example.demo.UserService.createUser(String, String)' 
    });
    console.log(result.content[0]?.text || 'No result');

    console.log('\n\nLooking for references TO repository.save...\n');
    const saveResult = await callTool('find_usages', { 
      fqn: 'repository.save' 
    });
    console.log(saveResult.content[0]?.text || 'No result');

    console.log('\n\nLooking for UserRepository.save references...\n');
    const repoSaveResult = await callTool('find_usages', { 
      fqn: 'UserRepository.save' 
    });
    console.log(repoSaveResult.content[0]?.text || 'No result');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.kill();
  }
}

diagnoseCallGraph().catch(console.error);
