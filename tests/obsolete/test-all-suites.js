/**
 * Comprehensive Test Suite Runner
 * 
 * Runs all test suites to ensure no regressions:
 * 1. OOM Fix Tests (NEW)
 * 2. Feature Preservation Tests
 * 3. Large Project Tests
 */

const { spawn } = require('child_process');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m'
};

class TestRunner {
  constructor() {
    this.results = [];
  }

  async runTest(name, scriptPath) {
    console.log(`\n${colors.cyan}${colors.bold}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}Running: ${name}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}${'='.repeat(80)}${colors.reset}\n`);

    return new Promise((resolve) => {
      const startTime = Date.now();
      const proc = spawn('node', [scriptPath], {
        stdio: 'inherit',
        env: { ...process.env }
      });

      proc.on('exit', (code) => {
        const duration = Date.now() - startTime;
        const success = code === 0;
        
        this.results.push({
          name,
          success,
          duration,
          code
        });

        if (success) {
          console.log(`\n${colors.green}${colors.bold}✓ ${name} PASSED${colors.reset} (${(duration/1000).toFixed(1)}s)\n`);
        } else {
          console.log(`\n${colors.red}${colors.bold}✗ ${name} FAILED${colors.reset} (exit code: ${code})\n`);
        }

        resolve(success);
      });

      proc.on('error', (error) => {
        console.error(`${colors.red}Failed to run ${name}: ${error.message}${colors.reset}`);
        this.results.push({
          name,
          success: false,
          duration: Date.now() - startTime,
          error: error.message
        });
        resolve(false);
      });
    });
  }

  printSummary() {
    console.log(`\n${colors.magenta}${colors.bold}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.magenta}${colors.bold}COMPREHENSIVE TEST SUITE SUMMARY${colors.reset}`);
    console.log(`${colors.magenta}${colors.bold}${'='.repeat(80)}${colors.reset}\n`);

    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`${colors.bold}Test Suites:${colors.reset} ${total}`);
    console.log(`${colors.green}${colors.bold}Passed:${colors.reset} ${passed}`);
    console.log(`${colors.red}${colors.bold}Failed:${colors.reset} ${failed}`);
    console.log(`${colors.bold}Pass Rate:${colors.reset} ${passRate}%\n`);

    console.log(`${colors.bold}Results:${colors.reset}`);
    this.results.forEach((result, idx) => {
      const status = result.success 
        ? `${colors.green}✓ PASS${colors.reset}`
        : `${colors.red}✗ FAIL${colors.reset}`;
      const duration = `${(result.duration / 1000).toFixed(1)}s`;
      console.log(`  ${idx + 1}. ${result.name}: ${status} (${duration})`);
      if (result.error) {
        console.log(`     ${colors.red}Error: ${result.error}${colors.reset}`);
      }
      if (!result.success && result.code) {
        console.log(`     ${colors.red}Exit code: ${result.code}${colors.reset}`);
      }
    });

    console.log(`\n${colors.magenta}${colors.bold}${'='.repeat(80)}${colors.reset}\n`);

    if (failed === 0) {
      console.log(`${colors.green}${colors.bold}🎉 ALL TEST SUITES PASSED! 🎉${colors.reset}\n`);
      console.log(`${colors.green}✓ No regressions detected${colors.reset}`);
      console.log(`${colors.green}✓ OOM fixes verified${colors.reset}`);
      console.log(`${colors.green}✓ All features preserved${colors.reset}\n`);
    } else {
      console.log(`${colors.red}${colors.bold}❌ SOME TEST SUITES FAILED ❌${colors.reset}\n`);
      console.log(`${colors.red}Please review failed tests above${colors.reset}\n`);
    }

    return failed === 0;
  }
}

(async () => {
  const runner = new TestRunner();
  
  console.log(`${colors.cyan}${colors.bold}╔${'═'.repeat(78)}╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}║${' '.repeat(20)}MCP Java Indexer - Full Test Suite${' '.repeat(24)}║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}╚${'═'.repeat(78)}╝${colors.reset}\n`);
  
  console.log(`${colors.yellow}This will run multiple test suites:${colors.reset}`);
  console.log(`${colors.yellow}  1. OOM Fix Tests (NEW) - Validates memory management fixes${colors.reset}`);
  console.log(`${colors.yellow}  2. Feature Preservation Tests - Ensures no features were broken${colors.reset}`);
  console.log(`${colors.yellow}  3. Large Project Tests - Stress tests with 12k+ files${colors.reset}\n`);
  
  console.log(`${colors.cyan}Starting in 3 seconds...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Test 1: OOM Fix Tests (Priority)
    await runner.runTest(
      'OOM Fix Validation',
      path.join(__dirname, 'test-oom-fix.js')
    );

    // Test 2: Feature Preservation
    await runner.runTest(
      'Feature Preservation',
      path.join(__dirname, 'test-feature-preservation.js')
    );

    // Test 3: Large Project (if available)
    const largeProjectPath = path.join(__dirname, 'test-large-project.js');
    const fs = require('fs');
    if (fs.existsSync(largeProjectPath)) {
      console.log(`${colors.yellow}⚠️  Large project test takes 10-20 minutes. Skip? (Ctrl+C to skip)${colors.reset}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await runner.runTest(
        'Large Project Stress Test',
        largeProjectPath
      );
    } else {
      console.log(`${colors.yellow}⚠️  Skipping large project test (test file not found)${colors.reset}`);
    }

    const success = runner.printSummary();
    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error(`${colors.red}${colors.bold}Fatal error: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  }
})();
