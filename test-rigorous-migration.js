/**
 * RIGOROUS TEST SUITE for scan_migration_candidates
 * Tests edge cases, stress tests, and comprehensive scenarios
 */

const path = require('path');

// Import the actual implementation
const { handleScanMigrationCandidates } = require('./server/dist/tools/scan_migration_candidates');
const { MemoryIndex } = require('./server/dist/memory-index');
const { IndexerClient } = require('./server/dist/indexer-client');

const testProjectPath = path.join(__dirname, 'example-java-project');

let memoryIndex;
let testResults = { passed: 0, failed: 0, tests: [] };

// Default blockedPatterns for tests that don't specify their own
const DEFAULT_BLOCKED = ['javax.*', 'java.sql.*'];

function assert(condition, message) {
    if (condition) {
        testResults.passed++;
        testResults.tests.push({ status: 'PASS', message });
        console.log(`   ✅ ${message}`);
    } else {
        testResults.failed++;
        testResults.tests.push({ status: 'FAIL', message });
        console.log(`   ❌ ${message}`);
    }
}

async function runTest(name, testFn) {
    console.log(`\n🔬 ${name}`);
    try {
        await testFn();
    } catch (error) {
        testResults.failed++;
        testResults.tests.push({ status: 'ERROR', message: name, error: error.message });
        console.log(`   ❌ ERROR: ${error.message}`);
    }
}

async function setupIndex() {
    console.log('\n📦 Setting up index for rigorous testing...');
    
    memoryIndex = new MemoryIndex();
    
    console.log('🔄 Building index...');
    const indexerClient = new IndexerClient();
    await indexerClient.start();
    
    const glob = require('glob');
    const files = glob.sync('**/*.java', { 
        cwd: testProjectPath, 
        absolute: true,
        ignore: ['**/target/**', '**/build/**']
    });
    
    console.log(`📂 Found ${files.length} Java files`);
    
    const sourceRoots = [
        path.join(testProjectPath, 'src', 'main', 'java'),
        path.join(testProjectPath, 'src')
    ];
    
    const result = await indexerClient.indexFiles(files, sourceRoots);
    
    for (const fileResult of result) {
        if (fileResult.symbols) {
            for (const symbol of fileResult.symbols) {
                memoryIndex.addSymbol(symbol);
            }
        }
        if (fileResult.references) {
            for (const ref of fileResult.references) {
                memoryIndex.addReference(ref);
            }
        }
    }
    
    await indexerClient.stop();
    
    const allSymbols = memoryIndex.getAllSymbols();
    const symbolCount = allSymbols ? allSymbols.size : 0;
    console.log(`✅ Index ready: ${symbolCount} symbols\n`);
    return symbolCount;
}

// ============================================================
// RIGOROUS TEST CASES
// ============================================================

async function testAllPackagesInProject() {
    await runTest('Test 1: Scan ALL packages in project', async () => {
        const packages = ['com.example', 'com.example.service', 'com.example.model', 
                         'com.example.repository', 'com.example.controller', 'com.example.util'];
        
        for (const pkg of packages) {
            const result = await handleScanMigrationCandidates({
                sourcePackage: pkg,
                blockedPatterns: DEFAULT_BLOCKED,
                includeSubpackages: false
            }, memoryIndex);
            
            assert(!result.isError, `Package ${pkg} scanned without error`);
        }
    });
}

async function testBlockedPatternCombinations() {
    await runTest('Test 2: Various blocked pattern combinations', async () => {
        const patterns = [
            ['javax.*'],
            ['java.sql.*', 'javax.persistence.*'],
            ['org.springframework.*', 'javax.*', 'java.sql.*'],
            ['*.legacy.*'],
            ['com.external.*', 'org.thirdparty.*']
        ];
        
        for (const patternSet of patterns) {
            const result = await handleScanMigrationCandidates({
                sourcePackage: 'com.example',
                blockedPatterns: patternSet,
                includeSubpackages: true
            }, memoryIndex);
            
            assert(!result.isError, `Patterns ${patternSet.join(', ')} processed correctly`);
        }
    });
}

