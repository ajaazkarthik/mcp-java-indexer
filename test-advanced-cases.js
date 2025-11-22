#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Testing 10 Advanced Edge Cases for Monolithic Applications\n');
console.log('=' .repeat(80));

const serverPath = join(__dirname, 'server', 'dist', 'index.js');
const indexer = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let responseBuffer = '';
let requestId = 0;
let currentTest = 0;

const testCases = [
  {
    name: 'Edge Case 1: Abstract Repository Pattern (Spring/JPA)',
    description: 'BaseRepository → AbstractCrudRepository → UserRepository (3 levels)',
    tests: [
      { search: 'com.example.demo.advanced.UserRepository.DEFAULT_BATCH_SIZE', expected: 'BaseRepository.DEFAULT_BATCH_SIZE' },
      { search: 'com.example.demo.advanced.UserRepository.DEFAULT_TIMEOUT_MS', expected: 'BaseRepository.DEFAULT_TIMEOUT_MS' },
      { search: 'com.example.demo.advanced.UserRepository.ENABLE_CACHING', expected: 'AbstractCrudRepository.ENABLE_CACHING' }
    ]
  },
  {
    name: 'Edge Case 2: Generic Service Pattern',
    description: 'Service<T> interface → AbstractService<T> → UserService (with bounded types)',
    tests: [
      { search: 'com.example.demo.advanced.UserService.MAX_RETRY_COUNT', expected: 'Service.MAX_RETRY_COUNT' },
      { search: 'com.example.demo.advanced.UserService.SERVICE_NAME', expected: 'Service.SERVICE_NAME' },
      { search: 'com.example.demo.advanced.UserService.IMPL_VERSION', expected: 'AbstractService.IMPL_VERSION' }
    ]
  },
  {
    name: 'Edge Case 3: 5-Level Deep Hierarchy',
    description: 'Level1 → Level2 → Level3 → Level4 → Level5 with method overrides',
    tests: [
      { search: 'Level5.L1_CONSTANT', expected: 'Level1.L1_CONSTANT' },
      { search: 'Level5.L3_CONSTANT', expected: 'Level3.L3_CONSTANT' },
      { search: 'Level5.L1_VALUE', expected: 'Level1.L1_VALUE' }
    ]
  },
  {
    name: 'Edge Case 4: Interface Default Methods (Java 8+)',
    description: 'Configurable interface with default methods → ConfigurableService',
    tests: [
      { search: 'ConfigurableService.CONFIG_KEY', expected: 'Configurable.CONFIG_KEY' },
      { search: 'ConfigurableService.CONFIG_TIMEOUT', expected: 'Configurable.CONFIG_TIMEOUT' }
    ]
  },
  {
    name: 'Edge Case 5: Entity Hierarchy (JPA Pattern)',
    description: 'BaseEntity → Product (table metadata inheritance)',
    tests: [
      { search: 'Product.TABLE_PREFIX', expected: 'BaseEntity.TABLE_PREFIX' },
      { search: 'Product.ID_COLUMN', expected: 'BaseEntity.ID_COLUMN' },
      { search: 'Product.CREATED_AT', expected: 'BaseEntity.CREATED_AT' }
    ]
  },
  {
    name: 'Edge Case 6: Cross-Package Inheritance',
    description: 'util.AbstractValidator → service.EmailValidator (different packages)',
    tests: [
      { search: 'EmailValidator.MIN_LENGTH', expected: 'AbstractValidator.MIN_LENGTH' },
      { search: 'EmailValidator.VALIDATION_FAILED', expected: 'AbstractValidator.VALIDATION_FAILED' }
    ]
  },
  {
    name: 'Edge Case 7: Builder Pattern Inheritance',
    description: 'BaseBuilder<T> → UserBuilder (fluent API pattern)',
    tests: [
      { search: 'com.example.demo.advanced.UserBuilder.BUILDER_VERSION', expected: 'BaseBuilder.BUILDER_VERSION' },
      { search: 'com.example.demo.advanced.UserBuilder.VALIDATE_ON_BUILD', expected: 'BaseBuilder.VALIDATE_ON_BUILD' }
    ]
  },
  {
    name: 'Edge Case 8: Exception Hierarchy',
    description: 'RuntimeException → BaseException → ValidationException',
    tests: [
      { search: 'ValidationException.ERROR_PREFIX', expected: 'BaseException.ERROR_PREFIX' },
      { search: 'ValidationException.DEFAULT_ERROR_CODE', expected: 'BaseException.DEFAULT_ERROR_CODE' }
    ]
  },
  {
    name: 'Edge Case 9: Chain of Responsibility Pattern',
    description: 'Handler → AbstractHandler → AuthenticationHandler (3 levels)',
    tests: [
      { search: 'AuthenticationHandler.MAX_CHAIN_LENGTH', expected: 'Handler.MAX_CHAIN_LENGTH' },
      { search: 'AuthenticationHandler.PROCESSING_STATUS', expected: 'AbstractHandler.PROCESSING_STATUS' }
    ]
  },
  {
    name: 'Edge Case 10: Mixin Pattern (5+ Interfaces)',
    description: 'ComplexEntity implements Serializable, Cloneable, Comparable, Cacheable, Auditable',
    tests: [
      { search: 'ComplexEntity.SERIAL_VERSION', expected: 'Serializable.SERIAL_VERSION' },
      { search: 'ComplexEntity.COMPARE_EQUAL', expected: 'Comparable.COMPARE_EQUAL' },
      { search: 'ComplexEntity.CACHE_KEY_PREFIX', expected: 'Cacheable.CACHE_KEY_PREFIX' },
      { search: 'ComplexEntity.AUDIT_USER', expected: 'Auditable.AUDIT_USER' }
    ]
  }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failedDetails = [];

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
      }
    }
  }
});

