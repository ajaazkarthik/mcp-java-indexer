const fs = require('fs');
const path = require('path');

// Read persisted index
const indexDir = path.join(__dirname, 'example-java-project', '.mcp-index');
const indexFile = path.join(indexDir, 'index.json');

if (!fs.existsSync(indexFile)) {
  console.log('❌ Index not found. Run indexing first.');
  process.exit(1);
}

const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

console.log('\n=== Constructor Symbols ===\n');
const constructors = indexData.symbols
  .filter(s => s.kind === 'constructor')
  .slice(0, 5);

constructors.forEach(c => {
  console.log(`FQN: ${c.fqn}`);
  console.log(`  Name: ${c.name}`);
  console.log(`  Class: ${c.declaringClass}`);
  console.log('');
});

console.log('\n=== Instantiation References ===\n');
const instantiations = indexData.references
  .filter(r => r.kind === 'instantiation')
  .slice(0, 10);

instantiations.forEach(ref => {
  console.log(`From: ${ref.fromFqn}`);
  console.log(`To: ${ref.toFqn}`);
  console.log(`Kind: ${ref.kind}`);
  console.log(`Location: ${ref.file}:${ref.line}`);
  console.log('');
});

console.log('\n=== Looking for User constructor references ===\n');
const userRefs = indexData.references
  .filter(r => r.toFqn && r.toFqn.includes('User'));

userRefs.forEach(ref => {
  console.log(`${ref.fromFqn} → ${ref.toFqn} (${ref.kind})`);
});
