const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test indexing functionality
async function testIndexing() {
  console.log('🧪 Testing Java Indexer...\n');

  const serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
  const exampleProject = path.join(__dirname, 'example-java-project');
  
  // Start the MCP server
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let responseBuffer = '';
  let requestId = 1;

  server.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    processResponses();
  });

  server.stderr.on('data', (data) => {
    console.log('📋 Server log:', data.toString().trim());
  });

  function processResponses() {
    const lines = responseBuffer.split('\n');
    responseBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const response = JSON.parse(line);
        console.log('\n📨 Response:', JSON.stringify(response, null, 2));
      } catch (e) {
        // Not JSON, skip
      }
    }
  }

  function sendRequest(method, params) {
    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method,
      params
    };
    
    console.log('\n📤 Request:', method, JSON.stringify(params, null, 2));
    server.stdin.write(JSON.stringify(request) + '\n');
  }

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send index_project request
  sendRequest('tools/call', {
    name: 'index_project',
    arguments: {
      rootDir: exampleProject,
      sourceRoots: ['src/main/java']
    }
  });

  // Wait for indexing to complete
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Check if index directory was created
  const indexDir = path.join(exampleProject, '.mcp-index');
  console.log('\n✅ Checking index directory:', indexDir);
  
  if (fs.existsSync(indexDir)) {
    console.log('✅ Index directory exists');
    
    const files = fs.readdirSync(indexDir);
    console.log('📁 Index files:', files);
    
    // Check for metadata
    if (files.includes('metadata.json')) {
      const metadata = JSON.parse(fs.readFileSync(path.join(indexDir, 'metadata.json'), 'utf-8'));
      console.log('\n📊 Index Metadata:', JSON.stringify(metadata, null, 2));
    }
    
    // Check for chunked files
    const chunkFiles = files.filter(f => f.endsWith('.json.gz'));
    console.log(`\n✅ Found ${chunkFiles.length} compressed chunk files`);
    
    const chunkCountFiles = files.filter(f => f.endsWith('_chunks.txt'));
    console.log(`✅ Found ${chunkCountFiles.length} chunk count files`);
  } else {
    console.log('❌ Index directory not found!');
  }

  // Cleanup
  server.kill();
  console.log('\n✅ Test completed!');
  process.exit(0);
}

testIndexing().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
