/**
 * Test to verify the symbol limit fix for Issue 2 & 3
 * 
 * Previously, getAllSymbols() had a hardcoded LIMIT 10000 that truncated results.
 * This test verifies that:
 * 1. No limit is applied when not specified (all symbols returned)
 * 2. Limit is correctly applied when specified
 * 
 * Why tests didn't catch this before:
 * - Tests only created 50 symbols (well below 10,000 limit)
 * - No test case verified behavior with large datasets
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function pass(msg) {
  console.log(`${GREEN}✓ PASS${RESET}: ${msg}`);
}

function fail(msg, details = '') {
  console.log(`${RED}✗ FAIL${RESET}: ${msg}${details ? ' - ' + details : ''}`);
  return false;
}

function warn(msg) {
  console.log(`${YELLOW}⚠ WARN${RESET}: ${msg}`);
}

async function testSymbolLimitFix() {
  console.log('\n=== Testing Symbol Limit Fix (Issue 2 & 3) ===\n');
  
  let allPassed = true;
  
  // Test with sql.js storage
  try {
    const { SqlJsStorage } = await import('./server/dist/storage/sqljs-storage.js');
    
    const testDir = path.join(__dirname, 'test-symbol-limit-temp');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    
    const storage = new SqlJsStorage(testDir);
    await storage.initialize();
    
    // Create more than 10,000 symbols to test the limit fix
    const numSymbols = 15000;
    console.log(`Creating ${numSymbols} test symbols...`);
    
    const symbols = [];
    for (let i = 0; i < numSymbols; i++) {
      symbols.push({
        fqn: `com.test.Class${i}`,
        name: `Class${i}`,
        kind: 'class',
        file: `/src/Class${i}.java`,
        line: 1,
        column: 1,
        packageName: 'com.test',
        modifiers: ['public']
      });
    }
    
    // Save in batches to avoid memory issues
    const batchSize = 5000;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      await storage.saveSymbols(batch);
      console.log(`  Saved batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(symbols.length/batchSize)}`);
    }
    
    // Test 1: getAllSymbols without limit should return ALL symbols
    console.log('\nTest 1: getAllSymbols() without limit');
    const allSymbols = await storage.getAllSymbols();
    if (allSymbols.length === numSymbols) {
      pass(`getAllSymbols() returned all ${numSymbols} symbols (no limit applied)`);
    } else {
      fail(`getAllSymbols() returned ${allSymbols.length} symbols, expected ${numSymbols}`);
      allPassed = false;
      
      if (allSymbols.length === 10000) {
        console.log(`   ${RED}BUG DETECTED: Still using hardcoded LIMIT 10000!${RESET}`);
      }
    }
    
    // Test 2: getAllSymbols with explicit limit should respect it
    console.log('\nTest 2: getAllSymbols() with explicit limit');
    const limitedSymbols = await storage.getAllSymbols({ limit: 100 });
    if (limitedSymbols.length === 100) {
      pass(`getAllSymbols({limit: 100}) correctly returned 100 symbols`);
    } else {
      fail(`getAllSymbols({limit: 100}) returned ${limitedSymbols.length} symbols, expected 100`);
      allPassed = false;
    }
    
    // Test 3: getAllSymbols with limit and offset
    console.log('\nTest 3: getAllSymbols() with limit and offset');
    const offsetSymbols = await storage.getAllSymbols({ limit: 50, offset: 100 });
    if (offsetSymbols.length === 50) {
      pass(`getAllSymbols({limit: 50, offset: 100}) correctly returned 50 symbols`);
      
      // Verify the offset is correct by checking FQNs
      const expectedFirst = 'com.test.Class100';
      if (offsetSymbols[0]?.fqn === expectedFirst) {
        pass(`Offset correctly starts at Class100`);
      } else {
        // FQNs might not be ordered, just check count
        warn(`Could not verify offset order (FQNs may not be ordered)`);
      }
    } else {
      fail(`getAllSymbols({limit: 50, offset: 100}) returned ${offsetSymbols.length} symbols, expected 50`);
      allPassed = false;
    }
    
    // Cleanup
    await storage.close();
    fs.rmSync(testDir, { recursive: true });
    
    console.log('\n=== Symbol Limit Fix Test Results ===');
    if (allPassed) {
      console.log(`${GREEN}All tests passed! The symbol limit fix is working correctly.${RESET}`);
    } else {
      console.log(`${RED}Some tests failed! The symbol limit bug may still exist.${RESET}`);
    }
    
  } catch (error) {
    console.error('Error running tests:', error);
    allPassed = false;
  }
  
  return allPassed;
}

// Run tests
testSymbolLimitFix().then(passed => {
  process.exit(passed ? 0 : 1);
});