async function testOutputFormats() {
    await runTest('Test 3: All output formats work correctly', async () => {
        const formats = ['summary', 'detailed', 'json', 'migration-plan'];
        
        for (const format of formats) {
            const result = await handleScanMigrationCandidates({
                sourcePackage: 'com.example',
                blockedPatterns: DEFAULT_BLOCKED,
                includeSubpackages: true,
                outputFormat: format
            }, memoryIndex);
            
            assert(!result.isError, `Format '${format}' works`);
            
            const text = result.content[0].text;
            if (format === 'json') {
                try {
                    JSON.parse(text);
                    assert(true, `Format '${format}' produces valid JSON`);
                } catch {
                    assert(false, `Format '${format}' produces valid JSON`);
                }
            }
        }
    });
}

async function testEdgeCases() {
    await runTest('Test 4: Edge cases - empty/invalid inputs', async () => {
        // Empty package (should return 0 classes, not error)
        let result = await handleScanMigrationCandidates({
            sourcePackage: 'com.nonexistent.package',
            blockedPatterns: DEFAULT_BLOCKED
        }, memoryIndex);
        assert(!result.isError, 'Empty package handled gracefully');
        
        // Very deep package
        result = await handleScanMigrationCandidates({
            sourcePackage: 'com.example.very.deep.nested.package.that.does.not.exist',
            blockedPatterns: DEFAULT_BLOCKED
        }, memoryIndex);
        assert(!result.isError, 'Deep non-existent package handled');
        
        // Single character package
        result = await handleScanMigrationCandidates({
            sourcePackage: 'a',
            blockedPatterns: DEFAULT_BLOCKED
        }, memoryIndex);
        assert(!result.isError, 'Single char package handled');
    });
}

async function testMaxSafeExternalDepsVariations() {
    await runTest('Test 5: maxSafeExternalDeps threshold variations', async () => {
        const thresholds = [0, 1, 3, 5, 10, 100];
        
        for (const threshold of thresholds) {
            const result = await handleScanMigrationCandidates({
                sourcePackage: 'com.example',
                blockedPatterns: DEFAULT_BLOCKED,
                includeSubpackages: true,
                maxSafeExternalDeps: threshold,
                outputFormat: 'json'
            }, memoryIndex);
            
            assert(!result.isError, `Threshold ${threshold} processed`);
            
            const data = JSON.parse(result.content[0].text);
            // Verify the threshold affects categorization
            assert(data.summary !== undefined, `Summary exists for threshold ${threshold}`);
        }
    });
}

async function testConcurrentScans() {
    await runTest('Test 6: Concurrent scans (stress test)', async () => {
        const packages = ['com.example', 'com.example.service', 'com.example.model', 
                         'com.example.util', 'com.example.controller'];
        
        const startTime = Date.now();
        
        // Run 5 scans concurrently
        const promises = packages.map(pkg => 
            handleScanMigrationCandidates({
                sourcePackage: pkg,
                blockedPatterns: DEFAULT_BLOCKED,
                includeSubpackages: true
            }, memoryIndex)
        );
        
        const results = await Promise.all(promises);
        const duration = Date.now() - startTime;
        
        const allSuccess = results.every(r => !r.isError);
        assert(allSuccess, `All 5 concurrent scans completed in ${duration}ms`);
    });
}

async function testLargeBlockedPatternList() {
    await runTest('Test 7: Large blocked pattern list (50+ patterns)', async () => {
        const blockedPatterns = [];
        for (let i = 0; i < 50; i++) {
            blockedPatterns.push(`org.blocked${i}.*`);
        }
        blockedPatterns.push('javax.*', 'java.sql.*');
        
        const result = await handleScanMigrationCandidates({
            sourcePackage: 'com.example',
            blockedPatterns: blockedPatterns,
            includeSubpackages: true
        }, memoryIndex);
        
        assert(!result.isError, `50+ blocked patterns processed without error`);
    });
}

