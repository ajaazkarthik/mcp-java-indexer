// Debug test to see what's actually in the database
const { MemoryIndexWithStorage } = require('./server/dist/memory-index-storage.js');
const { IndexerClient } = require('./server/dist/indexer-client.js');
const path = require('path');
const Database = require('./server/node_modules/better-sqlite3');

async function debugTest() {
  console.log('🔍 Debugging storage backend...\n');
  
  const testDir = path.join(__dirname, 'test-java-project');
  const dbPath = path.join(testDir, '.mcp-index', 'index.db');
  
  console.log(`Database: ${dbPath}`);
  console.log(`Exists: ${require('fs').existsSync(dbPath)}\n`);
  
  if (!require('fs').existsSync(dbPath)) {
    console.log('❌ Database does not exist!');
    return;
  }
  
  const db = new Database(dbPath);
  
  // Check what tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('📊 Tables in database:');
  tables.forEach(t => console.log(`  - ${t.name}`));
  console.log('');
  
  // Check symbols
  const symbolCount = db.prepare('SELECT COUNT(*) as count FROM symbols').get();
  console.log(`✅ Symbols table: ${symbolCount.count} symbols`);
  
  const symbols = db.prepare('SELECT fqn, name, kind FROM symbols LIMIT 10').all();
  symbols.forEach(s => console.log(`  - ${s.kind}: ${s.fqn}`));
  console.log('');
  
  // Check references
  const refCount = db.prepare('SELECT COUNT(*) as count FROM refs').get();
  console.log(`📝 References table: ${refCount.count} references`);
  
  const refs = db.prepare('SELECT from_fqn, to_fqn, kind FROM refs').all();
  refs.forEach(r => console.log(`  - ${r.kind}: ${r.from_fqn} → ${r.to_fqn}`));
  console.log('');
  
  // Check what to_fqn values look like for "User"
  console.log('🔎 References containing "User":');
  const userRefs = db.prepare('SELECT to_fqn, from_fqn, kind FROM refs WHERE to_fqn LIKE ?').all('%User%');
  userRefs.forEach(r => console.log(`  - to_fqn="${r.to_fqn}", from="${r.from_fqn}", kind="${r.kind}"`));
  console.log('');
  
  // Check call edges (forward)
  const callEdgeCount = db.prepare('SELECT COUNT(*) as count FROM call_edges_forward').get();
  console.log(`📞 Call edges (forward) table: ${callEdgeCount.count} edges`);
  
  const edges = db.prepare('SELECT caller, callee FROM call_edges_forward LIMIT 10').all();
  edges.forEach(e => console.log(`  - ${e.caller} → ${e.callee}`));
  console.log('');
  
  // Now test queries through the API
  console.log('🧪 Testing API queries:\n');
  
  const memoryIndex = new MemoryIndexWithStorage();
  memoryIndex.setIndexDir(testDir);
  await new Promise(resolve => setTimeout(resolve, 500)); // Wait for storage init
  
  // Direct database query to verify data
  console.log('1a. Direct SQL query for com.example.User references:');
  const directRefs = db.prepare('SELECT * FROM refs WHERE to_fqn = ?').all('com.example.User');
  console.log(`   Database has: ${directRefs.length} references`);
  directRefs.forEach(r => console.log(`     - ${r.from_fqn} → ${r.to_fqn} (${r.kind})`));
  
  console.log('\n1b. API findUsages("com.example.User"):');
  const usages = memoryIndex.findUsages('com.example.User');
  console.log(`   API returned: ${usages.length} usages`);
  usages.forEach(u => console.log(`   - ${u.kind}: ${u.fromFqn} → ${u.toFqn}`));
  
  // Direct database query for call edges
  console.log('\n2a. Direct SQL query for createUser outbound calls:');
  const directCalls = db.prepare('SELECT * FROM call_edges_forward WHERE caller = ?').all('com.example.UserService.createUser(String)');
  console.log(`   Database has: ${directCalls.length} calls`);
  directCalls.forEach(c => console.log(`     - ${c.caller} → ${c.callee}`));

  console.log('\n2b. API getOutboundCalls("com.example.UserService.createUser(String)"):');
  const calls = memoryIndex.getOutboundCalls('com.example.UserService.createUser(String)');
  console.log(`   API returned: ${calls.length} calls`);
  calls.forEach(c => console.log(`   - ${c.caller} → ${c.callee}`));
  console.log('');
  
  db.close();
}

debugTest().catch(console.error);
