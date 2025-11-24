/**
 * MASTER TEST RUNNER - ALL STORAGE BACKEND TESTS
 * 
 * Runs comprehensive test suite:
 * 1. All 13 MCP tools with storage
 * 2. File watcher integration
 * 3. Large project benchmark
 * 4. Example project test
 */

const { spawn } = require('child_process');
const path = require('path');

const tests = [
  {
    name: 'All 13 MCP Tools',
    file: 'test-all-tools-storage.js',
    timeout: 120000, // 2 minutes
    critical: true
  },
  {
    name: 'File Watcher Integration',
    file: 'test-watcher-storage.js',
    timeout: 30000, // 30 seconds
    critical: true
  },
  {
    name: 'Direct Storage Integration',
    file: 'test-direct-storage.js',
    timeout: 30000,
    critical: false
  },
  {
    name: 'Real Integration Test',
    file: 'test-real-integration.js',
    timeout: 30000,
    critical: false
  },
  {
    name: 'Storage Compatibility',
    file: 'test-storage-compat.js',
    timeout: 15000,
    critical: false
  },
  {
    name: 'Large Project Benchmark (12k files)',
    file: 'test-large-storage-benchmark.js',
    timeout: 600000, // 10 minutes
    critical: true
  }
];

const results = {
  passed: [],
  failed: [],
  skipped: []
};

function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  RUNNING: ${test.name}`);
    console.log(`  File: ${test.file}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const startTime = Date.now();
    
    const proc = spawn('node', [test.file], {
      cwd: __dirname,
      env: { ...process.env, ENABLE_STORAGE: '1' },
      stdio: 'inherit'
    });
    
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      console.log(`\n⏱️  TEST TIMEOUT (${test.timeout / 1000}s)`);
    }, test.timeout);
    
    proc.on('close', (code) => {
      clearTimeout(timer);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log(`\nTest completed in ${duration}s`);
      
      if (timedOut) {
        console.log(`❌ ${test.name}: TIMEOUT\n`);
        results.failed.push(test.name);
        resolve({ test, success: false, duration, reason: 'timeout' });
      } else if (code === 0) {
        console.log(`✅ ${test.name}: PASSED\n`);
        results.passed.push(test.name);
        resolve({ test, success: true, duration });
      } else {
        console.log(`❌ ${test.name}: FAILED (exit code ${code})\n`);
        results.failed.push(test.name);
        resolve({ test, success: false, duration, code });
      }
    });
    
    proc.on('error', (error) => {
      clearTimeout(timer);
      console.log(`❌ ${test.name}: ERROR - ${error.message}\n`);
      results.failed.push(test.name);
      resolve({ test, success: false, error: error.message });
    });
  });
}

async function runAllTests() {
  console.log('═'.repeat(60));
  console.log('  COMPREHENSIVE STORAGE BACKEND TEST SUITE');
  console.log('  Environment: ENABLE_STORAGE=1');
  console.log('═'.repeat(60));
  console.log(`\nTotal tests: ${tests.length}`);
  console.log(`Critical tests: ${tests.filter(t => t.critical).length}`);
  console.log(`Optional tests: ${tests.filter(t => !t.critical).length}\n`);
  
  const allResults = [];
  
  for (const test of tests) {
    const result = await runTest(test);
    allResults.push(result);
    
    // If critical test fails, ask to continue
    if (!result.success && test.critical) {
      console.log('⚠️  CRITICAL TEST FAILED!');
      console.log('   Continue with remaining tests? (Press Ctrl+C to abort)\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('  FINAL TEST SUMMARY');
  console.log('═'.repeat(60));
  
  console.log(`\n📊 Results:`);
  console.log(`   Total: ${tests.length}`);
  console.log(`   ✅ Passed: ${results.passed.length}`);
  console.log(`   ❌ Failed: ${results.failed.length}`);
  console.log(`   Pass Rate: ${((results.passed.length / tests.length) * 100).toFixed(1)}%`);
  
  if (results.passed.length > 0) {
    console.log(`\n✅ Passed Tests:`);
    results.passed.forEach(name => console.log(`   - ${name}`));
  }
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed Tests:`);
    results.failed.forEach(name => console.log(`   - ${name}`));
  }
  
  // Detailed results
  console.log(`\n⏱️  Performance:`);
  allResults.forEach(r => {
    if (r.duration) {
      const icon = r.success ? '✅' : '❌';
      console.log(`   ${icon} ${r.test.name}: ${r.duration}s`);
    }
  });
  
  console.log('\n' + '═'.repeat(60));
  
  // Verdict
  const criticalFailed = allResults.filter(r => !r.success && r.test.critical).length;
  
  if (criticalFailed === 0) {
    console.log('🎉 SUCCESS: All critical tests passed!');
    console.log('   Storage backend is production-ready.');
    
    if (results.failed.length > 0) {
      console.log('   (Some optional tests failed - review recommended)');
    }
  } else {
    console.log('❌ FAILURE: Critical tests failed!');
    console.log(`   ${criticalFailed} critical test(s) need attention.`);
  }
  
  console.log('═'.repeat(60) + '\n');
  
  return criticalFailed === 0;
}

// Run all tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('\n❌ Test runner error:', error);
  process.exit(1);
});