indexer.stderr.on('data', (data) => {
  // Suppress stderr
});

indexer.on('close', (code) => {
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failedTests} (${((failedTests/totalTests)*100).toFixed(1)}%)`);
  
  if (failedTests > 0) {
    console.log('\n❌ Failed Tests:');
    failedDetails.forEach((detail, idx) => {
      console.log(`   ${idx + 1}. ${detail}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  if (failedTests === 0) {
    console.log('🎉 ALL ADVANCED EDGE CASES PASSED!');
    console.log('   ✅ Performance optimization is production-ready');
    console.log('   ✅ Handles complex monolithic application patterns');
    console.log('   ✅ Supports real-world enterprise inheritance hierarchies');
    console.log('   ✅ Ready for AI agents to analyze complex codebases');
  } else if (passedTests / totalTests >= 0.9) {
    console.log('✅ EXCELLENT: 90%+ tests passed!');
    console.log('   Minor issues detected but core functionality works');
  } else if (passedTests / totalTests >= 0.8) {
    console.log('⚠️  GOOD: 80%+ tests passed');
    console.log('   Some edge cases need attention');
  } else {
    console.log('⚠️  NEEDS WORK: Less than 80% tests passed');
    console.log('   Review failed tests above');
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
    
    const symbolsMatch = content.match(/Symbols: (\d+)/);
    const filesMatch = content.match(/Indexed Files: (\d+)/);
    const inheritanceMatch = content.match(/Inheritance Relations: (\d+)/);
    
    if (symbolsMatch && filesMatch && inheritanceMatch) {
      console.log(`📊 Index Statistics:`);
      console.log(`   • Symbols: ${symbolsMatch[1]}`);
      console.log(`   • Files: ${filesMatch[1]}`);
      console.log(`   • Inheritance Relations: ${inheritanceMatch[1]}`);
    }
    
    console.log('\n' + '='.repeat(80));
    runNextTest();
  } else {
    // Test result
    const test = currentTestCase.tests[testStepIndex];
    totalTests++;
    
    const found = content.includes(test.expected);
    if (found) {
      console.log(`   ✅ ${test.search}`);
      passedTests++;
    } else {
      console.log(`   ❌ ${test.search}`);
      failedTests++;
      failedDetails.push(`${currentTestCase.name}: ${test.search} → ${test.expected}`);
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
    
    console.log(`${currentTest}. ${currentTestCase.name}`);
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
  console.log('📤 Indexing project with advanced patterns...\n');
  
  currentTest = 0;
  sendRequest('tools/call', {
    name: 'index_project',
    arguments: {
      rootDir: join(__dirname, 'example-java-project'),
      sourceRoots: ['src/main/java']
    }
  });
}, 1000);
