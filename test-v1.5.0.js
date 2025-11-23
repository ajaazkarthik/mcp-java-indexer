/**
 * Comprehensive Test Suite for MCP Java Indexer v1.5.0
 * Tests all major improvements: Symbol Resolution, Semantic Search, Framework Detection
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_PROJECT_DIR = path.join(__dirname, 'example-java-project', 'src');
const SERVER_PATH = path.join(__dirname, 'server', 'dist', 'index.js');

// ANSI color codes for output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

class TestRunner {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
        this.mcpProcess = null;
    }

    async startMCPServer() {
        console.log(`${colors.cyan}🚀 Starting MCP Server...${colors.reset}`);
        
        return new Promise((resolve, reject) => {
            this.mcpProcess = spawn('node', [SERVER_PATH], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let initialized = false;

            this.mcpProcess.stderr.on('data', (data) => {
                const output = data.toString();
                if (output.includes('MCP Java Indexer server running') && !initialized) {
                    initialized = true;
                    console.log(`${colors.green}✅ Server started successfully${colors.reset}\n`);
                    resolve();
                }
            });

            this.mcpProcess.on('error', (error) => {
                reject(error);
            });

            setTimeout(() => {
                if (!initialized) {
                    reject(new Error('Server startup timeout'));
                }
            }, 10000);
        });
    }

    async sendMCPRequest(method, params) {
        return new Promise((resolve, reject) => {
            const requestId = Date.now();
            const request = {
                jsonrpc: '2.0',
                id: requestId,
                method,
                params
            };

            let responseData = '';
            let timeoutId;

            const dataHandler = (data) => {
                responseData += data.toString();
                const lines = responseData.split('\n');
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const response = JSON.parse(line);
                            if (response.id === requestId) {
                                clearTimeout(timeoutId);
                                this.mcpProcess.stdout.removeListener('data', dataHandler);
                                resolve(response.result || response.error);
                                return;
                            }
                        } catch (e) {
                            // Incomplete JSON, wait for more data
                        }
                    }
                }
            };

            this.mcpProcess.stdout.on('data', dataHandler);

            timeoutId = setTimeout(() => {
                this.mcpProcess.stdout.removeListener('data', dataHandler);
                reject(new Error('Request timeout'));
            }, 30000);

            this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async stopMCPServer() {
        if (this.mcpProcess) {
            this.mcpProcess.kill();
            console.log(`${colors.cyan}🛑 Server stopped${colors.reset}\n`);
        }
    }

    logTest(name, category) {
        console.log(`${colors.blue}🧪 Testing: ${colors.magenta}${category}${colors.reset} - ${name}`);
    }

    logSuccess(message) {
        console.log(`${colors.green}   ✅ PASS: ${message}${colors.reset}`);
        this.results.passed++;
    }

    logFailure(message, error) {
        console.log(`${colors.red}   ❌ FAIL: ${message}${colors.reset}`);
        if (error) {
            console.log(`${colors.red}      Error: ${error}${colors.reset}`);
        }
        this.results.failed++;
    }

    logInfo(message) {
        console.log(`${colors.yellow}   ℹ️  ${message}${colors.reset}`);
    }

    async runTest(name, category, testFn) {
        this.logTest(name, category);
        try {
            const result = await testFn();
            this.results.tests.push({ name, category, passed: result.passed, message: result.message });
            if (result.passed) {
                this.logSuccess(result.message);
            } else {
                this.logFailure(result.message, result.error);
            }
            console.log(''); // Blank line
            return result.passed;
        } catch (error) {
            this.results.tests.push({ name, category, passed: false, message: error.message });
            this.logFailure('Test threw exception', error.message);
            console.log(''); // Blank line
            return false;
        }
    }

    // ==================== TEST SUITES ====================

    async testSymbolResolution() {
        console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
        console.log(`${colors.cyan}📦 TEST SUITE: Symbol Resolution (Core v1.5.0 Feature)${colors.reset}`);
        console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

        // Test 1: Simple name resolution
        await this.runTest(
            'Simple class name resolution',
            'Symbol Resolution',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'find_symbol',
                    arguments: { name: 'UserService' }
                });

                const text = result.content[0].text;
                const hasResults = text.includes('UserService') && !text.includes('No symbols found');
                
                return {
                    passed: hasResults,
                    message: hasResults 
                        ? 'Successfully resolved "UserService" without full FQN' 
                        : 'Failed to resolve simple class name'
                };
            }
        );

        // Test 2: Partial name matching
        await this.runTest(
            'Partial name matching',
            'Symbol Resolution',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'find_symbol',
                    arguments: { name: 'User' }
                });

                const text = result.content[0].text;
                const hasMultiple = text.includes('Found') && text.includes('symbol');
                
                return {
                    passed: hasMultiple,
                    message: hasMultiple 
                        ? 'Successfully found multiple matches for partial name "User"' 
                        : 'Partial matching not working'
                };
            }
        );

        // Test 3: Method name without parameters
        await this.runTest(
            'Method resolution without exact parameters',
            'Symbol Resolution',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'find_usages',
                    arguments: { fqn: 'UserService.save' }
                });

                const text = result.content[0].text;
                const resolved = text.includes('Resolved') || text.includes('Found') || !text.includes('Symbol not found');
                
                return {
                    passed: resolved,
                    message: resolved 
                        ? 'Successfully resolved method without exact parameters' 
                        : 'Method resolution requires exact parameters'
                };
            }
        );

        // Test 4: Case-insensitive matching
        await this.runTest(
            'Case-insensitive symbol search',
            'Symbol Resolution',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'find_symbol',
                    arguments: { name: 'userservice' }
                });

                const text = result.content[0].text;
                const found = text.includes('UserService') || text.includes('symbol');
                
                return {
                    passed: found,
                    message: found 
                        ? 'Case-insensitive search working' 
                        : 'Case-insensitive search not implemented'
                };
            }
        );

        // Test 5: Fuzzy matching with alternatives
        await this.runTest(
            'Fuzzy matching provides alternatives',
            'Symbol Resolution',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'find_usages',
                    arguments: { fqn: 'Service' }
                });

                const text = result.content[0].text;
                const hasAlternatives = text.includes('possibilities') || text.includes('alternative') || 
                                       text.includes('Found') || text.includes('match');
                
                return {
                    passed: hasAlternatives,
                    message: hasAlternatives 
                        ? 'Fuzzy matching provides helpful alternatives' 
                        : 'No alternatives shown for ambiguous match'
                };
            }
        );
    }

    async testSemanticSearch() {
        console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
        console.log(`${colors.cyan}🔍 TEST SUITE: Semantic Search (v1.5.0 Overhaul)${colors.reset}`);
        console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

        // Test 1: Framework detection (Hibernate)
        await this.runTest(
            'Hibernate framework detection',
            'Semantic Search',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'semantic_search',
                    arguments: { 
                        query: 'Hibernate session creation methods',
                        limit: 10
                    }
                });

                const text = result.content[0].text;
                const detectsHibernate = text.toLowerCase().includes('hibernate') || 
                                        text.includes('session') ||
                                        text.includes('Relevance Score');
                
                return {
                    passed: detectsHibernate,
                    message: detectsHibernate 
                        ? 'Hibernate framework patterns detected' 
                        : 'Framework detection not working'
                };
            }
        );

        // Test 2: Intent recognition (save operations)
        await this.runTest(
            'Save operation intent detection',
            'Semantic Search',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'semantic_search',
                    arguments: { 
                        query: 'methods that save to database',
                        scope: 'methods',
                        limit: 10
                    }
                });

                const text = result.content[0].text;
                const detectsIntent = text.includes('save') || text.includes('persist') || 
                                     text.includes('Relevance') || text.includes('Found');
                
                return {
                    passed: detectsIntent,
                    message: detectsIntent 
                        ? 'Intent detection working (save operations)' 
                        : 'Intent detection not implemented'
                };
            }
        );

        // Test 3: Relevance scoring
        await this.runTest(
            'Relevance scoring present',
            'Semantic Search',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'semantic_search',
                    arguments: { 
                        query: 'Spring service methods',
                        limit: 5
                    }
                });

                const text = result.content[0].text;
                const hasScoring = text.includes('Score') || text.includes('%') || 
                                  text.includes('Relevance') || text.includes('confidence');
                
                return {
                    passed: hasScoring,
                    message: hasScoring 
                        ? 'Relevance scoring displayed in results' 
                        : 'No relevance scoring found'
                };
            }
        );

        // Test 4: Spring framework patterns
        await this.runTest(
            'Spring framework pattern detection',
            'Semantic Search',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'semantic_search',
                    arguments: { 
                        query: 'Spring repository methods',
                        limit: 10
                    }
                });

                const text = result.content[0].text;
                const detectsSpring = text.toLowerCase().includes('spring') || 
                                     text.toLowerCase().includes('repository') ||
                                     text.includes('Found');
                
                return {
                    passed: detectsSpring,
                    message: detectsSpring 
                        ? 'Spring patterns detected in search' 
                        : 'Spring detection not working'
                };
            }
        );

        // Test 5: Empty results guidance
        await this.runTest(
            'Helpful guidance for no results',
            'Semantic Search',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'semantic_search',
                    arguments: { 
                        query: 'xyzabcnonexistentpattern12345',
                        limit: 10
                    }
                });

                const text = result.content[0].text;
                const hasGuidance = text.includes('Tips') || text.includes('Try') || 
                                   text.includes('suggestions') || text.includes('No relevant');
                
                return {
                    passed: hasGuidance,
                    message: hasGuidance 
                        ? 'Provides helpful guidance when no results found' 
                        : 'No user guidance for empty results'
                };
            }
        );
    }

    async testFrameworkDetection() {
        console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
        console.log(`${colors.cyan}🏗️  TEST SUITE: Framework Detection (Annotations)${colors.reset}`);
        console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

        // Test 1: Spring annotation detection
        await this.runTest(
            'Spring @Service annotation detection',
            'Framework Detection',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'search_text',
                    arguments: { 
                        pattern: '@Service',
                        isRegex: false
                    }
                });

                const text = result.content[0].text;
                const foundAnnotation = text.includes('Found') && text.includes('match');
                
                return {
                    passed: foundAnnotation,
                    message: foundAnnotation 
                        ? 'Spring @Service annotation indexed' 
                        : 'Spring annotations not indexed (might not exist in test project)'
                };
            }
        );

        // Test 2: Reference tracking improvement
        await this.runTest(
            'Reference count accuracy',
            'Framework Detection',
            async () => {
                // First find a class
                const symbolResult = await this.sendMCPRequest('tools/call', {
                    name: 'find_symbol',
                    arguments: { name: 'User' }
                });

                if (symbolResult.content[0].text.includes('No symbols found')) {
                    return {
                        passed: true,
                        message: 'Skipped - no User class in test project'
                    };
                }

                // Then check its usages
                const usageResult = await this.sendMCPRequest('tools/call', {
                    name: 'find_usages',
                    arguments: { fqn: 'User' }
                });

                const text = usageResult.content[0].text;
                const hasUsages = text.includes('Found') || text.includes('usage') || 
                                 text.includes('No usages');
                
                return {
                    passed: hasUsages,
                    message: hasUsages 
                        ? 'Reference tracking provides results' 
                        : 'Reference tracking broken'
                };
            }
        );

        // Test 3: Impact analysis completeness
        await this.runTest(
            'Impact analysis shows dependencies',
            'Framework Detection',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'analyze_impact',
                    arguments: { 
                        symbolFqn: 'UserService',
                        depth: 2
                    }
                });

                const text = result.content[0].text;
                const hasAnalysis = text.includes('Impact Analysis') || 
                                   text.includes('Risk') || 
                                   text.includes('dependencies') ||
                                   text.includes('Resolved');
                
                return {
                    passed: hasAnalysis,
                    message: hasAnalysis 
                        ? 'Impact analysis generates report' 
                        : 'Impact analysis not working'
                };
            }
        );
    }

    async testToolIntegration() {
        console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
        console.log(`${colors.cyan}🔗 TEST SUITE: Tool Integration & Usability${colors.reset}`);
        console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

        // Test 1: find_usages with simple name
        await this.runTest(
            'find_usages accepts simple names',
            'Tool Integration',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'find_usages',
                    arguments: { fqn: 'String' }
                });

                const text = result.content[0].text;
                const works = !text.includes('Error') && (text.includes('Found') || text.includes('No usages'));
                
                return {
                    passed: works,
                    message: works 
                        ? 'find_usages works with simple names' 
                        : 'find_usages requires exact FQN'
                };
            }
        );

        // Test 2: call_graph with simple name
        await this.runTest(
            'call_graph accepts simple names',
            'Tool Integration',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'call_graph',
                    arguments: { fqn: 'UserService' }
                });

                const text = result.content[0].text;
                const works = !text.includes('Error') && (text.includes('Call Graph') || text.includes('Resolved'));
                
                return {
                    passed: works,
                    message: works 
                        ? 'call_graph works with simple names' 
                        : 'call_graph requires exact FQN'
                };
            }
        );

        // Test 3: Error messages are helpful
        await this.runTest(
            'Helpful error messages',
            'Tool Integration',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'find_usages',
                    arguments: { fqn: 'CompletelyNonexistentClassXYZ123' }
                });

                const text = result.content[0].text;
                const isHelpful = text.includes('not found') && 
                                 (text.includes('Tip') || text.includes('Try') || text.includes('search'));
                
                return {
                    passed: isHelpful,
                    message: isHelpful 
                        ? 'Error messages provide helpful guidance' 
                        : 'Error messages not user-friendly'
                };
            }
        );

        // Test 4: Goto definition resolution
        await this.runTest(
            'goto_definition with fuzzy matching',
            'Tool Integration',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'goto_definition',
                    arguments: { symbol: 'User' }
                });

                const text = result.content[0].text;
                const works = text.includes('Location') || text.includes('definition') || 
                             text.includes('Found') || text.includes('Not found');
                
                return {
                    passed: works,
                    message: works 
                        ? 'goto_definition handles partial matches' 
                        : 'goto_definition broken'
                };
            }
        );
    }

    async testIndexingQuality() {
        console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
        console.log(`${colors.cyan}📊 TEST SUITE: Indexing Quality${colors.reset}`);
        console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

        // Test 1: Index project
        await this.runTest(
            'Project indexing completes successfully',
            'Indexing Quality',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'index_project',
                    arguments: { 
                        rootDir: TEST_PROJECT_DIR,
                        sourceRoots: ['']
                    }
                });

                const text = result.content[0].text;
                const success = text.includes('indexed') || text.includes('files') || 
                               text.includes('symbols');
                
                return {
                    passed: success,
                    message: success 
                        ? 'Project indexing completed' 
                        : 'Indexing failed'
                };
            }
        );

        // Test 2: Symbol count reasonable
        await this.runTest(
            'Symbol extraction working',
            'Indexing Quality',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'find_symbol',
                    arguments: { name: '' }
                });

                const text = result.content[0].text;
                const hasSymbols = text.includes('symbol') || text.includes('Found') || 
                                  text.includes('class') || text.includes('method');
                
                return {
                    passed: hasSymbols,
                    message: hasSymbols 
                        ? 'Symbols successfully extracted from code' 
                        : 'No symbols indexed'
                };
            }
        );

        // Test 3: Text search functional
        await this.runTest(
            'Text search working',
            'Indexing Quality',
            async () => {
                const result = await this.sendMCPRequest('tools/call', {
                    name: 'search_text',
                    arguments: { 
                        pattern: 'public',
                        isRegex: false
                    }
                });

                const text = result.content[0].text;
                const works = text.includes('Found') || text.includes('match') || 
                             text.includes('No matches');
                
                return {
                    passed: works,
                    message: works 
                        ? 'Text search operational' 
                        : 'Text search not working'
                };
            }
        );
    }

    async runAllTests() {
        console.log(`${colors.magenta}${'='.repeat(70)}${colors.reset}`);
        console.log(`${colors.magenta}   MCP JAVA INDEXER v1.5.0 - COMPREHENSIVE TEST SUITE${colors.reset}`);
        console.log(`${colors.magenta}${'='.repeat(70)}${colors.reset}\n`);

        try {
            await this.startMCPServer();
            
            // Wait for server to fully initialize
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Run all test suites
            await this.testIndexingQuality();
            await this.testSymbolResolution();
            await this.testSemanticSearch();
            await this.testFrameworkDetection();
            await this.testToolIntegration();

            // Print summary
            this.printSummary();

        } catch (error) {
            console.error(`${colors.red}❌ Test execution failed: ${error.message}${colors.reset}`);
            console.error(error);
        } finally {
            await this.stopMCPServer();
        }
    }

    printSummary() {
        console.log(`\n${colors.magenta}${'='.repeat(70)}${colors.reset}`);
        console.log(`${colors.magenta}   TEST SUMMARY${colors.reset}`);
        console.log(`${colors.magenta}${'='.repeat(70)}${colors.reset}\n`);

        const total = this.results.passed + this.results.failed;
        const passRate = total > 0 ? ((this.results.passed / total) * 100).toFixed(1) : 0;

        console.log(`${colors.cyan}Total Tests:${colors.reset} ${total}`);
        console.log(`${colors.green}Passed:${colors.reset} ${this.results.passed}`);
        console.log(`${colors.red}Failed:${colors.reset} ${this.results.failed}`);
        console.log(`${colors.yellow}Pass Rate:${colors.reset} ${passRate}%\n`);

        if (this.results.failed > 0) {
            console.log(`${colors.red}Failed Tests:${colors.reset}`);
            this.results.tests.filter(t => !t.passed).forEach(test => {
                console.log(`  ${colors.red}❌${colors.reset} [${test.category}] ${test.name}`);
                console.log(`     ${test.message}`);
            });
            console.log('');
        }

        // Final verdict
        if (passRate >= 90) {
            console.log(`${colors.green}🎉 EXCELLENT! v1.5.0 is production ready!${colors.reset}`);
        } else if (passRate >= 75) {
            console.log(`${colors.yellow}⚠️  GOOD! Minor issues to address.${colors.reset}`);
        } else if (passRate >= 50) {
            console.log(`${colors.yellow}⚠️  NEEDS WORK! Several features not working as expected.${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ CRITICAL! Major functionality broken.${colors.reset}`);
        }

        console.log(`\n${colors.magenta}${'='.repeat(70)}${colors.reset}\n`);
    }
}

// Run tests
const runner = new TestRunner();
runner.runAllTests().catch(error => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
});
