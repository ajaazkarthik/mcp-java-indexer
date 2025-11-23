const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, 'example-java-project');

async function debugConstructorMatching() {
  console.log('=== Debug Constructor Fuzzy Matching ===\n');

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
    console.log('Indexing...\n');
    await client.callTool({
      name: 'index_project',
      arguments: { rootDir }
    });

    // Wait for persistence
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Read index
    const indexFile = path.join(rootDir, '.mcp-index', 'index.json');
    const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

    console.log('=== Constructor Symbol ===\n');
    const userConstructor = indexData.symbols.find(s => s.fqn && s.fqn.includes('User.User'));
    if (userConstructor) {
      console.log(`FQN: ${userConstructor.fqn}`);
      console.log(`Kind: ${userConstructor.kind}`);
      
      // Parse FQN
      const parts = userConstructor.fqn.split('.');
      const methodName = parts[parts.length - 1];
      const baseMethodName = methodName.split('(')[0];
      const className = parts[parts.length - 2];
      const isConstructor = className === baseMethodName;
      
      console.log(`\nParsed components:`);
      console.log(`  parts: ${JSON.stringify(parts)}`);
      console.log(`  methodName: ${methodName}`);
      console.log(`  baseMethodName: ${baseMethodName}`);
      console.log(`  className: ${className}`);
      console.log(`  isConstructor: ${isConstructor}`);
    }

    console.log('\n=== Instantiation References ===\n');
    const instantiations = indexData.references.filter(r => r.kind === 'instantiation');
    const userInst = instantiations.filter(r => r.toFqn === 'User');
    console.log(`Found ${userInst.length} instantiation(s) of "User":`);
    userInst.forEach(ref => {
      console.log(`  ${ref.fromFqn} → ${ref.toFqn} (kind: ${ref.kind})`);
    });

    console.log('\n=== Reverse Call Graph Keys ===\n');
    if (indexData.reverseCallGraph) {
      const keys = Object.keys(indexData.reverseCallGraph);
      console.log(`Total keys: ${keys.length}`);
      
      const userKeys = keys.filter(k => k === 'User' || k.includes('User'));
      console.log(`\nKeys related to "User": ${userKeys.length}`);
      userKeys.forEach(k => {
        const callers = indexData.reverseCallGraph[k];
        console.log(`  "${k}" has ${callers.length} caller(s)`);
        if (k === 'User') {
          callers.forEach(c => {
            console.log(`    - ${c.caller} (${c.callee})`);
          });
        }
      });
    }

    console.log('\n=== Fuzzy Matching Logic Test ===\n');
    const constructorFqn = userConstructor ? userConstructor.fqn : 'com.example.demo.User.User(String, String)';
    const parts = constructorFqn.split('.');
    const methodName = parts[parts.length - 1];
    const baseMethodName = methodName.split('(')[0];
    const className = parts[parts.length - 2];
    const isConstructor = className === baseMethodName;

    console.log(`Looking for inbound calls to: ${constructorFqn}`);
    console.log(`isConstructor: ${isConstructor}`);
    console.log(`className: ${className}`);
    console.log(`\nChecking if "User" would match...`);
    
    const callee = 'User';
    console.log(`  Pattern 4 check: isConstructor=${isConstructor} && callee="${callee}" === className="${className}"`);
    console.log(`  Result: ${isConstructor && callee === className}`);

  } finally {
    await client.close();
  }
}

debugConstructorMatching().catch(console.error);
