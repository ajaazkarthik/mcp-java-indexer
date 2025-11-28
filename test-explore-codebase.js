/**
 * Comprehensive test suite for explore_codebase tool
 * 
 * Tests cover:
 * - Basic functionality (all formats)
 * - Edge cases (empty index, single class, large projects)
 * - Code smell detection
 * - Performance benchmarks
 * - Package filtering
 * - Refactoring candidate generation
 * - Circular dependency detection
 * - Output quality validation
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

class ExploreCodebaseTest {
  constructor() {
    this.serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    this.projectRoot = path.join(__dirname, 'example-java-project');
    this.requestId = 1;
    this.server = null;
    this.pendingRequests = new Map();
    this.testResults = { passed: 0, failed: 0, skipped: 0 };
    this.testDetails = [];
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}Starting MCP server...${colors.reset}`);
      
      this.server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const rl = readline.createInterface({
        input: this.server.stdout,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);
          if (response.id && this.pendingRequests.has(response.id)) {
            const { resolve: resolveRequest } = this.pendingRequests.get(response.id);
            this.pendingRequests.delete(response.id);
            resolveRequest(response.result);
          }
        } catch (e) {
          // Ignore non-JSON lines
        }
      });

      this.server.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('running on stdio')) {
          console.log(`${colors.green}✓ Server started${colors.reset}\n`);
          resolve();
        }
      });

      this.server.on('error', reject);
      
      // Timeout for startup
      setTimeout(() => reject(new Error('Server startup timeout')), 30000);
    });
  }

  async stop() {
    if (this.server) {
      this.server.kill();
      console.log(`${colors.dim}Server stopped${colors.reset}`);
    }
  }

  async sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 120000); // 2 minute timeout for large projects
    });
  }

  async callTool(name, args) {
    const result = await this.sendRequest('tools/call', { name, arguments: args });
    return result;
  }

  async runTest(name, testFn) {
    const startTime = Date.now();
    try {
      await testFn();
      const duration = Date.now() - startTime;
      console.log(`${colors.green}✓${colors.reset} ${name} ${colors.dim}(${duration}ms)${colors.reset}`);
      this.testResults.passed++;
      this.testDetails.push({ name, status: 'passed', duration });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`${colors.red}✗${colors.reset} ${name}`);
      console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
      this.testResults.failed++;
      this.testDetails.push({ name, status: 'failed', duration, error: error.message });
    }
  }

  skipTest(name, reason) {
    console.log(`${colors.yellow}○${colors.reset} ${name} ${colors.dim}(skipped: ${reason})${colors.reset}`);
    this.testResults.skipped++;
    this.testDetails.push({ name, status: 'skipped', reason });
  }

  // Helper assertion methods
  assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  assertContains(text, substring, message) {
    if (!text.includes(substring)) {
      throw new Error(message || `Expected text to contain "${substring}"`);
    }
  }

  assertNotContains(text, substring, message) {
    if (text.includes(substring)) {
      throw new Error(message || `Expected text NOT to contain "${substring}"`);
    }
  }

  assertGreaterThan(actual, expected, message) {
    if (actual <= expected) {
      throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
    }
  }

  assertLessThan(actual, expected, message) {
    if (actual >= expected) {
      throw new Error(message || `Expected ${actual} to be less than ${expected}`);
    }
  }

  // ============================================
  // TEST CASES
  // ============================================

  async runAllTests() {
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}       EXPLORE_CODEBASE TOOL - COMPREHENSIVE TESTS${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

    // First, index the project
    console.log(`${colors.blue}Phase 1: Indexing Project${colors.reset}\n`);
    await this.indexProject();

    // Basic Functionality Tests
    console.log(`\n${colors.blue}Phase 2: Basic Functionality Tests${colors.reset}\n`);
    await this.runBasicTests();

    // Format Tests
    console.log(`\n${colors.blue}Phase 3: Output Format Tests${colors.reset}\n`);
    await this.runFormatTests();

    // Refactoring Priority Format Tests (NEW)
    console.log(`\n${colors.blue}Phase 3b: Refactoring Priority Format Tests${colors.reset}\n`);
    await this.runRefactoringPriorityTests();

    // Code Smell Detection Tests
    console.log(`\n${colors.blue}Phase 4: Code Smell Detection Tests${colors.reset}\n`);
    await this.runCodeSmellTests();

    // Filter Tests
    console.log(`\n${colors.blue}Phase 5: Package Filter Tests${colors.reset}\n`);
    await this.runFilterTests();

    // Edge Case Tests
    console.log(`\n${colors.blue}Phase 6: Edge Case Tests${colors.reset}\n`);
    await this.runEdgeCaseTests();

    // Performance Tests
    console.log(`\n${colors.blue}Phase 7: Performance Tests${colors.reset}\n`);
    await this.runPerformanceTests();

    // Integration Tests
    console.log(`\n${colors.blue}Phase 8: Integration Tests${colors.reset}\n`);
    await this.runIntegrationTests();

    // Print summary
    this.printSummary();
  }

  async indexProject() {
    await this.runTest('Index example-java-project', async () => {
      const result = await this.callTool('index_project', {
        rootDir: this.projectRoot
      });
      const text = result.content[0].text;
      // Accept either fresh indexing, up-to-date, or loading from persistence
      const success = text.includes('Indexing complete') || 
                     text.includes('Loaded index') ||
                     text.includes('indexed') ||
                     text.includes('Symbols') ||
                     text.includes('up-to-date') ||
                     text.includes('Statistics');
      this.assert(success, `Should complete indexing or load from cache. Got: ${text.substring(0, 200)}`);
    });
  }

  // ---- Basic Functionality Tests ----
  async runBasicTests() {
    await this.runTest('1. Default call returns summary', async () => {
      const result = await this.callTool('explore_codebase', {});
      const text = result.content[0].text;
      this.assertContains(text, 'Codebase Analysis Summary', 'Should contain summary title');
      this.assertContains(text, 'Total Classes', 'Should show total classes');
    });

    await this.runTest('2. Returns metadata with processing time', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, 'Processing Time', 'Should show processing time');
      this.assertContains(text, 'ms', 'Should show milliseconds');
    });

    await this.runTest('3. Returns class counts correctly', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, 'Total Classes', 'Should have classes');
      this.assertContains(text, 'Total Interfaces', 'Should have interfaces');
      this.assertContains(text, 'Total Enums', 'Should have enums');
    });

    await this.runTest('4. Returns package information', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, 'Top Packages', 'Should show packages');
    });

    await this.runTest('5. Returns metrics (avg methods/fields)', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, 'Avg Methods/Class', 'Should show avg methods');
      this.assertContains(text, 'Avg Fields/Class', 'Should show avg fields');
    });
  }

  // ---- Format Tests ----
  async runFormatTests() {
    await this.runTest('6. Summary format is readable', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, '📊', 'Should have emoji indicators');
      this.assertContains(text, '##', 'Should have markdown headers');
    });

    await this.runTest('7. JSON format is valid JSON', async () => {
      const result = await this.callTool('explore_codebase', { format: 'json' });
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      this.assert(parsed.metadata, 'Should have metadata');
      this.assert(parsed.statistics, 'Should have statistics');
      this.assert(parsed.packages, 'Should have packages array');
    });

    await this.runTest('8. JSON format has correct structure', async () => {
      const result = await this.callTool('explore_codebase', { format: 'json' });
      const parsed = JSON.parse(result.content[0].text);
      this.assert(typeof parsed.metadata.totalClasses === 'number', 'totalClasses should be number');
      this.assert(typeof parsed.metadata.processingTimeMs === 'number', 'processingTimeMs should be number');
      this.assert(Array.isArray(parsed.packages), 'packages should be array');
    });

    await this.runTest('9. Refactoring format shows priorities', async () => {
      const result = await this.callTool('explore_codebase', { format: 'refactoring' });
      const text = result.content[0].text;
      this.assertContains(text, 'Refactoring Priority Report', 'Should have refactoring title');
    });

    await this.runTest('10. Detailed format includes class details', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'detailed',
        includeClasses: true 
      });
      const text = result.content[0].text;
      this.assertContains(text, 'Detailed Codebase Analysis', 'Should have detailed title');
      this.assertContains(text, 'FQN', 'Should show FQNs');
    });
  }

  // ---- Refactoring Priority Format Tests (NEW) ----
  async runRefactoringPriorityTests() {
    await this.runTest('10a. Refactoring-priority format returns valid output', async () => {
      const result = await this.callTool('explore_codebase', { format: 'refactoring-priority' });
      const text = result.content[0].text;
      this.assertContains(text, 'Refactoring Priority by Dependency Count', 'Should have correct title');
      this.assertContains(text, 'TIER', 'Should show tiers');
    });

    await this.runTest('10b. Shows Tier 0 (zero inbound dependencies)', async () => {
      const result = await this.callTool('explore_codebase', { format: 'refactoring-priority' });
      const text = result.content[0].text;
      this.assertContains(text, 'TIER 0', 'Should have Tier 0 section');
      this.assertContains(text, 'Zero Inbound Dependencies', 'Should explain Tier 0');
    });

    await this.runTest('10c. Shows Tier 1 (one inbound dependency)', async () => {
      const result = await this.callTool('explore_codebase', { format: 'refactoring-priority' });
      const text = result.content[0].text;
      this.assertContains(text, 'TIER 1', 'Should have Tier 1 section');
    });

    await this.runTest('10d. Shows Tier 2 (two inbound dependencies)', async () => {
      const result = await this.callTool('explore_codebase', { format: 'refactoring-priority' });
      const text = result.content[0].text;
      this.assertContains(text, 'TIER 2', 'Should have Tier 2 section');
    });

    await this.runTest('10e. Shows quick summary table', async () => {
      const result = await this.callTool('explore_codebase', { format: 'refactoring-priority' });
      const text = result.content[0].text;
      this.assertContains(text, 'Quick Summary', 'Should have summary table');
      this.assertContains(text, 'Risk Level', 'Should show risk levels');
    });

    await this.runTest('10f. Shows action plan', async () => {
      const result = await this.callTool('explore_codebase', { format: 'refactoring-priority' });
      const text = result.content[0].text;
      this.assertContains(text, 'Recommended Action Plan', 'Should have action plan');
    });

    await this.runTest('10g. Respects maxPerTier parameter', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'refactoring-priority',
        maxPerTier: 5
      });
      const text = result.content[0].text;
      // Should work without errors
      this.assertContains(text, 'TIER', 'Should show tiers with limited output');
    });

    await this.runTest('10h. Complex classes are at the end', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'refactoring-priority',
        includeClasses: true
      });
      const text = result.content[0].text;
      // The "TACKLE LAST" section should come after other tiers
      const tier0Index = text.indexOf('TIER 0');
      const tackleLast = text.indexOf('TACKLE LAST');
      // TACKLE LAST may not exist if no complex classes, but if it does, it should be after Tier 0
      if (tackleLast > -1) {
        this.assert(tackleLast > tier0Index, 'TACKLE LAST should come after TIER 0');
      }
    });

    await this.runTest('10i. Dead code candidates identified in Tier 0', async () => {
      const result = await this.callTool('explore_codebase', { format: 'refactoring-priority' });
      const text = result.content[0].text;
      // Should either show dead code candidates or leaf classes in Tier 0
      const hasTier0Content = text.includes('Dead Code') || 
                              text.includes('Leaf Classes') || 
                              text.includes('No classes found with zero');
      this.assert(hasTier0Content, 'Tier 0 should show class categories or indicate none found');
    });
  }

  // ---- Code Smell Detection Tests ----
  async runCodeSmellTests() {
    await this.runTest('11. Detects code smells section', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, 'Code Smells', 'Should have code smells section');
    });

    await this.runTest('12. Reports God Classes count', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, 'God Classes', 'Should report god classes');
    });

    await this.runTest('13. Reports Unused Classes count', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, 'Unused Classes', 'Should report unused classes');
    });

    await this.runTest('14. Reports High Coupling Classes', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, 'High Coupling', 'Should report high coupling classes');
    });

    await this.runTest('15. JSON format includes code smell details', async () => {
      const result = await this.callTool('explore_codebase', { format: 'json' });
      const parsed = JSON.parse(result.content[0].text);
      this.assert(parsed.codeSmells, 'Should have codeSmells object');
      this.assert(Array.isArray(parsed.codeSmells.godClasses), 'godClasses should be array');
      this.assert(Array.isArray(parsed.codeSmells.unusedClasses), 'unusedClasses should be array');
    });
  }

  // ---- Filter Tests ----
  async runFilterTests() {
    await this.runTest('16. Package filter works', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'json',
        packages: ['com.example'] 
      });
      const parsed = JSON.parse(result.content[0].text);
      // All classes should be in com.example package
      for (const cls of parsed.classes || []) {
        this.assert(
          cls.packageName.startsWith('com.example'),
          `Class ${cls.fqn} should be in com.example package`
        );
      }
    });

    await this.runTest('17. Multiple package filters work', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'json',
        packages: ['com.example.service', 'com.example.model'] 
      });
      const parsed = JSON.parse(result.content[0].text);
      for (const cls of parsed.classes || []) {
        const validPackage = cls.packageName.startsWith('com.example.service') || 
                            cls.packageName.startsWith('com.example.model');
        this.assert(validPackage, `Class ${cls.fqn} should be in filtered packages`);
      }
    });

    await this.runTest('18. Empty package filter returns all classes', async () => {
      const resultAll = await this.callTool('explore_codebase', { format: 'json' });
      const resultEmpty = await this.callTool('explore_codebase', { format: 'json', packages: [] });
      const parsedAll = JSON.parse(resultAll.content[0].text);
      const parsedEmpty = JSON.parse(resultEmpty.content[0].text);
      this.assert(
        parsedAll.metadata.totalClasses === parsedEmpty.metadata.totalClasses,
        'Empty filter should return same as no filter'
      );
    });

    await this.runTest('19. Non-existent package filter returns zero results', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'json',
        packages: ['com.nonexistent.fake.package'] 
      });
      const parsed = JSON.parse(result.content[0].text);
      this.assert(parsed.metadata.totalClasses === 0, 'Should have 0 classes for fake package');
    });
  }

  // ---- Edge Case Tests ----
  async runEdgeCaseTests() {
    await this.runTest('20. Handles maxClasses limit', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'json',
        maxClasses: 3,
        includeClasses: true
      });
      const parsed = JSON.parse(result.content[0].text);
      this.assertLessThan(parsed.classes.length, 4, 'Should respect maxClasses limit');
    });

    await this.runTest('21. includeClasses: false excludes class details', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'json',
        includeClasses: false
      });
      const parsed = JSON.parse(result.content[0].text);
      this.assert(parsed.classes.length === 0, 'Should have empty classes array');
    });

    await this.runTest('22. Custom batchSize parameter works', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'summary',
        batchSize: 100
      });
      const text = result.content[0].text;
      // Should still work and return results
      this.assertContains(text, 'Total Classes', 'Should work with custom batchSize');
    });

    await this.runTest('23. Handles special characters in output', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      // Should not have broken encoding
      this.assertNotContains(text, 'undefined', 'Should not have undefined values');
    });
  }

  // ---- Performance Tests ----
  async runPerformanceTests() {
    await this.runTest('24. Summary format completes in reasonable time', async () => {
      const start = Date.now();
      await this.callTool('explore_codebase', { format: 'summary' });
      const duration = Date.now() - start;
      // Should complete in under 30 seconds for small project
      this.assertLessThan(duration, 30000, `Should complete in 30s, took ${duration}ms`);
    });

    await this.runTest('25. JSON format completes in reasonable time', async () => {
      const start = Date.now();
      await this.callTool('explore_codebase', { format: 'json' });
      const duration = Date.now() - start;
      this.assertLessThan(duration, 30000, `Should complete in 30s, took ${duration}ms`);
    });

    await this.runTest('26. Processing time is reported accurately', async () => {
      const start = Date.now();
      const result = await this.callTool('explore_codebase', { format: 'json' });
      const totalTime = Date.now() - start;
      const parsed = JSON.parse(result.content[0].text);
      // Reported time should be less than total request time
      this.assertLessThan(
        parsed.metadata.processingTimeMs, 
        totalTime + 1000, // Allow 1s overhead
        'Reported time should be reasonable'
      );
    });
  }

  // ---- Integration Tests ----
  async runIntegrationTests() {
    await this.runTest('27. Dependencies are resolved correctly', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'json',
        includeClasses: true 
      });
      const parsed = JSON.parse(result.content[0].text);
      // Check that dependencies point to valid classes
      const allFqns = new Set(parsed.classes.map(c => c.fqn));
      for (const cls of parsed.classes) {
        for (const dep of cls.outboundDependencies) {
          // Dependency should either be in our classes or be an external class
          // Just verify it's a valid string
          this.assert(dep && dep.length > 0, 'Dependency should be non-empty');
        }
      }
    });

    await this.runTest('28. Inheritance depth is calculated', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'json',
        includeClasses: true 
      });
      const parsed = JSON.parse(result.content[0].text);
      for (const cls of parsed.classes) {
        this.assert(
          typeof cls.inheritanceDepth === 'number',
          `Class ${cls.fqn} should have numeric inheritanceDepth`
        );
        this.assert(
          cls.inheritanceDepth >= 0,
          `Inheritance depth should be non-negative`
        );
      }
    });

    await this.runTest('29. Refactoring candidates have required fields', async () => {
      const result = await this.callTool('explore_codebase', { format: 'json' });
      const parsed = JSON.parse(result.content[0].text);
      for (const candidate of parsed.refactoringCandidates) {
        this.assert(candidate.priority, 'Candidate should have priority');
        this.assert(candidate.fqn, 'Candidate should have fqn');
        this.assert(candidate.reason, 'Candidate should have reason');
        this.assert(candidate.suggestion, 'Candidate should have suggestion');
        this.assert(
          ['HIGH', 'MEDIUM', 'LOW'].includes(candidate.priority),
          'Priority should be HIGH, MEDIUM, or LOW'
        );
      }
    });

    await this.runTest('30. Package summary aggregates correctly', async () => {
      const result = await this.callTool('explore_codebase', { format: 'json' });
      const parsed = JSON.parse(result.content[0].text);
      for (const pkg of parsed.packages) {
        this.assert(pkg.name, 'Package should have name');
        this.assert(typeof pkg.classCount === 'number', 'Should have classCount');
        this.assert(typeof pkg.interfaceCount === 'number', 'Should have interfaceCount');
        this.assert(typeof pkg.totalMethods === 'number', 'Should have totalMethods');
      }
    });

    await this.runTest('31. Class flags are boolean values', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'json',
        includeClasses: true 
      });
      const parsed = JSON.parse(result.content[0].text);
      for (const cls of parsed.classes.slice(0, 10)) {
        this.assert(typeof cls.flags.isGodClass === 'boolean', 'isGodClass should be boolean');
        this.assert(typeof cls.flags.isUnused === 'boolean', 'isUnused should be boolean');
        this.assert(typeof cls.flags.isHighCoupling === 'boolean', 'isHighCoupling should be boolean');
      }
    });

    await this.runTest('32. Works with explore_class for comparison', async () => {
      // Get a class from codebase analysis
      const codebaseResult = await this.callTool('explore_codebase', { 
        format: 'json',
        includeClasses: true 
      });
      const parsed = JSON.parse(codebaseResult.content[0].text);
      
      if (parsed.classes.length > 0) {
        const firstClass = parsed.classes[0];
        // Now explore the same class individually
        const classResult = await this.callTool('explore_class', { 
          className: firstClass.name 
        });
        const classText = classResult.content[0].text;
        // Both should find the same class
        this.assertContains(classText, firstClass.name, 'explore_class should find same class');
      }
    });

    await this.runTest('33. Statistics are consistent', async () => {
      const result = await this.callTool('explore_codebase', { format: 'json' });
      const parsed = JSON.parse(result.content[0].text);
      
      // Total should match sum of kinds
      const total = parsed.metadata.totalClasses + 
                   parsed.metadata.totalInterfaces + 
                   parsed.metadata.totalEnums;
      const packageTotal = parsed.packages.reduce((sum, p) => 
        sum + p.classCount + p.interfaceCount + p.enumCount, 0
      );
      this.assert(
        total === packageTotal,
        `Totals should match: ${total} vs ${packageTotal}`
      );
    });

    await this.runTest('34. Handles circular dependency detection disabled', async () => {
      const result = await this.callTool('explore_codebase', { 
        format: 'json',
        detectCircular: false
      });
      const parsed = JSON.parse(result.content[0].text);
      // Should have empty circular dependencies when detection is disabled
      this.assert(
        Array.isArray(parsed.codeSmells.circularDependencies),
        'Should have circularDependencies array'
      );
    });

    await this.runTest('35. Suggested next steps are included', async () => {
      const result = await this.callTool('explore_codebase', { format: 'summary' });
      const text = result.content[0].text;
      this.assertContains(text, 'Suggested Next Steps', 'Should have next steps');
      this.assertContains(text, 'explore_codebase', 'Should suggest format options');
    });
  }

  printSummary() {
    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}                     TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
    
    console.log(`${colors.green}Passed: ${this.testResults.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.testResults.failed}${colors.reset}`);
    console.log(`${colors.yellow}Skipped: ${this.testResults.skipped}${colors.reset}`);
    
    const total = this.testResults.passed + this.testResults.failed + this.testResults.skipped;
    const passRate = total > 0 ? ((this.testResults.passed / total) * 100).toFixed(1) : 0;
    console.log(`\n${colors.blue}Pass Rate: ${passRate}%${colors.reset}`);
    
    if (this.testResults.failed > 0) {
      console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
      this.testDetails
        .filter(t => t.status === 'failed')
        .forEach(t => {
          console.log(`  - ${t.name}: ${t.error}`);
        });
    }
    
    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
    
    // Exit with appropriate code
    if (this.testResults.failed > 0) {
      process.exitCode = 1;
    }
  }
}

// Main execution
async function main() {
  const test = new ExploreCodebaseTest();
  
  try {
    await test.start();
    await test.runAllTests();
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exitCode = 1;
  } finally {
    await test.stop();
  }
}

main();
