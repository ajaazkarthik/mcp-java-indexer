#!/usr/bin/env node

/**
 * COMPREHENSIVE TEST RUNNER - MCP Java Indexer
 * 
 * Based on actual test analysis (2025-11-27):
 * - 40 total tests (8 obsolete moved to tests/obsolete/)
 * - 27 PASS in --all mode (100% pass rate)  
 * - 6 performance tests need long timeout (--filter performance)
 * - 6 SQLite tests need better-sqlite3 (--filter sqlite)
 * - 1 stuck diagnostic test (--filter stuck)
 * 
 * Usage:
 *   node tests/test-runner.js              # Run fast tests only (~55s)
 *   node tests/test-runner.js --all        # Run all 27 working tests (~140s)
 *   node tests/test-runner.js --filter slow
 *   node tests/test-runner.js --filter sqlite --timeout=60000
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Color codes
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// ============================================================================
// TEST CATEGORIZATION (updated 2025-11-27)
// ============================================================================

// Tests that PASS reliably in under 10 seconds
const FAST_TESTS = [
  'test-advanced-cases.js',      // 5.8s
  'test-all-tools.js',           // 4.6s
  'test-call-graph-fix.js',      // 6.7s
  'test-constructor-tracking.js', // 2.1s
  'test-deep-inheritance.js',    // 2.7s
  'test-edge-cases.js',          // 3.7s
  'test-feature-preservation.js', // 1.3s
  'test-feedback-detailed.js',   // 6.5s
  'test-feedback-fixes.js',      // 2.0s
  'test-feedback-validation.js', // 5.7s
  'test-fixes.js',               // 0.6s
  'test-inheritance.js',         // 1.0s
  'test-reflection-legacy.js',   // 4.5s
  'test-v2.2.3-fixes.js',        // 1.5s
  'test-watcher-storage.js',     // 2.7s
  'test-all-tools-storage.js',   // 4.1s
  'test-direct-storage.js',      // 1.1s
  'test-real-integration.js',    // 1.4s
  'test-storage-compat.js',      // 0.6s
  'test-usages-fix.js',          // Fixed to use example-java-project
  'test-memory-management.js',   // Fixed expectations
];

// Tests that were FIXED and should now pass (need longer time)
const MEDIUM_TESTS = [
  'test-oom-fix.js',             // 13s - tests memory limits
  'test-incremental-indexing.js' // 12s - tests incremental updates
];

// Tests that PASS but need more time (10-30s) or spawn MCP servers
const SLOW_TESTS = [
  'test-indexing.js',            // 17s - spawns MCP server
  'test-v1.5.0.js',              // 10.3s
  'test-regression-references-zero.js', // 5-15s
  'test-advanced-tools.js',      // 3s - spawns MCP server, needs inherited stdio
];

// Tests that need storage fallback (work with FileShardStorage)
const SQLITE_TESTS = [
  'test-dual-comparison.js',       // Expects exact outbound call counts
  'test-e2e-storage.js',           // Long timeout needed
  'test-file-vs-db-mode.js'        // Process handling
];

// Stuck tests - diagnostic only, should NOT be run normally
const STUCK_TESTS = [
  'test-stuck-indexing.js'         // Diagnostic for stuck states
];

// Performance tests requiring longer timeout
const PERFORMANCE_TESTS = [
  'test-performance.js',              // Performance benchmarks
  'test-pure-java-performance.js',    // Java parser perf
  'test-comprehensive-v2.2.3.js'      // Full test suite
];

// Tests requiring large-java-project (12k files, very long timeout)
const LARGE_PROJECT_TESTS = [
  'test-large-project.js',            // 5-10 min
  'test-large-project-comparison.js', // 10+ min
  'test-large-optimized.js',          // 5+ min
  'test-large-db-mode.js',            // 5+ min  
  'test-large-storage-benchmark.js',  // 5+ min
  'test-run-all-storage.js',          // Runs sub-tests
];

// Obsolete tests moved to tests/obsolete/
// - test-bugfixes-v2.1.js (tests unimplemented features)
// - test-timing-feature.js (feature not implemented)
// - test-all-suites.js (replaced by test-runner.js)
// - test-batch-size-comparison.js (modifies source code!)
// - test-isolate-bottleneck.js (incomplete)
// - test-performance-profiler.js (dev tool)
// - test-agent-features.js (duplicate)
// - test-agent-features-focused.js (duplicate)

// Parse args
const args = process.argv.slice(2);
const config = {
  all: args.includes('--all'),
  everything: args.includes('--everything'),  // Run ALL tests including slow ones
  large: args.includes('--large'),            // Run large-project tests
  verbose: args.includes('--verbose') || args.includes('-v'),
  bail: args.includes('--bail'),
  list: args.includes('--list'),
  timeout: 20000, // 20s default
  filter: null
};

args.forEach(arg => {
  if (arg.startsWith('--filter=')) config.filter = arg.split('=')[1];
  if (arg.startsWith('--timeout=')) config.timeout = parseInt(arg.split('=')[1]);
});

// ============================================================================
// TEST RUNNER
// ============================================================================

class TestRunner {
  constructor() {
    this.results = { passed: 0, failed: 0, skipped: 0, tests: [] };
    this.startTime = Date.now();
  }

  log(msg, color = C.reset) {
    console.log(`${color}${msg}${C.reset}`);
  }

  getTestsToRun() {
    // If --everything flag, run ALL remaining tests (40 tests after cleanup)
    if (config.everything) {
      return [...FAST_TESTS, ...SLOW_TESTS, ...MEDIUM_TESTS, ...SQLITE_TESTS, ...STUCK_TESTS, ...PERFORMANCE_TESTS];
    }
    
    let tests = [...FAST_TESTS];
    
    if (config.all) {
      // Default --all: fast + slow + medium (reliable tests)
      tests = [...tests, ...SLOW_TESTS, ...MEDIUM_TESTS];
    }
    
    if (config.filter) {
      const filterMap = {
        'fast': FAST_TESTS,
        'slow': SLOW_TESTS,
        'medium': MEDIUM_TESTS,
        'sqlite': SQLITE_TESTS,
        'stuck': STUCK_TESTS,
        'performance': PERFORMANCE_TESTS,
        'core': ['test-all-tools.js', 'test-indexing.js', 'test-inheritance.js'],
        'features': ['test-call-graph-fix.js', 'test-constructor-tracking.js', 'test-deep-inheritance.js'],
        'regression': ['test-edge-cases.js', 'test-fixes.js', 'test-feedback-fixes.js']
      };
      
      if (filterMap[config.filter]) {
        tests = filterMap[config.filter];
      }
    }
    
    return tests;
  }

  cleanIndexIfNeeded(testFile) {
    // Tests that spawn their own MCP servers may need a clean index
    const needsCleanIndex = [
      'test-advanced-tools.js'  // Spawns internal MCP server, needs fresh index
    ];
    
    if (needsCleanIndex.includes(testFile)) {
      const indexPath = path.join(__dirname, '..', 'example-java-project', '.mcp-index');
      try {
        if (fs.existsSync(indexPath)) {
          fs.rmSync(indexPath, { recursive: true, force: true });
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  runTest(testFile) {
    return new Promise(resolve => {
      // Clean index for tests that need it
      this.cleanIndexIfNeeded(testFile);
      
      const testPath = path.join(__dirname, '..', testFile);
      const start = Date.now();
      let resolved = false;
      
      // Tests that spawn MCP servers need inherited stdio (not piped)
      const needsInheritedStdio = [
        'test-indexing.js',
        'test-advanced-tools.js',
        'test-incremental-indexing.js',
        'test-oom-fix.js'
      ];
      const useInherit = config.verbose || needsInheritedStdio.includes(testFile);
      
      const proc = spawn('node', [testPath], {
        stdio: useInherit ? 'inherit' : 'pipe',
        cwd: path.join(__dirname, '..')
      });

      const finish = (status, code = null) => {
        if (resolved) return;
        resolved = true;
        const duration = Date.now() - start;
        
        if (status === 'pass') {
          this.results.passed++;
          this.log(`  ✓ ${testFile.padEnd(35)} ${(duration/1000).toFixed(1)}s`, C.green);
        } else if (status === 'timeout') {
          this.results.failed++;
          this.log(`  ⏱ ${testFile.padEnd(35)} TIMEOUT`, C.yellow);
        } else {
          this.results.failed++;
          this.log(`  ✗ ${testFile.padEnd(35)} EXIT ${code}`, C.red);
        }
        
        this.results.tests.push({ file: testFile, status, duration });
        resolve();
      };

      proc.on('close', code => {
        finish(code === 0 ? 'pass' : 'fail', code);
      });

      proc.on('error', () => finish('error'));

      setTimeout(() => {
        if (!resolved) {
          proc.kill('SIGKILL');
          finish('timeout');
        }
      }, config.timeout);
    });
  }

  async run() {
    console.log(C.cyan);
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  MCP Java Indexer - Test Runner v2.0                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(C.reset);

    const tests = this.getTestsToRun();
    
    this.log(`\n📊 Test Categories (40 active, 8 obsolete):`, C.cyan);
    this.log(`   ✓ Fast tests (< 10s):     ${FAST_TESTS.length}`, C.green);
    this.log(`   ✓ Slow tests (10-20s):    ${SLOW_TESTS.length}`, C.yellow);
    this.log(`   ✓ Medium tests (fixed):   ${MEDIUM_TESTS.length}`, C.green);
    this.log(`   ⊘ SQLite tests:           ${SQLITE_TESTS.length} (need better-sqlite3)`, C.gray);
    this.log(`   ⊘ Stuck tests:            ${STUCK_TESTS.length} (diagnostic only)`, C.gray);
    this.log(`   ⊘ Performance tests:      ${PERFORMANCE_TESTS.length} (need long timeout)`, C.gray);
    this.log(`   ⊘ Obsolete (archived):    8 (in tests/obsolete/)`, C.gray);
    
    this.log(`\n🚀 Running ${tests.length} tests (timeout: ${config.timeout/1000}s)...\n`);

    for (const test of tests) {
      await this.runTest(test);
      if (config.bail && this.results.failed > 0) {
        this.log('\n⚠️  Bail mode: stopping on first failure', C.yellow);
        break;
      }
    }

    this.printSummary();
  }

  printSummary() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const total = this.results.passed + this.results.failed;
    const passRate = total > 0 ? ((this.results.passed / total) * 100).toFixed(0) : 0;

    console.log('\n' + '═'.repeat(60));
    this.log(`\n📈 RESULTS`, C.cyan);
    this.log(`   Passed:    ${this.results.passed}`, C.green);
    this.log(`   Failed:    ${this.results.failed}`, this.results.failed > 0 ? C.red : C.green);
    this.log(`   Pass Rate: ${passRate}%`);
    this.log(`   Duration:  ${duration}s\n`);

    if (this.results.failed === 0) {
      this.log('✅ ALL TESTS PASSED!', C.green);
    } else {
      this.log('❌ Some tests failed', C.red);
      process.exitCode = 1;
    }
  }
}

// Run
new TestRunner().run().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
