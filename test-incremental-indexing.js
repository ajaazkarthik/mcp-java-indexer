/**
 * Test Incremental Indexing Behavior
 * 
 * Tests that index_project:
 * 1. First run: Does full index
 * 2. Second run (no changes): Loads from disk, reports up-to-date
 * 3. After file change: Only reindexes changed file
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, 'example-java-project');
const INDEX_DIR = path.join(PROJECT_ROOT, '.mcp-index');

// Helper to run MCP tool
function runMCPTool(toolName, args) {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    const proc = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    let resolved = false;

    proc.stdout.on('data', (data) => {
      output += data.toString();
      // Try to parse JSON response as it comes
      const lines = output.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const resp = JSON.parse(line);
          if (resp.result && !resolved) {
            resolved = true;
            proc.kill();
            resolve({
              responses: [resp],
              stderr: errorOutput
            });
          }
        } catch (e) {}
      }
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Send tool call request after a brief delay for server startup
    setTimeout(() => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };
      proc.stdin.write(JSON.stringify(request) + '\n');
    }, 500);

    // Timeout after 20 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        resolve({
          responses: [],
          stderr: errorOutput
        });
      }
    }, 20000);

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

async function test() {
  console.log('='.repeat(60));
  console.log('TEST: Incremental Indexing Behavior');
  console.log('='.repeat(60));

  try {
    // Clean up old index
    if (fs.existsSync(INDEX_DIR)) {
      console.log('\n🧹 Cleaning up old index...');
      fs.rmSync(INDEX_DIR, { recursive: true, force: true });
      console.log('✅ Old index removed');
    }

    // TEST 1: First run - Full index
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 1: First Run (No Existing Index)');
    console.log('-'.repeat(60));
    
    const test1Start = Date.now();
    const result1 = await runMCPTool('index_project', {
      rootDir: PROJECT_ROOT
    });
    const test1Time = ((Date.now() - test1Start) / 1000).toFixed(2);
    
    console.log('\nStderr output:');
    console.log(result1.stderr);
    
    if (result1.responses.length > 0 && result1.responses[0].result) {
      const text = result1.responses[0].result.content[0].text;
      console.log('\nResult:');
      console.log(text);
      
      const isFullIndex = text.includes('Full index') || !text.includes('Incremental');
      console.log(`\n✅ Test 1: ${isFullIndex ? 'PASS' : 'FAIL'} - ${isFullIndex ? 'Did full index' : 'Should have done full index'}`);
      console.log(`   Time: ${test1Time}s`);
    } else {
      console.log('❌ Test 1: FAIL - No response received');
    }

    // Verify index was created
    if (!fs.existsSync(INDEX_DIR)) {
      console.log('❌ Test 1: FAIL - Index directory not created');
      return;
    }

    // TEST 2: Second run - Should load from disk
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 2: Second Run (Existing Index, No Changes)');
    console.log('-'.repeat(60));
    
    const test2Start = Date.now();
    const result2 = await runMCPTool('index_project', {
      rootDir: PROJECT_ROOT
    });
    const test2Time = ((Date.now() - test2Start) / 1000).toFixed(2);
    
    console.log('\nStderr output:');
    console.log(result2.stderr);
    
    if (result2.responses.length > 0 && result2.responses[0].result) {
      const text = result2.responses[0].result.content[0].text;
      console.log('\nResult:');
      console.log(text);
      
      const isIncremental = text.includes('up-to-date') || text.includes('Loaded existing');
      console.log(`\n✅ Test 2: ${isIncremental ? 'PASS' : 'FAIL'} - ${isIncremental ? 'Loaded from disk' : 'Should have loaded from disk'}`);
      console.log(`   Time: ${test2Time}s (should be much faster than ${test1Time}s)`);
      
      const isFaster = parseFloat(test2Time) < parseFloat(test1Time) / 2;
      console.log(`   Speed: ${isFaster ? 'PASS' : 'WARNING'} - ${isFaster ? 'Significantly faster' : 'Not much faster than full index'}`);
    } else {
      console.log('❌ Test 2: FAIL - No response received');
    }

    // TEST 3: Modify a file and reindex
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 3: Third Run (After File Modification)');
    console.log('-'.repeat(60));
    
    const testFile = path.join(PROJECT_ROOT, 'src', 'main', 'java', 'com', 'example', 'demo', 'User.java');
    console.log(`\n📝 Modifying file: ${testFile}`);
    
    // Add a comment to trigger reindex
    const originalContent = fs.readFileSync(testFile, 'utf8');
    fs.writeFileSync(testFile, originalContent + '\n// Test modification\n');
    console.log('✅ File modified');
    
    const test3Start = Date.now();
    const result3 = await runMCPTool('index_project', {
      rootDir: PROJECT_ROOT
    });
    const test3Time = ((Date.now() - test3Start) / 1000).toFixed(2);
    
    console.log('\nStderr output:');
    console.log(result3.stderr);
    
    if (result3.responses.length > 0 && result3.responses[0].result) {
      const text = result3.responses[0].result.content[0].text;
      console.log('\nResult:');
      console.log(text);
      
      const isIncremental = text.includes('Incremental') || text.includes('changed');
      console.log(`\n✅ Test 3: ${isIncremental ? 'PASS' : 'FAIL'} - ${isIncremental ? 'Did incremental update' : 'Should have done incremental update'}`);
      console.log(`   Time: ${test3Time}s (should be similar to ${test2Time}s)`);
    } else {
      console.log('❌ Test 3: FAIL - No response received');
    }
    
    // Restore original file
    fs.writeFileSync(testFile, originalContent);
    console.log('\n✅ File restored to original state');

    // TEST 4: Force full index
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 4: Force Full Index (forceFullIndex=true)');
    console.log('-'.repeat(60));
    
    const test4Start = Date.now();
    const result4 = await runMCPTool('index_project', {
      rootDir: PROJECT_ROOT,
      forceFullIndex: true
    });
    const test4Time = ((Date.now() - test4Start) / 1000).toFixed(2);
    
    console.log('\nStderr output:');
    console.log(result4.stderr);
    
    if (result4.responses.length > 0 && result4.responses[0].result) {
      const text = result4.responses[0].result.content[0].text;
      console.log('\nResult:');
      console.log(text);
      
      const isFullIndex = text.includes('Full index');
      console.log(`\n✅ Test 4: ${isFullIndex ? 'PASS' : 'FAIL'} - ${isFullIndex ? 'Did force full index' : 'Should have forced full index'}`);
      console.log(`   Time: ${test4Time}s (should be similar to ${test1Time}s)`);
    } else {
      console.log('❌ Test 4: FAIL - No response received');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Test 1 (First run):         ${test1Time}s`);
    console.log(`Test 2 (No changes):        ${test2Time}s (${((test2Time / test1Time) * 100).toFixed(1)}% of full)`);
    console.log(`Test 3 (1 file changed):    ${test3Time}s`);
    console.log(`Test 4 (Force full):        ${test4Time}s`);
    
    const speedup = (test1Time / test2Time).toFixed(1);
    console.log(`\n🚀 Incremental speedup: ${speedup}x faster`);
    
    if (parseFloat(speedup) > 2) {
      console.log('\n✅ INCREMENTAL INDEXING WORKING CORRECTLY!');
    } else {
      console.log('\n⚠️  WARNING: Incremental indexing may not be working optimally');
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

test().then(() => {
  console.log('\n✅ All tests completed');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
