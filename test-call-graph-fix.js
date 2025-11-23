const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testCallGraphFix() {
  console.log('=== TESTING CALL GRAPH FIX ===\n');
  
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
    console.log('1. Indexing project...');
    const indexResult = await callTool('index_project', {
      rootDir: path.join(__dirname, 'example-java-project'),
      sourceRoots: ['src/main/java']
    });
    console.log('   ✓ Indexed\n');

    // Test 1: Method resolution with partial FQN (ISSUE #1)
    console.log('2. Testing method resolution (Issue #1: "Symbol not found"):\n');
    
    const testCases = [
      { name: 'Partial FQN (no params)', fqn: 'com.example.demo.UserService.createUser' },
      { name: 'Partial FQN getUser', fqn: 'com.example.demo.UserService.getUser' },
      { name: 'Repository.save', fqn: 'com.example.demo.UserRepository.save' },
    ];

    for (const test of testCases) {
      console.log(`   Testing: ${test.name}`);
      console.log(`   FQN: "${test.fqn}"`);
      try {
        const result = await callTool('call_graph', { fqn: test.fqn });
        const text = result.content[0]?.text || '';
        
        if (text.includes('Symbol not found')) {
          console.log('   ✗ STILL BROKEN: Symbol not found');
        } else {
          console.log('   ✓ FIXED: Symbol resolved!');
          
          // Check for outbound/inbound calls
          const hasOutbound = text.match(/Outbound Calls \((\d+)\)/);
          const hasInbound = text.match(/Inbound Calls \((\d+)\)/);
          
          if (hasOutbound) {
            console.log(`     Outbound: ${hasOutbound[1]} calls`);
          }
          if (hasInbound) {
            console.log(`     Inbound: ${hasInbound[1]} calls`);
          }
          
          // Show a preview
          const lines = text.split('\n').slice(0, 8);
          console.log(`     Preview:\n${lines.map(l => '       ' + l).join('\n')}`);
        }
      } catch (error) {
        console.log(`   ✗ ERROR: ${error.message}`);
      }
      console.log('');
    }

    // Test 2: Inbound call tracking (ISSUE #2)
    console.log('\n3. Testing inbound call tracking (Issue #2: Shows 0 inbound):\n');
    
    const inboundTests = [
      { name: 'UserRepository.save (called by createUser)', fqn: 'com.example.demo.UserRepository.save' },
      { name: 'AuditLogger.log (called multiple times)', fqn: 'com.example.demo.AuditLogger.log' },
      { name: 'User constructor (called by createUser)', fqn: 'com.example.demo.User.User' },
    ];

    for (const test of inboundTests) {
      console.log(`   Testing: ${test.name}`);
      console.log(`   FQN: "${test.fqn}"`);
      try {
        const result = await callTool('call_graph', { fqn: test.fqn });
        const text = result.content[0]?.text || '';
        
        if (text.includes('Symbol not found')) {
          console.log('   ⚠ Symbol not found (might not exist in project)');
        } else {
          // Check inbound calls
          const inboundMatch = text.match(/Inbound Calls \((\d+)\)/);
          const inboundCount = inboundMatch ? parseInt(inboundMatch[1]) : 0;
          
          if (inboundCount > 0) {
            console.log(`   ✓ FIXED: Shows ${inboundCount} inbound call(s)`);
            
            // Show who calls it
            const callerMatch = text.match(/← `([^`]+)`/);
            if (callerMatch) {
              console.log(`     Called by: ${callerMatch[1]}`);
            }
          } else {
            console.log(`   ✗ STILL BROKEN: Shows 0 inbound calls`);
            console.log(`     (Method should be called based on code analysis)`);
          }
        }
      } catch (error) {
        console.log(`   ✗ ERROR: ${error.message}`);
      }
      console.log('');
    }

    // Summary
    console.log('\n=== SUMMARY ===\n');
    console.log('Issue #1 (Method Resolution): Check results above');
    console.log('Issue #2 (Inbound Tracking): Check results above');
    console.log('\nIf inbound calls show 0, the Java indexer might not be');
    console.log('creating references properly. Need to check ReferenceExtractor.java');

  } catch (error) {
    console.error('Test error:', error.message);
  } finally {
    process.kill();
    
    // Check if index was persisted
    await new Promise(resolve => setTimeout(resolve, 1000));
    const indexPath = path.join(__dirname, 'example-java-project', '.mcp-index', 'index.json');
    if (fs.existsSync(indexPath)) {
      console.log('\n✓ Index file persisted');
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      console.log(`  Symbols: ${Object.keys(index.symbols).length}`);
      console.log(`  References: ${index.references?.length || 0}`);
      console.log(`  Call graph entries: ${Object.keys(index.callGraph || {}).length}`);
      console.log(`  Reverse call graph entries: ${Object.keys(index.reverseCallGraph || {}).length}`);
    }
  }
}

testCallGraphFix().catch(console.error);
