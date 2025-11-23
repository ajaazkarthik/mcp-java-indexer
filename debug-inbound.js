const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function debugInboundCalls() {
  console.log('=== DEBUGGING INBOUND CALLS ===\n');
  
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
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
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
      pendingRequests.set(id, { resolve: (r) => { clearTimeout(timeout); resolve(r); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
      process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  try {
    console.log('1. Indexing project...');
    await callTool('index_project', {
      rootDir: path.join(__dirname, 'example-java-project'),
      sourceRoots: ['src/main/java']
    });
    console.log('✓ Indexed\n');

    // Wait for persistence
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check the actual index data
    const indexPath = path.join(__dirname, 'example-java-project', '.mcp-index', 'index.json');
    if (fs.existsSync(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      
      console.log('2. Analyzing index data:\n');
      console.log(`Total symbols: ${Object.keys(index.symbols).length}`);
      console.log(`Total references: ${index.references?.length || 0}`);
      console.log(`Call graph entries: ${Object.keys(index.callGraph || {}).length}`);
      console.log(`Reverse call graph entries: ${Object.keys(index.reverseCallGraph || {}).length}\n`);

      // Find references from createUser
      console.log('3. References FROM createUser method:\n');
      const createUserRefs = (index.references || []).filter(r => 
        r.fromFqn.includes('createUser') && r.kind === 'method_call'
      );
      console.log(`Found ${createUserRefs.length} method_call references:\n`);
      for (const ref of createUserRefs) {
        console.log(`  FROM: ${ref.fromFqn}`);
        console.log(`    TO: ${ref.toFqn}`);
        console.log(`    at ${ref.file}:${ref.line}\n`);
      }

      // Check what's in reverseCallGraph
      console.log('4. Reverse call graph keys (first 10):\n');
      const revKeys = Object.keys(index.reverseCallGraph || {}).slice(0, 10);
      for (const key of revKeys) {
        const edges = index.reverseCallGraph[key];
        console.log(`  "${key}" has ${edges.length} caller(s)`);
        for (const edge of edges.slice(0, 2)) {
          console.log(`    <- called by ${edge.caller}`);
        }
      }

      // Check if repository.save exists
      console.log('\n5. Looking for "repository.save" in reverse call graph:\n');
      const repoSaveKeys = Object.keys(index.reverseCallGraph || {}).filter(k => 
        k.includes('repository') || k.includes('save')
      );
      console.log(`Found ${repoSaveKeys.length} matching keys:`);
      for (const key of repoSaveKeys.slice(0, 10)) {
        console.log(`  "${key}"`);
      }

      // Check UserRepository.save symbol
      console.log('\n6. UserRepository.save symbol FQN:\n');
      const saveSymbols = Object.keys(index.symbols).filter(k => 
        k.includes('UserRepository') && k.includes('save')
      );
      for (const sym of saveSymbols.slice(0, 3)) {
        console.log(`  ${sym}`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.kill();
  }
}

debugInboundCalls().catch(console.error);