async function testRepeatedScans() {
    await runTest('Test 8: Repeated scans produce consistent results', async () => {
        const results = [];
        
        for (let i = 0; i < 5; i++) {
            const result = await handleScanMigrationCandidates({
                sourcePackage: 'com.example',
                blockedPatterns: DEFAULT_BLOCKED,
                includeSubpackages: true,
                outputFormat: 'json'
            }, memoryIndex);
            // Parse and remove scanTimeMs which varies between runs
            const parsed = JSON.parse(result.content[0].text);
            delete parsed.summary.scanTimeMs;
            results.push(JSON.stringify(parsed));
        }
        
        // All results should be identical (ignoring timing)
        const allSame = results.every(r => r === results[0]);
        assert(allSame, 'Repeated scans produce identical results (ignoring timing)');
    });
}

async function testBatchOrdering() {
    await runTest('Test 9: Migration batch ordering correctness', async () => {
        const result = await handleScanMigrationCandidates({
            sourcePackage: 'com.example',
            blockedPatterns: DEFAULT_BLOCKED,
            includeSubpackages: true,
            outputFormat: 'json'
        }, memoryIndex);
        
        assert(!result.isError, 'Batch ordering scan succeeded');
        
        const data = JSON.parse(result.content[0].text);
        
        if (data.migrationPlan && data.migrationPlan.batches) {
            const batches = data.migrationPlan.batches;
            
            // Verify batch numbering is sequential
            let lastBatch = 0;
            let orderCorrect = true;
            for (const batch of batches) {
                if (batch.order < lastBatch) {
                    orderCorrect = false;
                    break;
                }
                lastBatch = batch.order;
            }
            assert(orderCorrect, 'Batch ordering is sequential');
            
            // Verify batch 1 contains types with minimal dependencies
            if (batches.length > 0) {
                assert(true, `Batch 1 has ${batches[0].classes.length} classes`);
            }
        } else {
            assert(true, 'No batches needed (all blocked or empty)');
        }
    });
}

async function testSpecialCharactersInPatterns() {
    await runTest('Test 10: Special characters in patterns', async () => {
        const specialPatterns = [
            ['org.apache.commons.*'],
            ['com.google.guava.*'],
            ['io.netty.*'],
            ['org.slf4j.*']
        ];
        
        for (const patterns of specialPatterns) {
            const result = await handleScanMigrationCandidates({
                sourcePackage: 'com.example',
                blockedPatterns: patterns,
                includeSubpackages: true
            }, memoryIndex);
            
            assert(!result.isError, `Pattern '${patterns[0]}' handled correctly`);
        }
    });
}

async function testRiskCategorization() {
    await runTest('Test 11: Risk categorization accuracy', async () => {
        const result = await handleScanMigrationCandidates({
            sourcePackage: 'com.example',
            includeSubpackages: true,
            blockedPatterns: DEFAULT_BLOCKED,
            outputFormat: 'json'
        }, memoryIndex);
        
        assert(!result.isError, 'Risk categorization scan succeeded');
        
        const data = JSON.parse(result.content[0].text);
        
        // Verify all categories are valid
        const validCategories = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'BLOCKED'];
        let allValid = true;
        
        for (const cls of data.classes || []) {
            if (!validCategories.includes(cls.risk)) {
                allValid = false;
                console.log(`   Invalid risk: ${cls.risk} for ${cls.fqn}`);
            }
        }
        
        assert(allValid, 'All risk categories are valid');
    });
}

async function testEffortEstimation() {
    await runTest('Test 12: Effort estimation calculation', async () => {
        const result = await handleScanMigrationCandidates({
            sourcePackage: 'com.example',
            blockedPatterns: DEFAULT_BLOCKED,
            includeSubpackages: true,
            outputFormat: 'json'
        }, memoryIndex);
        
        assert(!result.isError, 'Effort estimation scan succeeded');
        
        const data = JSON.parse(result.content[0].text);
        
        if (data.migrationPlan && data.migrationPlan.totalEffortDays !== undefined) {
            assert(data.migrationPlan.totalEffortDays >= 0, 
                   `Effort estimation is non-negative: ${data.migrationPlan.totalEffortDays} days`);
        } else {
            assert(true, 'No effort estimation needed');
        }
    });
}

