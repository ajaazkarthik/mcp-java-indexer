#!/usr/bin/env node

/**
 * Test Suite: Mtime and Hash Synchronization
 * 
 * Tests the fix for the stale index warning bug where:
 * - index_project uses HASH comparison to detect changes
 * - index-validator uses MTIME comparison for staleness
 * - Files passing hash check need mtime updated to prevent false positives
 * 
 * Bug: After git operations (checkout/pull/merge), files have new mtime but
 * same content (same hash). Without mtime sync, index-validator reports them
 * as "changed" causing perpetual false warnings.
 * 
 * Created: 2025-12-03
 */

const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

// Test configuration
const TEST_DIR = path.join(__dirname, '..', '.test-mtime-sync');
const VERBOSE = process.argv.includes('--verbose');

// Test tracking
let passed = 0;
let failed = 0;
const failures = [];

function log(msg) {
  console.log(msg);
}

function verbose(msg) {
  if (VERBOSE) console.log(`  [verbose] ${msg}`);
}

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    log(`  ✅ ${testName}`);
  } else {
    failed++;
    failures.push({ testName, details });
    log(`  ❌ ${testName}${details ? ': ' + details : ''}`);
  }
}

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch (e) {}
}

async function setupTestDir() {
  await cleanup();
  await fs.mkdir(TEST_DIR, { recursive: true });
}

// ============================================================================
// TEST SUITE 1: MemoryIndex.updateFileMtime() API
// ============================================================================

