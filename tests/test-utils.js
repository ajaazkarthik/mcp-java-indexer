#!/usr/bin/env node

/**
 * Test Utilities & Commands Helper
 * 
 * Provides convenient shortcuts for common testing tasks
 * Usage: node tests/test-utils.js [command]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const commands = {
  // ============================================
  // QUICK VERIFICATION
  // ============================================
  'verify': {
    description: 'Quick sanity check (5 core tests)',
    command: 'node simple-verify.js'
  },

  'verify:all': {
    description: 'Run all tests sequentially',
    command: 'node tests/test-runner.js'
  },

  'verify:parallel': {
    description: 'Run all tests in parallel',
    command: 'node tests/test-runner.js --parallel'
  },

  // ============================================
  // BY CATEGORY
  // ============================================
  'test:core': {
    description: 'Run core functionality tests',
    command: 'node tests/test-runner.js --filter=core'
  },

  'test:features': {
    description: 'Run feature-specific tests',
    command: 'node tests/test-runner.js --filter=features'
  },

  'test:regression': {
    description: 'Run regression & edge case tests',
    command: 'node tests/test-runner.js --filter=regression'
  },

  'test:performance': {
    description: 'Run performance & scalability tests',
    command: 'node tests/test-runner.js --filter=performance'
  },

  'test:storage': {
    description: 'Run storage backend tests',
    command: 'node tests/test-runner.js --filter=storage'
  },

  'test:integration': {
    description: 'Run integration tests',
    command: 'node tests/test-runner.js --filter=integration'
  },

  'test:specialized': {
    description: 'Run specialized/debugging tests',
    command: 'node tests/test-runner.js --filter=specialized'
  },

  'test:comprehensive': {
    description: 'Run comprehensive suites',
    command: 'node tests/test-runner.js --filter=comprehensive'
  },

  'test:verification': {
    description: 'Run verification tests',
    command: 'node tests/test-runner.js --filter=verification'
  },

  // ============================================
  // DEBUGGING
  // ============================================
  'debug:verbose': {
    description: 'Run all tests with verbose output',
    command: 'node tests/test-runner.js --verbose'
  },

  'debug:bail': {
    description: 'Stop on first failure',
    command: 'node tests/test-runner.js --bail'
  },

  'debug:single': {
    description: 'Run a single test file (usage: test:single test-file.js)',
    command: 'node'
  },

  // ============================================
  // REPORTING
  // ============================================
  'report:json': {
    description: 'Generate JSON test report',
    command: 'node tests/test-runner.js --json'
  },

  'report:show': {
    description: 'Display latest test report',
    command: 'cat tests/test-report.json'
  },

  // ============================================
  // UTILITIES
  // ============================================
  'list': {
    description: 'List all available tests',
    command: 'node tests/test-index.js'
  },

  'help': {
    description: 'Show this help message',
    command: 'help'
  }
};

function showHelp() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     MCP Java Indexer - Test Commands Helper            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('QUICK COMMANDS:\n');
  console.log('  npm test                       Run full test suite');
  console.log('  npm run test:quick             Quick sanity check\n');

  console.log('TEST CATEGORIES:\n');
  
  const categories = [
    'core', 'features', 'regression', 'performance',
    'storage', 'integration', 'specialized', 'comprehensive', 'verification'
  ];

  categories.forEach(cat => {
    console.log(`  npm run test:${cat.padEnd(20)} ${commands[`test:${cat}`].description}`);
  });

  console.log('\nDEBUGGING:\n');
  console.log('  npm run debug:verbose          Verbose output');
  console.log('  npm run debug:bail             Stop on first failure\n');

  console.log('REPORTING:\n');
  console.log('  npm run report:json            Generate JSON report');
  console.log('  npm run report:show            Display latest report\n');

  console.log('UTILITIES:\n');
  console.log('  npm run list                   List all test files');
  console.log('  node tests/test-runner.js --help   Runner help\n');

  console.log('ADVANCED USAGE:\n');
  console.log('  node tests/test-runner.js --filter=core --verbose');
  console.log('  node tests/test-runner.js --parallel --json');
  console.log('  node tests/test-runner.js --timeout=120000\n');
}

function runCommand(cmd, args) {
  if (cmd === 'help') {
    showHelp();
    return;
  }

  if (cmd === 'debug:single' && args.length > 0) {
    const testFile = args[0];
    console.log(`Running single test: ${testFile}\n`);
    execSync(`node ${testFile}`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    return;
  }

  if (!commands[cmd]) {
    console.error(`\n❌ Unknown command: ${cmd}`);
    console.error('Run "npm run help" for available commands\n');
    process.exit(1);
  }

  const { description, command } = commands[cmd];
  console.log(`\n📋 ${description}\n`);

  try {
    execSync(command, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
  } catch (error) {
    process.exit(1);
  }
}

// ============================================
// Package.json Integration Script
// ============================================

function generatePackageJsonScripts() {
  const scripts = {
    // Quick commands
    'test': 'node tests/test-runner.js',
    'test:quick': 'node simple-verify.js',
    'test:all': 'node tests/test-runner.js --verbose',
    'test:parallel': 'node tests/test-runner.js --parallel',
    
    // By category
    'test:core': 'node tests/test-runner.js --filter=core',
    'test:features': 'node tests/test-runner.js --filter=features',
    'test:regression': 'node tests/test-runner.js --filter=regression',
    'test:performance': 'node tests/test-runner.js --filter=performance',
    'test:storage': 'node tests/test-runner.js --filter=storage',
    'test:integration': 'node tests/test-runner.js --filter=integration',
    'test:specialized': 'node tests/test-runner.js --filter=specialized',
    'test:comprehensive': 'node tests/test-runner.js --filter=comprehensive',
    
    // Debugging
    'test:verbose': 'node tests/test-runner.js --verbose',
    'test:bail': 'node tests/test-runner.js --bail',
    
    // Reporting
    'test:json': 'node tests/test-runner.js --json',
    'test:report': 'cat tests/test-report.json',
    
    // Utilities
    'test:list': 'node tests/test-index.js',
    'test:help': 'node tests/test-utils.js help'
  };

  console.log('\nAdd these scripts to package.json:\n');
  console.log(JSON.stringify({ scripts }, null, 2));
}

// ============================================
// Main
// ============================================

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    showHelp();
  } else if (cmd === 'generate-scripts') {
    generatePackageJsonScripts();
  } else {
    runCommand(cmd, args);
  }
}

module.exports = { commands };
