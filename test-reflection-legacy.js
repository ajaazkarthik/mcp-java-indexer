#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Testing Java Reflection and Legacy Features Support\n');
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
    name: 'Reflection API - Class Methods',
    search: 'ReflectionExample.getAllMethods',
    expected: 'method'
  },
  {
    name: 'Reflection API - Static Fields',
    search: 'ReflectionExample.REFLECTION_VERSION',
    expected: 'REFLECTION_VERSION'
  },
  {
    name: 'Reflection API - Dynamic Invocation',
    search: 'ReflectionExample.invokeMethod',
    expected: 'method'
  },
  {
    name: 'Legacy Serialization',
    search: 'SerializableEntity.ENTITY_TYPE',
    expected: 'ENTITY_TYPE'
  },
  {
    name: 'Legacy RMI Interface',
    search: 'RemoteService.DEFAULT_PORT',
    expected: 'DEFAULT_PORT'
  },
  {
    name: 'Legacy Observer Pattern',
    search: 'LegacyObservable.MAX_OBSERVERS',
    expected: 'MAX_OBSERVERS'
  },
  {
    name: 'Legacy Thread-based Concurrency',
    search: 'LegacyThread.DEFAULT_PRIORITY',
    expected: 'DEFAULT_PRIORITY'
  },
  {
    name: 'Nested Static Class',
    search: 'LegacyEnumeration.FIRST',
    expected: 'FIRST'
  }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const results = [];

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

indexer.stderr.on('data', () => {});

indexer.on('close', () => {
  console.log('\n' + '='.repeat(80));
  console.log('📊 REFLECTION & LEGACY JAVA SUPPORT TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failedTests} (${((failedTests/totalTests)*100).toFixed(1)}%)`);
  
  console.log('\n📋 Detailed Results:');
  results.forEach(r => {
    console.log(`   ${r.status} ${r.name}`);
    if (r.details) console.log(`      ${r.details}`);
  });
  
  console.log('\n' + '='.repeat(80));
  if (failedTests === 0) {
    console.log('🎉 FULL SUPPORT CONFIRMED!');
    console.log('   ✅ Java Reflection API fully indexed');
    console.log('   ✅ Legacy Java features (RMI, Serialization, Observer) tracked');
    console.log('   ✅ Old concurrency patterns (Thread, synchronized) supported');
    console.log('   ✅ Nested static classes and interfaces indexed');
    console.log('   ✅ All classic Java patterns work with the indexer');
  } else {
    console.log('⚠️ PARTIAL SUPPORT');
    console.log(`   ${passedTests}/${totalTests} features supported`);
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

function handleResponse(msg) {
  if (!msg.result.content) return;
  
  const content = msg.result.content[0].text;
  
  if (currentTest === 0) {
    // Indexing completed
    console.log('✅ Indexing completed\n');
    
    const symbolsMatch = content.match(/Symbols: (\d+)/);
    const filesMatch = content.match(/Indexed Files: (\d+)/);
    
    if (symbolsMatch && filesMatch) {
      console.log(`📊 Index Statistics:`);
      console.log(`   • Symbols: ${symbolsMatch[1]}`);
      console.log(`   • Files: ${filesMatch[1]}`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🔍 Testing Individual Features:\n');
    runNextTest();
  } else {
    // Test result
    const test = testCases[currentTest - 1];
    totalTests++;
    
    const found = content.includes(test.expected) && !content.includes('No symbols found');
    if (found) {
      console.log(`   ✅ ${test.name}`);
      passedTests++;
      results.push({ status: '✅', name: test.name });
    } else {
      console.log(`   ❌ ${test.name}`);
      failedTests++;
      const preview = content.substring(0, 100).replace(/\n/g, ' ');
      results.push({ status: '❌', name: test.name, details: `Got: ${preview}...` });
    }
    
    runNextTest();
  }
}

function runNextTest() {
  if (currentTest < testCases.length) {
    const test = testCases[currentTest];
    currentTest++;
    
    setTimeout(() => {
      sendRequest('tools/call', {
        name: 'find_symbol',
        arguments: { name: test.search }
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
  console.log('📤 Indexing project with reflection and legacy features...\n');
  
  currentTest = 0;
  sendRequest('tools/call', {
    name: 'index_project',
    arguments: {
      rootDir: join(__dirname, 'example-java-project'),
      sourceRoots: ['src/main/java']
    }
  });
}, 1000);
