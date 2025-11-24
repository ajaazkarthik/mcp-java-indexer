// Memory Leak Diagnostic Tool
// Usage: node diagnose-memory.js [index-dir]

const fs = require('fs');
const path = require('path');

const indexDir = process.argv[2] || '.mcp-index';
const indexFile = path.join(indexDir, 'index.json');

console.log('🔍 MCP Java Indexer - Memory Diagnostic\n');

// Check if index exists
if (!fs.existsSync(indexFile)) {
  console.log('❌ No index found at:', indexFile);
  console.log('   Run index_project first to create an index.\n');
  process.exit(1);
}

// Load index
console.log('Loading index from:', indexFile);
const stats = fs.statSync(indexFile);
const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
console.log('Index file size:', sizeMB, 'MB\n');

try {
  const data = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
  
  // Analyze symbols
  const symbols = new Map(data.symbols || []);
  const files = new Map(data.files || []);
  const indexedFiles = new Set(data.indexedFiles || []);
  const dependencyFiles = new Set(data.dependencyFiles || []);
  const references = data.references || [];
  const symbolAccessTime = new Map(data.symbolAccessTime || []);
  
  console.log('📊 INDEX STATISTICS\n');
  console.log('Total Symbols:       ', symbols.size.toLocaleString());
  console.log('Total Files:         ', files.size.toLocaleString());
  console.log('Indexed Files:       ', indexedFiles.size.toLocaleString());
  console.log('Dependency Files:    ', dependencyFiles.size.toLocaleString());
  console.log('References:          ', references.length.toLocaleString());
  console.log('Access Timestamps:   ', symbolAccessTime.size.toLocaleString());
  
  // Analyze symbols by type
  console.log('\n📦 SYMBOLS BY TYPE\n');
  const symbolsByKind = {};
  for (const [fqn, stub] of symbols) {
    symbolsByKind[stub.kind] = (symbolsByKind[stub.kind] || 0) + 1;
  }
  for (const [kind, count] of Object.entries(symbolsByKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(15)}: ${count.toLocaleString()}`);
  }
  
  // Categorize symbols
  console.log('\n🏷️  SYMBOL CATEGORIES\n');
  let indexedSymbols = 0;
  let dependencySymbols = 0;
  
  for (const filePath of indexedFiles) {
    const fileInfo = files.get(filePath);
    if (fileInfo) {
      indexedSymbols += fileInfo.symbols.length;
    }
  }
  
  for (const filePath of dependencyFiles) {
    const fileInfo = files.get(filePath);
    if (fileInfo) {
      dependencySymbols += fileInfo.symbols.length;
    }
  }
  
  console.log(`  Indexed Project:     ${indexedSymbols.toLocaleString()} symbols`);
  console.log(`  Dependencies:        ${dependencySymbols.toLocaleString()} symbols`);
  console.log(`  Untracked/Orphaned:  ${(symbols.size - indexedSymbols - dependencySymbols).toLocaleString()} symbols`);
  
  // LRU analysis
  if (symbolAccessTime.size > 0) {
    console.log('\n⏰ LRU ACCESS PATTERN\n');
    const now = Date.now();
    const accessAges = Array.from(symbolAccessTime.values()).map(t => (now - t) / 1000 / 60); // minutes
    accessAges.sort((a, b) => a - b);
    
    console.log(`  Tracked Symbols:     ${symbolAccessTime.size.toLocaleString()}`);
    console.log(`  Oldest Access:       ${Math.round(accessAges[accessAges.length - 1])} minutes ago`);
    console.log(`  Median Access:       ${Math.round(accessAges[Math.floor(accessAges.length / 2)])} minutes ago`);
    console.log(`  Newest Access:       ${Math.round(accessAges[0])} minutes ago`);
    
    // Age distribution
    const age5min = accessAges.filter(a => a < 5).length;
    const age30min = accessAges.filter(a => a >= 5 && a < 30).length;
    const age1hr = accessAges.filter(a => a >= 30 && a < 60).length;
    const ageOld = accessAges.filter(a => a >= 60).length;
    
    console.log('\n  Age Distribution:');
    console.log(`    < 5 min:           ${age5min.toLocaleString()} (${(age5min/accessAges.length*100).toFixed(1)}%)`);
    console.log(`    5-30 min:          ${age30min.toLocaleString()} (${(age30min/accessAges.length*100).toFixed(1)}%)`);
    console.log(`    30-60 min:         ${age1hr.toLocaleString()} (${(age1hr/accessAges.length*100).toFixed(1)}%)`);
    console.log(`    > 60 min:          ${ageOld.toLocaleString()} (${(ageOld/accessAges.length*100).toFixed(1)}%)`);
  }
  
  // Memory estimate
  console.log('\n💾 ESTIMATED MEMORY USAGE\n');
  const avgSymbolSize = 500; // bytes per symbol (estimate)
  const avgRefSize = 150; // bytes per reference (estimate)
  const symbolMemMB = (symbols.size * avgSymbolSize / 1024 / 1024).toFixed(1);
  const refMemMB = (references.length * avgRefSize / 1024 / 1024).toFixed(1);
  const totalMemMB = (parseFloat(symbolMemMB) + parseFloat(refMemMB)).toFixed(1);
  
  console.log(`  Symbols:             ~${symbolMemMB} MB`);
  console.log(`  References:          ~${refMemMB} MB`);
  console.log(`  Total Estimate:      ~${totalMemMB} MB`);
  console.log(`  Disk Size:           ${sizeMB} MB`);
  
  // Health check
  console.log('\n🏥 HEALTH CHECK\n');
  const MAX_SYMBOLS = 300000;
  const MAX_REFS_PER_FILE = 1000;
  
  const issues = [];
  
  if (symbols.size > MAX_SYMBOLS) {
    issues.push(`⚠️  Symbol count (${symbols.size.toLocaleString()}) exceeds recommended max (${MAX_SYMBOLS.toLocaleString()})`);
  } else {
    console.log(`✅ Symbol count within limits (${symbols.size.toLocaleString()} / ${MAX_SYMBOLS.toLocaleString()})`);
  }
  
  // Check for files with excessive references
  const refsByFile = new Map();
  for (const ref of references) {
    refsByFile.set(ref.file, (refsByFile.get(ref.file) || 0) + 1);
  }
  
  let excessiveRefFiles = 0;
  for (const [file, count] of refsByFile) {
    if (count > MAX_REFS_PER_FILE) {
      excessiveRefFiles++;
    }
  }
  
  if (excessiveRefFiles > 0) {
    issues.push(`⚠️  ${excessiveRefFiles} files have > ${MAX_REFS_PER_FILE} references`);
  } else {
    console.log(`✅ No files with excessive references`);
  }
  
  // Check for orphaned symbols (not in any file)
  const symbolsInFiles = new Set();
  for (const [filePath, fileInfo] of files) {
    for (const fqn of fileInfo.symbols) {
      symbolsInFiles.add(fqn);
    }
  }
  const orphanedSymbols = symbols.size - symbolsInFiles.size;
  if (orphanedSymbols > symbols.size * 0.1) { // > 10% orphaned
    issues.push(`⚠️  ${orphanedSymbols.toLocaleString()} orphaned symbols (${(orphanedSymbols/symbols.size*100).toFixed(1)}%)`);
  } else {
    console.log(`✅ Low orphaned symbol rate (${orphanedSymbols.toLocaleString()}, ${(orphanedSymbols/symbols.size*100).toFixed(1)}%)`);
  }
  
  // Check dependency cleanup
  if (dependencyFiles.size > 100000) {
    issues.push(`⚠️  Excessive dependency files (${dependencyFiles.size.toLocaleString()}), cleanup may be needed`);
  } else {
    console.log(`✅ Dependency file count reasonable (${dependencyFiles.size.toLocaleString()})`);
  }
  
  // Summary
  if (issues.length === 0) {
    console.log('\n✅ INDEX IS HEALTHY - No issues detected');
  } else {
    console.log('\n⚠️  ISSUES DETECTED:\n');
    issues.forEach(issue => console.log('  ' + issue));
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('   1. Run: @java-indexer compact_index with aggressive: true');
    console.log('   2. Consider reducing MAX_SYMBOLS threshold in memory-index.ts');
    console.log('   3. Check DEPENDENCY_TTL (currently 30 minutes)');
  }
  
  // Cleanup recommendations
  if (dependencySymbols > indexedSymbols) {
    console.log('\n💡 TIP: Dependencies outnumber project symbols. Consider:');
    console.log('   - Reducing DEPENDENCY_TTL (currently 30 min)');
    console.log('   - Using --exclude patterns to skip test dependencies');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Diagnostic complete. For real-time monitoring, watch server logs.');
  console.log('='.repeat(60) + '\n');
  
} catch (error) {
  console.error('❌ Error reading index:', error.message);
  process.exit(1);
}
