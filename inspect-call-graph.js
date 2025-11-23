const fs = require('fs');
const path = require('path');

// Check if index exists and inspect it
const indexPath = path.join(__dirname, 'example-java-project', '.mcp-index', 'index.json');

if (!fs.existsSync(indexPath)) {
  console.log('Index not found. Please run index_project first.');
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

console.log('=== INDEX STATISTICS ===\n');
console.log(`Symbols: ${Object.keys(index.symbols).length}`);
console.log(`Files: ${Object.keys(index.files).length}`);
console.log(`References: ${index.references?.length || 0}`);
console.log(`Call Graph Entries: ${Object.keys(index.callGraph || {}).length}`);
console.log(`Reverse Call Graph Entries: ${Object.keys(index.reverseCallGraph || {}).length}`);

console.log('\n=== METHOD CALL REFERENCES ===\n');
const methodCallRefs = (index.references || []).filter(r => r.kind === 'method_call');
console.log(`Total method_call references: ${methodCallRefs.length}`);

if (methodCallRefs.length > 0) {
  console.log('\nFirst 5 method call references:');
  for (const ref of methodCallRefs.slice(0, 5)) {
    console.log(`  ${ref.fromFqn} -> ${ref.toFqn}`);
    console.log(`    at ${ref.file}:${ref.line}`);
  }
}

console.log('\n=== CALL GRAPH EDGES ===\n');
const callGraphEntries = Object.entries(index.callGraph || {});
console.log(`Total callers in call graph: ${callGraphEntries.length}`);

if (callGraphEntries.length > 0) {
  console.log('\nFirst 3 call graph entries:');
  for (const [caller, edges] of callGraphEntries.slice(0, 3)) {
    console.log(`\n  ${caller} calls:`);
    for (const edge of edges.slice(0, 3)) {
      console.log(`    -> ${edge.callee} (${edge.locations.length} locations)`);
    }
  }
}

console.log('\n=== REVERSE CALL GRAPH ===\n');
const revCallGraphEntries = Object.entries(index.reverseCallGraph || {});
console.log(`Total callees in reverse call graph: ${revCallGraphEntries.length}`);

if (revCallGraphEntries.length > 0) {
  console.log('\nFirst 3 reverse call graph entries:');
  for (const [callee, edges] of revCallGraphEntries.slice(0, 3)) {
    console.log(`\n  ${callee} is called by:`);
    for (const edge of edges.slice(0, 3)) {
      console.log(`    <- ${edge.caller} (${edge.locations.length} locations)`);
    }
  }
}

// Check specifically for UserService.createUser
console.log('\n=== USERSERVICE.CREATEUSER ANALYSIS ===\n');

const createUserMethods = Object.keys(index.symbols).filter(k => 
  k.includes('UserService') && k.includes('createUser')
);

console.log(`Found ${createUserMethods.length} createUser methods:`);
for (const fqn of createUserMethods) {
  console.log(`  ${fqn}`);
  
  // Check if it has outbound calls
  const outbound = index.callGraph?.[fqn] || [];
  console.log(`    Outbound calls: ${outbound.length}`);
  for (const edge of outbound.slice(0, 3)) {
    console.log(`      -> ${edge.callee}`);
  }
  
  // Check if it has inbound calls
  const inbound = index.reverseCallGraph?.[fqn] || [];
  console.log(`    Inbound calls: ${inbound.length}`);
  for (const edge of inbound.slice(0, 3)) {
    console.log(`      <- ${edge.caller}`);
  }
}
