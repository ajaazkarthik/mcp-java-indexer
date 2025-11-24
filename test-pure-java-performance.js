#!/usr/bin/env node
/**
 * CRITICAL REGRESSION ANALYSIS
 * 
 * Comparing v1.5.2 (fast) vs current (slow) to find what's causing 30x slowdown
 * 
 * Key differences found:
 * 1. Batch size: 600 -> 100/300 (current)
 * 2. ReferenceExtractor: Added import resolution (resolveTypeName)
 * 3. Extra GC calls after every batch
 * 4. Maintenance cleanup calls
 * 
 * This test isolates each factor to find the real cause
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, msg) {
  console.log(`${color}${msg}${colors.reset}`);
}

async function measureJavaParserDirectly(files, sourceRoots) {
  return new Promise((resolve, reject) => {
    const jarPath = path.join(__dirname, 'java-indexer', 'target', 'java-indexer-1.0.0.jar');
    
    if (!fs.existsSync(jarPath)) {
      reject(new Error('Java indexer JAR not found. Run: cd java-indexer && mvn package'));
      return;
    }
    
    const startTime = Date.now();
    
    // Create a simple request
    const request = {
      id: 1,
      method: 'indexFiles',
      params: {
        filePaths: files,
        sourceRoots: sourceRoots
      }
    };
    
    const javaProcess = spawn('java', [
      '-Xmx1g',  // Limit memory for testing
      '-jar', jarPath
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let error = '';
    
    javaProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    javaProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    javaProcess.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      
      if (code !== 0 && code !== null) {
        log(colors.red, `Java process exited with code ${code}`);
        log(colors.red, `stderr: ${error.slice(0, 500)}`);
      }
      
      // Try to parse output
      let symbols = 0;
      let references = 0;
      
      try {
        const lines = output.trim().split('\n');
        for (const line of lines) {
          if (line.startsWith('{')) {
            const result = JSON.parse(line);
            if (result.result) {
              for (const file of result.result) {
                symbols += file.symbols?.length || 0;
                references += file.references?.length || 0;
              }
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
      
      resolve({
        elapsed,
        symbols,
        references,
        filesPerSec: (files.length / (elapsed / 1000)).toFixed(1)
      });
    });
    
    // Send request
    javaProcess.stdin.write(JSON.stringify(request) + '\n');
    javaProcess.stdin.end();
  });
}

async function testPureJavaPerformance() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PURE JAVA PARSER PERFORMANCE TEST                           ║');
  console.log('║  Testing Java parser ONLY - no TypeScript/storage overhead   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  const exampleProject = path.join(__dirname, 'example-java-project');
  const largeProject = path.join(__dirname, 'large-java-project');
  
  const glob = require('glob');
  
  // Test 1: Small project
  log(colors.cyan, '\n📊 Test 1: Small Project (example-java-project)');
  
  const smallFiles = glob.sync('**/*.java', {
    cwd: exampleProject,
    absolute: true,
    ignore: ['**/target/**', '**/build/**']
  });
  
  log(colors.blue, `   Files: ${smallFiles.length}`);
  
  const small = await measureJavaParserDirectly(smallFiles, []);
  log(colors.green, `   Time: ${small.elapsed}ms (${small.filesPerSec} files/sec)`);
  log(colors.green, `   Symbols: ${small.symbols}, References: ${small.references}`);
  
  // Test 2: Large project (first 500 files)
  if (fs.existsSync(largeProject)) {
    log(colors.cyan, '\n📊 Test 2: Large Project - First 500 files');
    
    const allLargeFiles = glob.sync('**/*.java', {
      cwd: largeProject,
      absolute: true,
      ignore: ['**/target/**', '**/build/**']
    });
    
    log(colors.blue, `   Total files: ${allLargeFiles.length}`);
    
    const batch500 = allLargeFiles.slice(0, 500);
    log(colors.blue, `   Testing with: ${batch500.length} files`);
    
    const large500 = await measureJavaParserDirectly(batch500, []);
    log(colors.green, `   Time: ${large500.elapsed}ms (${large500.filesPerSec} files/sec)`);
    log(colors.green, `   Symbols: ${large500.symbols}, References: ${large500.references}`);
    
    // Test 3: Large project (first 1000 files)
    log(colors.cyan, '\n📊 Test 3: Large Project - First 1000 files');
    
    const batch1000 = allLargeFiles.slice(0, 1000);
    log(colors.blue, `   Testing with: ${batch1000.length} files`);
    
    const large1000 = await measureJavaParserDirectly(batch1000, []);
    log(colors.green, `   Time: ${large1000.elapsed}ms (${large1000.filesPerSec} files/sec)`);
    log(colors.green, `   Symbols: ${large1000.symbols}, References: ${large1000.references}`);
    
    // Calculate extrapolation
    const estimatedTotal = (allLargeFiles.length / parseFloat(large1000.filesPerSec));
    log(colors.magenta, `\n📈 Extrapolated time for ${allLargeFiles.length} files: ${estimatedTotal.toFixed(0)}s`);
    
    // Analysis
    log(colors.cyan, '\n' + '═'.repeat(60));
    log(colors.cyan, '  ANALYSIS');
    log(colors.cyan, '═'.repeat(60));
    
    log(colors.yellow, `\n🔍 Java parser throughput: ${large1000.filesPerSec} files/sec`);
    log(colors.yellow, `   Expected time for 12k files: ${(12000 / parseFloat(large1000.filesPerSec)).toFixed(0)}s`);
    
    if (parseFloat(large1000.filesPerSec) > 100) {
      log(colors.green, `\n✅ Java parser is FAST (>100 files/sec)`);
      log(colors.green, `   Problem is NOT in Java parser`);
      log(colors.red, `   Problem must be in TypeScript/storage layer!`);
    } else if (parseFloat(large1000.filesPerSec) > 30) {
      log(colors.yellow, `\n⚠️  Java parser is MODERATE (30-100 files/sec)`);
      log(colors.yellow, `   Some slowdown may be in parser`);
    } else {
      log(colors.red, `\n❌ Java parser is SLOW (<30 files/sec)`);
      log(colors.red, `   Problem IS in Java parser!`);
    }
  }
  
  log(colors.green, '\n✅ Pure Java parser test complete');
}

testPureJavaPerformance().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
