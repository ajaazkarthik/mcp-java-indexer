#!/usr/bin/env node

/**
 * Cross-platform build script for Java Indexer MCP Extension
 * Works on Windows, macOS, and Linux without PowerShell execution policy issues
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, cwd = process.cwd()) {
  try {
    log(`  Running: ${command}`, 'cyan');
    execSync(command, { 
      cwd, 
      stdio: 'inherit',
      shell: true 
    });
    return true;
  } catch (error) {
    log(`  ✗ Failed: ${error.message}`, 'red');
    return false;
  }
}

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    log(`  ✓ ${description} (${sizeMB} MB)`, 'green');
    return true;
  } else {
    log(`  ✗ ${description} - NOT FOUND`, 'red');
    return false;
  }
}

async function build() {
  log('\n========================================', 'bright');
  log('  Java Indexer MCP - Build Script', 'bright');
  log('========================================\n', 'bright');

  const rootDir = __dirname;
  const serverDir = path.join(rootDir, 'server');
  const javaIndexerDir = path.join(rootDir, 'java-indexer');
  
  let allSuccess = true;

  // Step 1: Compile extension TypeScript
  log('[1/4] Compiling extension TypeScript...', 'cyan');
  if (!execCommand('npx tsc -p ./tsconfig.json', rootDir)) {
    allSuccess = false;
  } else {
    checkFile(path.join(rootDir, 'dist', 'extension.js'), 'Extension compiled');
  }

  // Step 2: Install server dependencies (skip if already installed)
  log('\n[2/4] Checking server dependencies...', 'cyan');
  if (fs.existsSync(serverDir)) {
    const nodeModulesPath = path.join(serverDir, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      log('  Installing server dependencies...', 'yellow');
      if (!execCommand('npm install', serverDir)) {
        allSuccess = false;
      }
    } else {
      log('  ✓ Dependencies already installed', 'green');
    }
  }

  // Step 3: Compile server TypeScript
  log('\n[3/4] Compiling server TypeScript...', 'cyan');
  if (fs.existsSync(serverDir)) {
    if (!execCommand('npx tsc -p ./tsconfig.json', serverDir)) {
      allSuccess = false;
    } else {
      checkFile(path.join(serverDir, 'dist', 'index.js'), 'Server compiled');
    }
  }

  // Step 4: Verify Java JAR exists
  log('\n[4/4] Verifying Java indexer JAR...', 'cyan');
  const jarPath = path.join(javaIndexerDir, 'target', 'java-indexer-1.0.0.jar');
  if (!checkFile(jarPath, 'Java indexer JAR')) {
    log('\n  ⚠️  Java JAR not found. Run build.bat to build Java components.', 'yellow');
    log('     Or run: cd java-indexer && mvn clean package', 'yellow');
  }

  // Summary
  log('\n========================================', 'bright');
  if (allSuccess) {
    log('  ✓ BUILD SUCCESSFUL!', 'green');
    log('========================================\n', 'bright');
    log('Artifacts created:', 'bright');
    log('  • Extension: dist/extension.js', 'green');
    log('  • Server: server/dist/index.js', 'green');
    log('  • Java JAR: java-indexer/target/java-indexer-1.0.0.jar', 'green');
    log('\nNext steps:', 'cyan');
    log('  • Package extension: npm run package', 'cyan');
    log('  • Publish: npm run publish', 'cyan');
  } else {
    log('  ✗ BUILD FAILED', 'red');
    log('========================================\n', 'bright');
    process.exit(1);
  }
}

// Run build
build().catch(error => {
  log(`\n✗ Build error: ${error.message}`, 'red');
  process.exit(1);
});