async function testUpdateFileMtimeAPI() {
  log('\n🧪 Test Suite 1: MemoryIndex.updateFileMtime() API\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  // Test: Method exists
  const methodExists = typeof index.updateFileMtime === 'function';
  assert(methodExists, 'updateFileMtime() method exists');
  if (!methodExists) {
    log('  ⚠️ Skipping remaining tests - method not found');
    return;
  }
  
  // Setup: Add a test file to the index
  const testFilePath = '/test/project/src/Example.java';
  const testHash = 'abc123def456';
  const originalMtime = Date.now() - 10000; // 10 seconds ago
  
  index.addFile(testFilePath, testHash, ['com.example.Example'], true, originalMtime);
  
  // Verify file was added
  const fileInfo = index.getFile(testFilePath);
  assert(fileInfo !== undefined, 'Test file was added to index');
  assert(fileInfo?.mtime === originalMtime, 'Original mtime is stored correctly');
  
  // Test: updateFileMtime with newer mtime should succeed
  const newerMtime = Date.now();
  const updated = index.updateFileMtime(testFilePath, newerMtime);
  assert(updated === true, 'updateFileMtime returns true for newer mtime');
  
  const updatedFileInfo = index.getFile(testFilePath);
  assert(updatedFileInfo?.mtime === newerMtime, 'Mtime was updated to new value');
  
  // Test: updateFileMtime with older mtime should not update
  const olderMtime = originalMtime - 5000;
  const notUpdated = index.updateFileMtime(testFilePath, olderMtime);
  assert(notUpdated === false, 'updateFileMtime returns false for older mtime');
  
  const unchangedFileInfo = index.getFile(testFilePath);
  assert(unchangedFileInfo?.mtime === newerMtime, 'Mtime was NOT changed to older value');
  
  // Test: updateFileMtime on non-existent file should return false
  const nonExistentResult = index.updateFileMtime('/non/existent/file.java', Date.now());
  assert(nonExistentResult === false, 'updateFileMtime returns false for non-existent file');
}

// ============================================================================
// TEST SUITE 2: Hash vs Mtime Detection Logic
// ============================================================================

async function testHashVsMtimeDetection() {
  log('\n🧪 Test Suite 2: Hash vs Mtime Detection Logic\n');
  
  await setupTestDir();
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  // Create a real test file
  const testFilePath = path.join(TEST_DIR, 'TestClass.java').replace(/\\/g, '/');
  const testContent = 'public class TestClass { }';
  await fs.writeFile(testFilePath, testContent);
  
  // Get the actual file stats
  const stats1 = await fs.stat(testFilePath);
  const hash = crypto.createHash('sha256').update(testContent).digest('hex');
  
  // Add file to index with current hash and mtime
  index.addFile(testFilePath, hash, ['TestClass'], true, stats1.mtimeMs);
  
  // Verify needsReindex returns false (hash matches)
  const needsReindex1 = await index.needsReindex(testFilePath);
  assert(needsReindex1 === false, 'needsReindex returns false when hash matches');
  
  // Simulate git operation: touch file to update mtime without changing content
  await new Promise(resolve => setTimeout(resolve, 100)); // Wait a bit
  const now = new Date();
  await fs.utimes(testFilePath, now, now);
  
  // Get new stats
  const stats2 = await fs.stat(testFilePath);
  verbose(`Original mtime: ${stats1.mtimeMs}, New mtime: ${stats2.mtimeMs}`);
  
  // Hash should still match
  const needsReindex2 = await index.needsReindex(testFilePath);
  assert(needsReindex2 === false, 'needsReindex still returns false after mtime-only change');
  
  // BUT: The index mtime is now stale - this would trigger false positive in validator
  const indexedFile = index.getFile(testFilePath);
  const mtimeIsStale = stats2.mtimeMs > (indexedFile?.mtime || 0);
  assert(mtimeIsStale === true, 'Indexed mtime is stale after file touch (the bug scenario)');
  
  // Apply the fix: update mtime for files that pass hash check
  const mtimeUpdated = index.updateFileMtime(testFilePath, stats2.mtimeMs);
  assert(mtimeUpdated === true, 'Mtime sync succeeded for unchanged file');
  
  // Verify mtime is now in sync
  const fixedFile = index.getFile(testFilePath);
  const mtimeNowSynced = fixedFile?.mtime === stats2.mtimeMs;
  assert(mtimeNowSynced === true, 'Mtime is now synced after fix applied');
}

// ============================================================================
// TEST SUITE 3: Index Validator Staleness Check
// ============================================================================

async function testIndexValidatorStaleness() {
  log('\n🧪 Test Suite 3: Index Validator Staleness Check\n');
  
  await setupTestDir();
  
  // Create test Java files
  const srcDir = path.join(TEST_DIR, 'src');
  await fs.mkdir(srcDir, { recursive: true });
  
  const file1Path = path.join(srcDir, 'File1.java').replace(/\\/g, '/');
  const file2Path = path.join(srcDir, 'File2.java').replace(/\\/g, '/');
  
  await fs.writeFile(file1Path, 'public class File1 {}');
  await fs.writeFile(file2Path, 'public class File2 {}');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  const { IndexValidator } = await import('../server/dist/index-validator.js');
  
  const index = new MemoryIndex();
  const validator = new IndexValidator();
  validator.configure(TEST_DIR, ['src']);
  
  // Index both files with OLD mtimes (simulate index from yesterday)
  const stats1 = await fs.stat(file1Path);
  const stats2 = await fs.stat(file2Path);
  const hash1 = crypto.createHash('sha256').update('public class File1 {}').digest('hex');
  const hash2 = crypto.createHash('sha256').update('public class File2 {}').digest('hex');
  
  // Use old mtime to simulate stale index (5 seconds old - beyond 2s tolerance)
  const oldMtime = stats1.mtimeMs - 5000;
  index.addFile(file1Path, hash1, ['File1'], true, oldMtime);
  index.addFile(file2Path, hash2, ['File2'], true, stats2.mtimeMs);
  
  // Validator should report File1 as changed (mtime is stale beyond tolerance)
  const resultBeforeFix = await validator.checkStaleness(index);
  verbose(`Before fix - isStale: ${resultBeforeFix.isStale}, changed: ${resultBeforeFix.changedFiles.length}`);
  
  // This demonstrates the bug: file has newer disk mtime than indexed mtime
  const hasStaleWarning = resultBeforeFix.isStale && resultBeforeFix.changedFiles.length > 0;
  assert(hasStaleWarning, 'Without mtime sync, validator reports stale (demonstrates bug scenario)');
  
  // Apply the fix: sync mtime for File1
  index.updateFileMtime(file1Path, stats1.mtimeMs);
  
  // After fix: validator should NOT report stale
  const validator2 = new IndexValidator();
  validator2.configure(TEST_DIR, ['src']);
  
  const resultAfterFix = await validator2.checkStaleness(index);
  verbose(`After fix - isStale: ${resultAfterFix.isStale}, changed: ${resultAfterFix.changedFiles.length}`);
  
  const fixedStaleCheck = !resultAfterFix.isStale || resultAfterFix.changedFiles.length === 0;
  assert(fixedStaleCheck, 'After mtime sync, validator reports no false positives');
}

// ============================================================================
// TEST SUITE 4: Bulk Git Operation Simulation
// ============================================================================

async function testBulkGitOperationSimulation() {
  log('\n🧪 Test Suite 4: Bulk Git Operation Simulation\n');
  
  await setupTestDir();
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  // Create multiple test files to simulate a git checkout touching many files
  const srcDir = path.join(TEST_DIR, 'src');
  await fs.mkdir(srcDir, { recursive: true });
  
  const fileCount = 20;
  const files = [];
  
  for (let i = 0; i < fileCount; i++) {
    const filePath = path.join(srcDir, `Class${i}.java`).replace(/\\/g, '/');
    const content = `public class Class${i} {}`;
    await fs.writeFile(filePath, content);
    
    const stats = await fs.stat(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    
    files.push({ path: filePath, content, hash, originalMtime: stats.mtimeMs });
    index.addFile(filePath, hash, [`Class${i}`], true, stats.mtimeMs);
  }
  
  // Simulate git checkout: touch all files to update mtime
  await new Promise(resolve => setTimeout(resolve, 100));
  const touchTime = new Date();
  
  for (const file of files) {
    await fs.utimes(file.path, touchTime, touchTime);
  }
  
  // Count how many would be false-positively reported as needing reindex
  let falsePositivesBefore = 0;
  let mtimeSyncCount = 0;
  
  for (const file of files) {
    const stats = await fs.stat(file.path);
    const needsReindex = await index.needsReindex(file.path);
    
    if (!needsReindex) {
      // File doesn't need reindex (hash matches) but mtime is stale
      const indexedFile = index.getFile(file.path);
      if (stats.mtimeMs > (indexedFile?.mtime || 0)) {
        falsePositivesBefore++;
        // Apply fix: sync mtime
        if (index.updateFileMtime(file.path, stats.mtimeMs)) {
          mtimeSyncCount++;
        }
      }
    }
  }
  
  verbose(`Files with stale mtime (false positives): ${falsePositivesBefore}`);
  verbose(`Mtime syncs applied: ${mtimeSyncCount}`);
  
  assert(falsePositivesBefore === fileCount, `All ${fileCount} files had stale mtime before fix`);
  assert(mtimeSyncCount === fileCount, `All ${fileCount} files had mtime synced`);
  
  // Verify all files now have synced mtime
  let mtimesInSync = 0;
  for (const file of files) {
    const stats = await fs.stat(file.path);
    const indexedFile = index.getFile(file.path);
    if (indexedFile?.mtime === stats.mtimeMs) {
      mtimesInSync++;
    }
  }
  
  assert(mtimesInSync === fileCount, `All ${fileCount} files have mtime in sync after fix`);
}

// ============================================================================
// TEST SUITE 5: Edge Cases
// ============================================================================

async function testEdgeCases() {
  log('\n🧪 Test Suite 5: Edge Cases\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  const index = new MemoryIndex();
  
  // Test: File added without explicit mtime (gets Date.now() as default)
  const legacyFilePath = '/legacy/OldFile.java';
  const beforeAdd = Date.now();
  index.addFile(legacyFilePath, 'oldhash', ['OldFile'], true);  // No mtime provided - gets Date.now()
  const afterAdd = Date.now();
  
  const legacyFile = index.getFile(legacyFilePath);
  verbose(`Legacy file mtime: ${legacyFile?.mtime}`);
  
  // Verify default mtime was assigned
  const hasDefaultMtime = legacyFile?.mtime !== undefined && 
                          legacyFile.mtime >= beforeAdd && 
                          legacyFile.mtime <= afterAdd;
  assert(hasDefaultMtime, 'addFile assigns Date.now() as default mtime when not provided');
  
  // updateFileMtime should work with a newer time
  const newerTime = Date.now() + 1000;
  const updateResult = index.updateFileMtime(legacyFilePath, newerTime);
  assert(updateResult === true, 'updateFileMtime works on file with default mtime');
  
  // Test: Same mtime (exactly equal)
  const sameTimePath = '/test/SameTime.java';
  const exactTime = Date.now();
  index.addFile(sameTimePath, 'hash123', ['SameTime'], true, exactTime);
  
  const sameResult = index.updateFileMtime(sameTimePath, exactTime);
  assert(sameResult === false, 'updateFileMtime returns false for same mtime (no update needed)');
  
  // Test: Path normalization
  const windowsPath = 'C:\\Users\\test\\project\\src\\Test.java';
  const normalizedPath = windowsPath.replace(/\\/g, '/');
  index.addFile(windowsPath, 'hash456', ['Test'], true, 1000);
  
  // Should find file with either path format
  const foundWithNormalized = index.getFile(normalizedPath);
  assert(foundWithNormalized !== undefined, 'Path normalization works correctly');
  
  const updateWithWindowsPath = index.updateFileMtime(windowsPath, 2000);
  assert(updateWithWindowsPath === true, 'updateFileMtime works with Windows-style paths');
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  MTIME/HASH SYNCHRONIZATION TEST SUITE');
  console.log('  Testing fix for stale index warning false positives');
  console.log('='.repeat(70));
  
  try {
    await testUpdateFileMtimeAPI();
    await testHashVsMtimeDetection();
    await testIndexValidatorStaleness();
    await testBulkGitOperationSimulation();
    await testEdgeCases();
  } catch (error) {
    console.error('\n❌ Test suite crashed:', error);
    failed++;
    failures.push({ testName: 'Test Suite Execution', details: error.message });
  }
  
  // Cleanup
  await cleanup();
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed} ✅`);
  console.log(`  Failed: ${failed} ❌`);
  
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    for (const failure of failures) {
      console.log(`    • ${failure.testName}`);
      if (failure.details) {
        console.log(`      ${failure.details}`);
      }
    }
  }
  
  console.log('='.repeat(70) + '\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests();
