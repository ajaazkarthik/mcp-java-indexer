#!/usr/bin/env node

/**
 * Test: Path Case Sensitivity Bug Fix (Windows)
 * 
 * BUG: Path case sensitivity on Windows causes all files to be detected as 
 * "changed" during incremental updates.
 * 
 * Root Cause:
 * - normalizePath() only converted backslashes to forward slashes
 * - Windows file system is case-insensitive, but JS Maps are case-sensitive
 * - When paths stored with one case (e.g., "D:/Project/File.java") 
 *   but looked up with another case (e.g., "d:/project/file.java"), they don't match
 * - needsReindex() returned true for ALL files because Map.get(normalizedPath) returned undefined
 * 
 * Fix:
 * - normalizePath() now converts to lowercase on Windows for consistent comparison
 * - Created shared path-utils.ts module for consistent path handling across codebase
 * 
 * This bug was missed in testing because:
 * 1. Tests ran with consistent case (always the same source for paths)
 * 2. No explicit test for case-insensitive path matching
 * 3. CI/CD typically runs on Linux (case-sensitive) where this bug wouldn't manifest
 */

const path = require('path');
const fs = require('fs');

// Test results tracking
let passed = 0;
let failed = 0;

function log(msg) {
  console.log(msg);
}

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    log(`  ✅ ${testName}`);
  } else {
    failed++;
    log(`  ❌ ${testName}${details ? ': ' + details : ''}`);
  }
  return condition;
}

// ============================================================================
// TEST SUITE 1: normalizePath utility function
// ============================================================================

async function testNormalizePathUtility() {
  log('\n🧪 Test Suite 1: normalizePath Utility Function\n');
  
  const { normalizePath, normalizeAbsolutePath, pathsEqual, pathStartsWith } = require('./server/dist/utils/path-utils.js');
  
  // Test 1: Backslash conversion
  log('Testing backslash to forward slash conversion:');
  const backslashPath = 'C:\\Users\\dev\\project\\src\\Main.java';
  const normalized = normalizePath(backslashPath);
  assert(!normalized.includes('\\'), 'Backslashes are converted to forward slashes');
  
  // Test 2: Case normalization on Windows
  log('\nTesting case normalization:');
  if (process.platform === 'win32') {
    const upperCase = 'D:/Project/Src/Main.java';
    const lowerCase = 'd:/project/src/main.java';
    const mixedCase = 'D:/PROJECT/src/MAIN.java';
    
    const normalizedUpper = normalizePath(upperCase);
    const normalizedLower = normalizePath(lowerCase);
    const normalizedMixed = normalizePath(mixedCase);
    
    assert(normalizedUpper === normalizedLower, 'Upper and lower case paths are equal on Windows');
    assert(normalizedUpper === normalizedMixed, 'Mixed case path equals normalized path on Windows');
    assert(normalizedUpper === normalizedUpper.toLowerCase(), 'Normalized path is lowercase on Windows');
  } else {
    log('  ⏭️  Skipping Windows-specific case normalization tests (not on Windows)');
    // On non-Windows, case should be preserved
    const upperCase = '/home/User/Project/Main.java';
    const lowerCase = '/home/user/project/main.java';
    
    const normalizedUpper = normalizePath(upperCase);
    const normalizedLower = normalizePath(lowerCase);
    
    assert(normalizedUpper !== normalizedLower, 'Case is preserved on Unix/Linux/Mac');
  }
  
  // Test 3: pathsEqual helper
  log('\nTesting pathsEqual helper:');
  if (process.platform === 'win32') {
    assert(pathsEqual('D:\\Project\\Main.java', 'd:/project/main.java'), 'pathsEqual handles Windows case insensitivity');
    assert(pathsEqual('C:/Users/DEV', 'c:\\users\\dev'), 'pathsEqual handles mixed path formats');
  }
  
  // Test 4: pathStartsWith helper
  log('\nTesting pathStartsWith helper:');
  if (process.platform === 'win32') {
    assert(pathStartsWith('D:\\Project\\Src\\Main.java', 'D:/Project'), 'pathStartsWith handles Windows case insensitivity');
    assert(pathStartsWith('c:/users/dev/project/file.java', 'C:\\Users\\Dev'), 'pathStartsWith handles mixed path formats');
  }
}

// ============================================================================
// TEST SUITE 2: MemoryIndex path handling
// ============================================================================

