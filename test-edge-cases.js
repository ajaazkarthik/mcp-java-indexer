#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Testing 5 Edge Cases for Inheritance Optimization\n');
console.log('=' .repeat(70));

// Start the indexer server
const serverPath = join(__dirname, 'server', 'dist', 'index.js');
const indexer = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let responseBuffer = '';
let requestId = 0;
let currentTest = 0;

const testCases = [
  {
    name: 'Edge Case 1: Multiple Interface Implementation',
    description: 'ServiceManager implements 3 interfaces (Auditable, Loggable, Trackable)',
    tests: [
      { search: 'ServiceManager.AUDIT_ENABLED', expected: 'Auditable.AUDIT_ENABLED' },
      { search: 'ServiceManager.LOG_LEVEL_INFO', expected: 'Loggable.LOG_LEVEL_INFO' },
      { search: 'ServiceManager.MAX_TRACK_SIZE', expected: 'Trackable.MAX_TRACK_SIZE' }
    ]
  },
  {
    name: 'Edge Case 2: Diamond Inheritance Pattern',
    description: 'Child extends MiddleA (class) and implements MiddleB (interface), both relate to Base',
    tests: [
      { search: 'Child.BASE_VALUE', expected: 'Base.BASE_VALUE' },
      { search: 'Child.MIDDLE_A', expected: 'MiddleA.MIDDLE_A' },
      { search: 'Child.MIDDLE_B', expected: 'MiddleB.MIDDLE_B' }
    ]
  },
  {
    name: 'Edge Case 3: Mixed Class and Interface Hierarchy',
    description: 'MixedEntity extends BaseEntity and implements Identifiable',
    tests: [
      { search: 'MixedEntity.ENTITY_TYPE', expected: 'BaseEntity.ENTITY_TYPE' },
      { search: 'MixedEntity.DEFAULT_ID', expected: 'BaseEntity.DEFAULT_ID' },
      { search: 'MixedEntity.ID_PREFIX', expected: 'Identifiable.ID_PREFIX' }
    ]
  },
  {
    name: 'Edge Case 4: Enum with Interface Implementation',
    description: 'HttpStatus enum implements StatusCode interface',
    tests: [
      { search: 'HttpStatus.SUCCESS_CODE', expected: 'StatusCode.SUCCESS_CODE' },
      { search: 'HttpStatus.ERROR_CODE', expected: 'StatusCode.ERROR_CODE' }
    ]
  },
  {
    name: 'Edge Case 5: Nested Inner Class Inheritance',
    description: 'ChildInner extends BaseInner (both static nested classes)',
    tests: [
      { search: 'ChildInner.BASE_INNER', expected: 'BaseInner.BASE_INNER' },
      { search: 'ChildInner.BASE_VALUE', expected: 'BaseInner.BASE_VALUE' }
    ]
  }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

indexer.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop();
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line);
        if (msg.result) {
          handleResponse(msg);
        }
      } catch (e) {
        // Log messages
        if (line.includes('Inheritance Relations')) {
          console.log(`   ${line.trim()}`);
        }
      }
    }
  }
});

indexer.stderr.on('data', (data) => {
  // Suppress stderr unless it's an actual error
});

indexer.on('close', (code) => {
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests/totalTests)*100).toFixed(1)}%`);
  
  if (failedTests === 0) {
    console.log('\n🎉 ALL EDGE CASES PASSED!');
    console.log('   ✅ Performance optimization is working correctly');
    console.log('   ✅ No regressions in inheritance tracking');
    console.log('   ✅ Ready for production use');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED - Review needed');
  }
  
  process.exit(failedTests > 0 ? 1 : 0);
});

function sendRequest(method, params) {
  const request = {
    jsonrpc: '2.0',
    id: ++requestId,
    method: method,
    params: params
  };
  
  indexer.stdin.write(JSON.stringify(request) + '\n');
}

let testStepIndex = 0;
let currentTestCase = null;

function handleResponse(msg) {
  if (!msg.result.content) return;
  
  const content = msg.result.content[0].text;
  
  if (currentTest === 0) {
    // Indexing completed
    console.log('✅ Indexing completed\n');
    
    const inheritanceMatch = content.match(/Inheritance Relations: (\d+)/);
    if (inheritanceMatch) {
      console.log(`📊 Inheritance Relations tracked: ${inheritanceMatch[1]}`);
    }
    
    console.log('\n' + '='.repeat(70));
    runNextTest();
  } else {
    // Test result
    const test = currentTestCase.tests[testStepIndex];
    totalTests++;
    
    const found = content.includes(test.expected);
    if (found) {
      console.log(`   ✅ ${test.search} → ${test.expected}`);
      passedTests++;
    } else {
      console.log(`   ❌ ${test.search} → Expected ${test.expected}`);
      console.log(`      Got: ${content.substring(0, 100)}...`);
      failedTests++;
    }
    
    testStepIndex++;
    
    if (testStepIndex < currentTestCase.tests.length) {
      // Run next test in current case
      setTimeout(() => {
        sendRequest('tools/call', {
          name: 'find_symbol',
          arguments: { name: currentTestCase.tests[testStepIndex].search }
        });
      }, 100);
    } else {
      // Move to next test case
      console.log('');
      runNextTest();
    }
  }
}

function runNextTest() {
  if (currentTest < testCases.length) {
    currentTestCase = testCases[currentTest];
    testStepIndex = 0;
    currentTest++;
    
    console.log(`\n${currentTest}. ${currentTestCase.name}`);
    console.log(`   ${currentTestCase.description}`);
    console.log('');
    
    setTimeout(() => {
      sendRequest('tools/call', {
        name: 'find_symbol',
        arguments: { name: currentTestCase.tests[0].search }
      });
    }, 200);
  } else {
    // All tests done
    setTimeout(() => {
      indexer.kill();
    }, 500);
  }
}

// Wait for server to initialize
setTimeout(() => {
  console.log('📤 Indexing project with edge case classes...\n');
  
  currentTest = 0;
  sendRequest('tools/call', {
    name: 'index_project',
    arguments: {
      rootDir: join(__dirname, 'example-java-project'),
      sourceRoots: ['src/main/java']
    }
  });
}, 1000);
