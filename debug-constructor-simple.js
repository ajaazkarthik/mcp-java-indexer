const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

const rootDir = path.resolve(__dirname, 'example-java-project');

async function debugConstructorInbound() {
  console.log('=== Debug Constructor Inbound Calls ===\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, 'server', 'dist', 'index.js')],
  });

  const client = new Client(
    { name: 'debug-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  try {
    // Index
    console.log('📦 Indexing...\n');
    const indexResult = await client.callTool({
      name: 'index_project',
      arguments: { rootDir }
    });
    console.log('✅ Indexing complete\n');

    // Test 1: Find the User constructor symbol
    console.log('=== Test 1: Finding User Constructor ===\n');
    const findResult = await client.callTool({
      name: 'find_symbol',
      arguments: { name: 'User.User' }
    });
    const findText = findResult.content[0].text;
    console.log(findText.split('\n').slice(0, 20).join('\n'));

    // Test 2: Get call graph with partial FQN
    console.log('\n\n=== Test 2: Call Graph with Partial FQN ===\n');
    const cgPartial = await client.callTool({
      name: 'call_graph',
      arguments: { fqn: 'com.example.demo.User.User' }
    });
    const partialText = cgPartial.content[0].text;
    
    // Extract inbound count
    const inboundMatch = partialText.match(/Inbound Calls \((\d+)\)/);
    const inboundCount = inboundMatch ? parseInt(inboundMatch[1]) : 0;
    
    console.log(`Inbound Calls: ${inboundCount}`);
    if (inboundCount > 0) {
      console.log(`✅ Constructor tracking WORKS!`);
      console.log('\nFull call graph:');
      console.log(partialText);
    } else {
      console.log(`❌ Constructor tracking FAILED`);
      console.log('\nPartial output:');
      console.log(partialText.split('\n').slice(0, 20).join('\n'));
    }

    // Test 3: Try with full FQN including params
    console.log('\n\n=== Test 3: Call Graph with Full FQN ===\n');
    const cgFull = await client.callTool({
      name: 'call_graph',
      arguments: { fqn: 'com.example.demo.User.User(String, String)' }
    });
    const fullText = cgFull.content[0].text;
    
    const inboundMatch2 = fullText.match(/Inbound Calls \((\d+)\)/);
    const inboundCount2 = inboundMatch2 ? parseInt(inboundMatch2[1]) : 0;
    
    console.log(`Inbound Calls: ${inboundCount2}`);
    console.log('\nPreview:');
    console.log(fullText.split('\n').slice(0, 20).join('\n'));

  } finally {
    await client.close();
  }
}

debugConstructorInbound().catch(console.error);
