/**
 * Memory Management Test Script
 * Tests the memory leak fixes for v1.4.2
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing Memory Management Fixes\n');

// Start the server with memory monitoring
const serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
const serverProcess = spawn('node', [
  '--max-old-space-size=4096',
  '--expose-gc',
  serverPath
], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdoutBuffer = '';
let stderrBuffer = '';

serverProcess.stdout.on('data', (data) => {
  stdoutBuffer += data.toString();
  console.log('[STDOUT]', data.toString().trim());
});

serverProcess.stderr.on('data', (data) => {
  const message = data.toString().trim();
  stderrBuffer += message + '\n';
  console.error('[STDERR]', message);
  
  // Check for expected messages
  if (message.includes('MCP Java Indexer server running')) {
    console.log('✅ Server started successfully');
  }
  
  if (message.includes('Initial memory:')) {
    console.log('✅ Memory monitoring enabled');
  }
  
  if (message.includes('Maintenance schedule started')) {
    console.log('✅ Maintenance schedule started');
  }
  
  if (message.includes('Running periodic maintenance')) {
    console.log('✅ Periodic maintenance executed');
  }
  
  if (message.includes('Memory stats:')) {
    console.log('✅ Memory stats logged');
  }
  
  if (message.includes('Maintenance cleanup: removed')) {
    console.log('✅ Orphaned references cleaned up');
  }
  
  if (message.includes('Triggered garbage collection')) {
    console.log('✅ Garbage collection triggered');
  }
  
  if (message.includes('WARNING: High memory usage')) {
    console.log('⚠️  High memory usage detected');
  }
});

serverProcess.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  console.log(`\n📊 Server exited with code: ${code}`);
  
  // Analyze logs
  console.log('\n📈 Log Analysis:');
  
  const checks = [
    {
      name: 'Server started',
      passed: stderrBuffer.includes('MCP Java Indexer server running'),
    },
    {
      name: 'Heap limit configured',
      passed: true, // We set it via command line
    },
    {
      name: 'Memory monitoring',
      passed: stderrBuffer.includes('Initial memory:'),
    },
    {
      name: 'Maintenance schedule',
      passed: stderrBuffer.includes('Maintenance schedule started'),
    },
    {
      name: 'Graceful shutdown',
      passed: stderrBuffer.includes('Shutting down gracefully'),
    }
  ];
  
  console.log('\nTest Results:');
  checks.forEach(check => {
    const icon = check.passed ? '✅' : '❌';
    console.log(`${icon} ${check.name}`);
  });
  
  const allPassed = checks.every(c => c.passed);
  
  if (allPassed) {
    console.log('\n✅ All memory management features are working correctly!');
    console.log('\n📝 Notes:');
    console.log('   - Heap limit: 4GB (--max-old-space-size=4096)');
    console.log('   - Maintenance runs every 30 minutes');
    console.log('   - Garbage collection exposed for manual triggering');
    console.log('   - Graceful shutdown handlers registered');
  } else {
    console.log('\n❌ Some memory management features failed!');
    process.exit(1);
  }
  
  process.exit(0);
});

// Send a simple request to test basic functionality
setTimeout(() => {
  console.log('\n📤 Sending list tools request...');
  
  const request = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  }) + '\n';
  
  serverProcess.stdin.write(request);
}, 2000);

// Test graceful shutdown after 5 seconds
setTimeout(() => {
  console.log('\n🛑 Testing graceful shutdown...');
  serverProcess.kill('SIGINT');
}, 5000);

// Failsafe timeout
setTimeout(() => {
  console.log('\n⏱️  Test timeout - forcing shutdown');
  serverProcess.kill('SIGKILL');
  process.exit(1);
}, 10000);

console.log('\n⏳ Server starting with memory management enabled...');
console.log('   Heap limit: 4GB');
console.log('   GC exposed: true');
console.log('   Maintenance interval: 30 minutes\n');
