const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, 'example-java-project');

async function testConstructorTracking() {
  console.log('Starting MCP Java Indexer client for constructor tracking test...\n');

  // Launch server
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, 'server', 'dist', 'index.js')],
  });

  const client = new Client(
    { name: 'test-constructor-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  try {
    // Step 1: Index the project
    console.log('📦 Indexing example-java-project...\n');
    const indexResult = await client.callTool({
      name: 'index_project',
      arguments: { rootDir }
    });
    console.log(indexResult.content[0].text);

    // Wait for persistence
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Read persisted index to check references
    const indexFile = path.join(rootDir, '.mcp-index', 'index.json');
    if (fs.existsSync(indexFile)) {
      const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
      
      console.log('\n=== Constructor Symbols ===\n');
      const constructors = indexData.symbols.filter(s => s.kind === 'constructor');
      constructors.slice(0, 3).forEach(c => {
        console.log(`✓ ${c.fqn}`);
      });
      
      console.log('\n=== Instantiation References ===\n');
      const instantiations = indexData.references.filter(r => r.kind === 'instantiation');
      instantiations.slice(0, 5).forEach(ref => {
        console.log(`  ${ref.fromFqn} → ${ref.toFqn}`);
      });
      
      console.log('\n=== User Constructor Analysis ===\n');
      const userConstructor = constructors.find(c => c.fqn.includes('User.User'));
      if (userConstructor) {
        console.log(`Constructor FQN: ${userConstructor.fqn}`);
      }
      
      const userInstantiations = instantiations.filter(r => r.toFqn === 'User');
      console.log(`\nInstantiation references with toFqn='User': ${userInstantiations.length}`);
      userInstantiations.forEach(ref => {
        console.log(`  From: ${ref.fromFqn}`);
        console.log(`  To: ${ref.toFqn} (should match constructor somehow)`);
        console.log('');
      });
      
      console.log('\n=== Reverse Call Graph Entries ===\n');
      if (indexData.reverseCallGraph) {
        const reverseEntries = Object.entries(indexData.reverseCallGraph);
        console.log(`Total reverse call graph entries: ${reverseEntries.length}`);
        
        // Look for "User" as a key
        const userKey = reverseEntries.find(([key]) => key === 'User');
        if (userKey) {
          console.log(`\n✓ Found "User" key in reverseCallGraph`);
          console.log(`  Callers: ${JSON.stringify(userKey[1], null, 2)}`);
        } else {
          console.log(`\n❌ No "User" key in reverseCallGraph`);
          console.log('  Keys containing "User":');
          reverseEntries
            .filter(([key]) => key.includes('User'))
            .slice(0, 5)
            .forEach(([key]) => console.log(`    - ${key}`));
        }
      } else {
        console.log('❌ No reverseCallGraph in persisted index');
      }
    }

    // Step 3: Test call graph for User constructor
    console.log('\n=== Testing Call Graph for User Constructor ===\n');
    const cgResult = await client.callTool({
      name: 'call_graph',
      arguments: { fqn: 'com.example.demo.User.User' }
    });
    
    const cgText = cgResult.content[0].text;
    const inboundMatch = cgText.match(/Inbound Calls \((\d+)\)/);
    const inboundCount = inboundMatch ? parseInt(inboundMatch[1]) : 0;
    
    if (inboundCount > 0) {
      console.log(`✅ User constructor shows ${inboundCount} inbound call(s)`);
      console.log('\nCall graph preview:');
      console.log(cgText.split('\n').slice(0, 15).join('\n'));
    } else {
      console.log(`❌ User constructor still shows 0 inbound calls`);
      console.log('\n⚠️  Problem: References store "User" but constructor FQN is "com.example.demo.User.User(String, String)"');
      console.log('    Fuzzy matching needs to handle instantiation references specially.');
    }

  } finally {
    await client.close();
  }
}

testConstructorTracking().catch(console.error);
