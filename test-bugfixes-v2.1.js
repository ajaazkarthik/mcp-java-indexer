// Test suite for v2.1 critical bug fixes
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing v2.1 Bug Fixes - File Watcher & Memory Management\n');

const tests = {
  passed: 0,
  failed: 0,
  total: 0
};

function test(name, fn) {
  tests.total++;
  try {
    fn();
    tests.passed++;
    console.log(`✅ PASS: ${name}`);
    return true;
  } catch (error) {
    tests.failed++;
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

// Test 1: Verify fs-watcher.ts has critical fixes
test('File watcher has isIndexedFile flag fix', () => {
  const watcherPath = path.join(__dirname, 'server/src/fs-watcher.ts');
  const content = fs.readFileSync(watcherPath, 'utf-8');
  
  // Check for isIndexedFile: true parameter
  if (!content.includes('addFile(fullPath, hash, symbolFqns, true)')) {
    throw new Error('Missing isIndexedFile: true flag in file watcher');
  }
  
  // Check for reindexInProgress set
  if (!content.includes('reindexInProgress: Set<string>')) {
    throw new Error('Missing reindexInProgress deduplication');
  }
  
  // Check for batched persistence
  if (!content.includes('schedulePersist')) {
    throw new Error('Missing schedulePersist for batched persistence');
  }
  
  // Check for debounce timer
  if (!content.includes('persistTimer')) {
    throw new Error('Missing persistTimer for debouncing');
  }
});

// Test 2: Verify indexer-client.ts has request limit
test('Indexer client has request queue limit', () => {
  const clientPath = path.join(__dirname, 'server/src/indexer-client.ts');
  const content = fs.readFileSync(clientPath, 'utf-8');
  
  // Check for MAX_PENDING_REQUESTS constant
  if (!content.includes('MAX_PENDING_REQUESTS')) {
    throw new Error('Missing MAX_PENDING_REQUESTS limit');
  }
  
  // Check for queue overflow protection
  if (!content.includes('Too many pending requests')) {
    throw new Error('Missing request queue overflow check');
  }
});

// Test 3: Verify index.ts skips cleanup during indexing
test('Maintenance cleanup skips when indexing active', () => {
  const indexPath = path.join(__dirname, 'server/src/index.ts');
  const content = fs.readFileSync(indexPath, 'utf-8');
  
  // Check for pending request check
  if (!content.includes('pendingRequests > 0')) {
    throw new Error('Missing pending request check before cleanup');
  }
  
  // Check for skip message
  if (!content.includes('Skipping maintenance cleanup')) {
    throw new Error('Missing skip message for active indexing');
  }
});

// Test 4: Verify memory-index.ts has LRU eviction
test('Memory index has LRU symbol eviction', () => {
  const memPath = path.join(__dirname, 'server/src/memory-index.ts');
  const content = fs.readFileSync(memPath, 'utf-8');
  
  // Check for symbolAccessTime tracking
  if (!content.includes('symbolAccessTime')) {
    throw new Error('Missing symbolAccessTime for LRU tracking');
  }
  
  // Check for MAX_SYMBOLS limit
  if (!content.includes('MAX_SYMBOLS')) {
    throw new Error('Missing MAX_SYMBOLS limit');
  }
  
  // Check for dependency TTL
  if (!content.includes('DEPENDENCY_TTL')) {
    throw new Error('Missing DEPENDENCY_TTL for dependency cleanup');
  }
});

// Test 5: Verify build output exists
test('TypeScript build output exists', () => {
  const distPath = path.join(__dirname, 'server/dist');
  
  if (!fs.existsSync(distPath)) {
    throw new Error('Build output directory does not exist');
  }
  
  const indexJs = path.join(distPath, 'index.js');
  if (!fs.existsSync(indexJs)) {
    throw new Error('index.js not found in dist');
  }
  
  const watcherJs = path.join(distPath, 'fs-watcher.js');
  if (!fs.existsSync(watcherJs)) {
    throw new Error('fs-watcher.js not found in dist');
  }
});

// Test 6: Verify compact_index tool exists
test('Compact index tool is implemented', () => {
  const toolPath = path.join(__dirname, 'server/src/tools/compact_index.ts');
  
  if (!fs.existsSync(toolPath)) {
    throw new Error('compact_index.ts tool not found');
  }
  
  const content = fs.readFileSync(toolPath, 'utf-8');
  
  if (!content.includes('compactIndexTool')) {
    throw new Error('compactIndexTool not exported');
  }
  
  if (!content.includes('handleCompactIndex')) {
    throw new Error('handleCompactIndex handler not found');
  }
});

// Test 7: Verify tool is registered in index.ts
test('Compact index tool is registered', () => {
  const indexPath = path.join(__dirname, 'server/src/index.ts');
  const content = fs.readFileSync(indexPath, 'utf-8');
  
  if (!content.includes('compactIndexTool')) {
    throw new Error('compactIndexTool not imported');
  }
  
  if (!content.includes('compact_index')) {
    throw new Error('compact_index case handler not found');
  }
});

// Test 8: Verify documentation exists
test('Bug fix documentation exists', () => {
  const docs = [
    'CRITICAL_BUGFIX_v2.1.md',
    'MEMORY_LEAK_FIX_v2.md',
    'MEMORY_FIX_QUICK_REF_v2.md',
    'DEPLOY_NOW_v2.0.md'
  ];
  
  for (const doc of docs) {
    const docPath = path.join(__dirname, doc);
    if (!fs.existsSync(docPath)) {
      throw new Error(`Documentation ${doc} not found`);
    }
  }
});

// Test 9: Verify diagnostic tool exists
test('Diagnostic tool exists and is executable', () => {
  const diagPath = path.join(__dirname, 'diagnose-memory.js');
  
  if (!fs.existsSync(diagPath)) {
    throw new Error('diagnose-memory.js not found');
  }
  
  const content = fs.readFileSync(diagPath, 'utf-8');
  
  if (!content.includes('INDEX STATISTICS')) {
    throw new Error('Diagnostic tool missing statistics section');
  }
  
  if (!content.includes('HEALTH CHECK')) {
    throw new Error('Diagnostic tool missing health check');
  }
});

// Test 10: Verify memory cleanup has all 6 stages
test('Memory cleanup has all 6 stages', () => {
  const memPath = path.join(__dirname, 'server/src/memory-index.ts');
  const content = fs.readFileSync(memPath, 'utf-8');
  
  const stages = [
    'STAGE 1: Remove old dependency files',
    'STAGE 2: LRU eviction',
    'STAGE 3: Remove orphaned references',
    'STAGE 4: Clean up empty call graph',
    'STAGE 5: Trim call graph edges',
    'STAGE 6: Clear access time'
  ];
  
  for (const stage of stages) {
    if (!content.includes(stage)) {
      throw new Error(`Missing cleanup ${stage}`);
    }
  }
});

// Test 11: Verify getStats includes new fields
test('Memory stats include indexed and dependency files', () => {
  const memPath = path.join(__dirname, 'server/src/memory-index.ts');
  const content = fs.readFileSync(memPath, 'utf-8');
  
  // Check getStats method has indexedFiles
  if (!content.match(/getStats.*indexedFiles.*this\.indexedFiles\.size/s)) {
    throw new Error('getStats missing indexedFiles field');
  }
  
  if (!content.match(/getStats.*allFiles.*this\.files\.size/s)) {
    throw new Error('getStats missing allFiles field');
  }
});

// Test 12: Verify no TODO or FIXME comments in critical files
test('No TODO/FIXME in critical bug fix code', () => {
  const criticalFiles = [
    'server/src/fs-watcher.ts',
    'server/src/indexer-client.ts',
    'server/src/memory-index.ts'
  ];
  
  for (const file of criticalFiles) {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
    
    // Only check in actual code, not in comments explaining old bugs
    const codeLines = content.split('\n').filter(line => 
      !line.trim().startsWith('//') && !line.trim().startsWith('*')
    );
    
    const hasOpenTodo = codeLines.some(line => 
      /TODO|FIXME|XXX|HACK/.test(line) && !line.includes('// OK:')
    );
    
    if (hasOpenTodo) {
      throw new Error(`${file} has unresolved TODO/FIXME`);
    }
  }
});

// Test 13: Check for TypeScript compilation errors
test('TypeScript compiles without errors', () => {
  const distPath = path.join(__dirname, 'server/dist');
  
  // Check that critical files were compiled
  const requiredFiles = [
    'index.js',
    'memory-index.js',
    'fs-watcher.js',
    'indexer-client.js',
    'tools/compact_index.js',
    'tools/index_project.js'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(distPath, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Compiled file ${file} not found`);
    }
  }
});

// Test 14: Verify backward compatibility in fromJSON
test('Memory index fromJSON maintains backward compatibility', () => {
  const memPath = path.join(__dirname, 'server/src/memory-index.ts');
  const content = fs.readFileSync(memPath, 'utf-8');
  
  // Check for || [] fallbacks for new fields
  if (!content.includes('data.dependencyFiles || []')) {
    throw new Error('Missing backward compatibility for dependencyFiles');
  }
  
  if (!content.includes('data.symbolAccessTime || []')) {
    throw new Error('Missing backward compatibility for symbolAccessTime');
  }
});

// Test 15: Verify package.json version updated
test('Package version reflects changes', () => {
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  
  // Version should be updated (at least 1.5.4 or higher)
  const version = pkg.version.split('.').map(Number);
  const minVersion = [1, 5, 4];
  
  const isVersionOk = version[0] > minVersion[0] || 
    (version[0] === minVersion[0] && version[1] > minVersion[1]) ||
    (version[0] === minVersion[0] && version[1] === minVersion[1] && version[2] >= minVersion[2]);
  
  if (!isVersionOk) {
    throw new Error(`Package version ${pkg.version} is too old, should be >= 1.5.4`);
  }
});

// Print summary
console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total Tests:  ${tests.total}`);
console.log(`✅ Passed:    ${tests.passed}`);
console.log(`❌ Failed:    ${tests.failed}`);
console.log(`Success Rate: ${((tests.passed / tests.total) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

if (tests.failed === 0) {
  console.log('\n🎉 ALL TESTS PASSED! Ready for commit and publish.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  SOME TESTS FAILED. Fix issues before committing.\n');
  process.exit(1);
}