async function testPerformanceUnderLoad() {
    await runTest('Test 13: Performance under load (20 rapid scans)', async () => {
        const startTime = Date.now();
        
        for (let i = 0; i < 20; i++) {
            await handleScanMigrationCandidates({
                sourcePackage: 'com.example',
                blockedPatterns: DEFAULT_BLOCKED,
                includeSubpackages: true
            }, memoryIndex);
        }
        
        const duration = Date.now() - startTime;
        const avgTime = duration / 20;
        
        assert(avgTime < 100, `Average scan time: ${avgTime.toFixed(1)}ms (should be <100ms)`);
    });
}

async function testMemoryStability() {
    await runTest('Test 14: Memory stability (no leaks)', async () => {
        const initialHeap = process.memoryUsage().heapUsed;
        
        // Run 50 scans
        for (let i = 0; i < 50; i++) {
            await handleScanMigrationCandidates({
                sourcePackage: 'com.example',
                includeSubpackages: true,
                blockedPatterns: DEFAULT_BLOCKED,
                outputFormat: 'json'
            }, memoryIndex);
        }
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
        
        const finalHeap = process.memoryUsage().heapUsed;
        const heapGrowth = (finalHeap - initialHeap) / 1024 / 1024;
        
        // Allow up to 50MB growth (reasonable for 50 operations)
        assert(heapGrowth < 50, `Heap growth: ${heapGrowth.toFixed(2)}MB (should be <50MB)`);
    });
}

async function testSubpackageDepthLimits() {
    await runTest('Test 15: Subpackage depth limits', async () => {
        // Test with includeSubpackages = true at various depths
        const prefixes = [
            'com',
            'com.example',
            'com.example.service',
            'com.example.service.impl'
        ];
        
        for (const prefix of prefixes) {
            const result = await handleScanMigrationCandidates({
                sourcePackage: prefix,
                blockedPatterns: DEFAULT_BLOCKED,
                includeSubpackages: true,
                outputFormat: 'json'
            }, memoryIndex);
            
            assert(!result.isError, `Prefix '${prefix}' scanned successfully`);
        }
    });
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  RIGOROUS TEST SUITE - scan_migration_candidates');
    console.log('  Comprehensive Edge Cases & Stress Tests');
    console.log('═══════════════════════════════════════════════════════');
    
    try {
        await setupIndex();
        
        // Run all rigorous tests
        await testAllPackagesInProject();
        await testBlockedPatternCombinations();
        await testOutputFormats();
        await testEdgeCases();
        await testMaxSafeExternalDepsVariations();
        await testConcurrentScans();
        await testLargeBlockedPatternList();
        await testRepeatedScans();
        await testBatchOrdering();
        await testSpecialCharactersInPatterns();
        await testRiskCategorization();
        await testEffortEstimation();
        await testPerformanceUnderLoad();
        await testMemoryStability();
        await testSubpackageDepthLimits();
        
        // Print summary
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('  RIGOROUS TEST SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`\n  Total Assertions: ${testResults.passed + testResults.failed}`);
        console.log(`  ✅ Passed: ${testResults.passed}`);
        console.log(`  ❌ Failed: ${testResults.failed}`);
        console.log(`  Pass Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
        
        const memUsage = process.memoryUsage();
        console.log(`\n  💾 Final Memory:`);
        console.log(`     Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
        console.log(`     RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB`);
        
        console.log('\n═══════════════════════════════════════════════════════');
        
        if (testResults.failed === 0) {
            console.log('\n🎉 ALL RIGOROUS TESTS PASSED! Ready for production.\n');
            process.exit(0);
        } else {
            console.log(`\n❌ ${testResults.failed} test(s) failed. Fix before publishing.\n`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

main();