async function testMemoryIndexPathHandling() {
  log('\n🧪 Test Suite 2: MemoryIndex Path Handling\n');
  
  const { MemoryIndex } = require('./server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  // Set up test data
  log('Setting up test index:');
  index.setIndexDir('D:\\TestProject');
  
  // Add a file with one case
  const filePath1 = 'D:\\TestProject\\src\\Main.java';
  index.addFile(filePath1, 'hash123', ['com.example.Main'], true);
  
  // Add a symbol with the same case
  index.addSymbol({
    fqn: 'com.example.Main',
    name: 'Main',
    kind: 'class',
    file: filePath1,
    line: 1,
    column: 1,
    packageName: 'com.example',
    modifiers: ['public']
  });
  
  // Test retrieval with different case (simulating what glob might return)
  log('\nTesting file retrieval with different case:');
  
  if (process.platform === 'win32') {
    // On Windows, these should all find the same file
    const lookupPath1 = 'd:\\testproject\\src\\main.java'; // all lowercase
    const lookupPath2 = 'D:/TestProject/Src/Main.java';    // forward slashes, original case
    const lookupPath3 = 'D:/TESTPROJECT/SRC/MAIN.JAVA';    // all uppercase
    
    const file1 = index.getFile(lookupPath1);
    const file2 = index.getFile(lookupPath2);
    const file3 = index.getFile(lookupPath3);
    
    assert(file1 !== undefined, 'File found with lowercase path');
    assert(file2 !== undefined, 'File found with original case path');
    assert(file3 !== undefined, 'File found with uppercase path');
    assert(file1 === file2 && file2 === file3, 'All lookups return the same file info');
  } else {
    log('  ⏭️  Skipping Windows-specific tests (not on Windows)');
    // On Unix, case must match exactly
    const file1 = index.getFile(filePath1);
    assert(file1 !== undefined, 'File found with exact case match');
    
    const wrongCase = '/D/TestProject/src/main.java';
    const file2 = index.getFile(wrongCase);
    // This would be undefined on Unix if cases don't match
    log('  ℹ️  On Unix, paths are case-sensitive by design');
  }
  
  // Test needsReindex with different case
  log('\nTesting needsReindex with different case:');
  
  // Create a temporary test file
  const testDir = path.join(__dirname, '..', '.test-path-case');
  const testFile = path.join(testDir, 'Test.java');
  
  try {
    await fs.promises.mkdir(testDir, { recursive: true });
    await fs.promises.writeFile(testFile, 'public class Test {}');
    
    // Add the file to index
    const { normalizePath } = require('./server/dist/utils/path-utils.js');
    const normalizedTestFile = normalizePath(testFile);
    const hash = require('crypto').createHash('sha256').update('public class Test {}').digest('hex');
    index.addFile(testFile, hash, ['Test'], true);
    
    // Now check needsReindex with different case
    if (process.platform === 'win32') {
      const upperCasePath = testFile.toUpperCase();
      const lowerCasePath = testFile.toLowerCase();
      
      const needsReindex1 = await index.needsReindex(upperCasePath);
      const needsReindex2 = await index.needsReindex(lowerCasePath);
      const needsReindex3 = await index.needsReindex(testFile);
      
      assert(!needsReindex1, 'needsReindex returns false for uppercase path (file unchanged)');
      assert(!needsReindex2, 'needsReindex returns false for lowercase path (file unchanged)');
      assert(!needsReindex3, 'needsReindex returns false for original path (file unchanged)');
    }
    
  } finally {
    // Cleanup
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

// ============================================================================
// TEST SUITE 3: Index Project path handling simulation
// ============================================================================

async function testIndexProjectPathSimulation() {
  log('\n🧪 Test Suite 3: Index Project Path Simulation\n');
  
  if (process.platform !== 'win32') {
    log('  ⏭️  Skipping Windows-specific simulation tests (not on Windows)');
    return;
  }
  
  const { normalizePath, normalizeAbsolutePath } = require('./server/dist/utils/path-utils.js');
  const { MemoryIndex } = require('./server/dist/memory-index.js');
  
  log('Simulating index_project flow with case variations:');
  
  const index = new MemoryIndex();
  const projectRoot = 'D:\\MyJavaProject';
  index.setIndexDir(projectRoot);
  
  // Simulate first index run - files returned by glob with one case
  const firstRunFiles = [
    'D:\\MyJavaProject\\src\\main\\java\\com\\Example\\Service.java',
    'D:\\MyJavaProject\\src\\main\\java\\com\\Example\\Controller.java',
    'D:\\MyJavaProject\\src\\main\\java\\com\\Example\\Repository.java'
  ];
  
  // Add files to index (normalized)
  for (const file of firstRunFiles) {
    const normalized = normalizeAbsolutePath(file);
    index.addFile(file, 'hash_' + path.basename(file), ['com.Example.' + path.basename(file, '.java')], true);
  }
  
  // Simulate second run - glob returns paths with different case
  // This simulates what might happen after Windows updates, or different terminal sessions
  const secondRunFiles = [
    'd:\\myJavaProject\\src\\main\\java\\com\\example\\Service.java',
    'D:/MYJAVAPROJECT/src/main/java/com/Example/Controller.java',
    'D:\\myJavaProject\\Src\\Main\\Java\\Com\\Example\\Repository.java'
  ];
  
  log('\nVerifying file matching across case variations:');
  
  let allMatched = true;
  for (let i = 0; i < secondRunFiles.length; i++) {
    const originalFile = firstRunFiles[i];
    const variantFile = secondRunFiles[i];
    const fileInfo = index.getFile(variantFile);
    
    if (fileInfo) {
      log(`  ✅ ${path.basename(variantFile)} - found with variant case`);
    } else {
      log(`  ❌ ${path.basename(variantFile)} - NOT FOUND (bug would cause full reindex)`);
      allMatched = false;
    }
  }
  
  assert(allMatched, 'All files matched despite case variations (bug fix working)');
  
  // Verify incremental detection
  log('\nVerifying incremental detection:');
  
  const indexedFiles = index.getAllFiles();
  const normalizedSecondRun = secondRunFiles.map(normalizeAbsolutePath);
  const normalizedIndexed = new Set(indexedFiles.map(f => normalizePath(f.path)));
  
  let matchCount = 0;
  for (const file of normalizedSecondRun) {
    if (normalizedIndexed.has(file)) {
      matchCount++;
    }
  }
  
  assert(matchCount === secondRunFiles.length, 
    `All ${secondRunFiles.length} files detected as existing (not new)`,
    `Only ${matchCount}/${secondRunFiles.length} matched`);
}

// ============================================================================
// TEST SUITE 4: Real file system test (if running on Windows)
// ============================================================================

async function testRealFileSystemPaths() {
  log('\n🧪 Test Suite 4: Real File System Path Tests\n');
  
  if (process.platform !== 'win32') {
    log('  ⏭️  Skipping real file system tests (not on Windows)');
    return;
  }
  
  const { normalizeAbsolutePath, normalizePath } = require('./server/dist/utils/path-utils.js');
  
  // Test with actual paths that exist on Windows
  log('Testing with real Windows paths:');
  
  // Get the current directory with different case variations
  const currentDir = process.cwd();
  const currentDirUpper = currentDir.toUpperCase();
  const currentDirLower = currentDir.toLowerCase();
  
  const normalized1 = normalizeAbsolutePath(currentDir);
  const normalized2 = normalizeAbsolutePath(currentDirUpper);
  const normalized3 = normalizeAbsolutePath(currentDirLower);
  
  assert(normalized1 === normalized2, 'Current directory matches uppercase variant');
  assert(normalized1 === normalized3, 'Current directory matches lowercase variant');
  
  // Test with __dirname
  const dirname1 = normalizeAbsolutePath(__dirname);
  const dirname2 = normalizeAbsolutePath(__dirname.toUpperCase());
  const dirname3 = normalizeAbsolutePath(__dirname.toLowerCase());
  
  assert(dirname1 === dirname2, '__dirname matches uppercase variant');
  assert(dirname1 === dirname3, '__dirname matches lowercase variant');
}

// ============================================================================
// TEST SUITE 5: Edge cases
// ============================================================================

async function testEdgeCases() {
  log('\n🧪 Test Suite 5: Edge Cases\n');
  
  const { normalizePath, normalizeAbsolutePath, pathsEqual } = require('./server/dist/utils/path-utils.js');
  
  log('Testing edge cases:');
  
  // Empty string
  assert(normalizePath('') === '', 'Empty string returns empty string');
  
  // Already normalized
  const already = 'd:/project/src/main.java';
  assert(normalizePath(already) === already || normalizePath(already) === already.toLowerCase(), 
    'Already normalized path returns same (or lowercase on Windows)');
  
  // UNC paths (Windows network paths)
  if (process.platform === 'win32') {
    const uncPath = '\\\\server\\share\\project\\file.java';
    const normalizedUnc = normalizePath(uncPath);
    assert(!normalizedUnc.includes('\\'), 'UNC path backslashes converted');
    assert(normalizedUnc.startsWith('//'), 'UNC path maintains double-slash prefix');
  }
  
  // Mixed separators
  const mixed = 'D:/project\\src/main\\java/Test.java';
  const normalizedMixed = normalizePath(mixed);
  assert(!normalizedMixed.includes('\\'), 'Mixed separators all converted to forward slash');
  
  // Multiple consecutive slashes
  const multiSlash = 'D://project///src//Main.java';
  const normalizedMulti = normalizePath(multiSlash);
  // Note: We don't collapse multiple slashes, but that's OK for our use case
  assert(!normalizedMulti.includes('\\'), 'Multiple slashes don\'t cause issues');
  
  // Paths with special characters (if supported)
  const specialChars = 'D:/my project (1)/src/Main.java';
  const normalizedSpecial = normalizePath(specialChars);
  assert(normalizedSpecial.includes('my project (1)') || normalizedSpecial.includes('my project (1)'.toLowerCase()), 
    'Special characters in path preserved');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  log('═══════════════════════════════════════════════════════════════════════');
  log('  PATH CASE SENSITIVITY BUG FIX TESTS');
  log('  Platform: ' + process.platform);
  log('  Node: ' + process.version);
  log('═══════════════════════════════════════════════════════════════════════');
  
  try {
    await testNormalizePathUtility();
    await testMemoryIndexPathHandling();
    await testIndexProjectPathSimulation();
    await testRealFileSystemPaths();
    await testEdgeCases();
    
  } catch (error) {
    console.error('\n💥 Test error:', error);
    failed++;
  }
  
  log('\n═══════════════════════════════════════════════════════════════════════');
  log(`  Results: ${passed} passed, ${failed} failed`);
  log('═══════════════════════════════════════════════════════════════════════');
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

main();
