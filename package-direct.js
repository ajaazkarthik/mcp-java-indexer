#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const vsixName = `java-indexer-mcp-${version}.vsix`;

console.log(`📦 Creating VSIX: ${vsixName}`);
console.log(`   Version: ${version}`);

// Clean up old VSIX
if (fs.existsSync(vsixName)) {
  console.log(`   Removing old ${vsixName}...`);
  fs.unlinkSync(vsixName);
}

// Ensure builds are up to date
console.log('\n🔨 Building extension...');
try {
  execSync('cd server && npm run build', { stdio: 'inherit' });
  console.log('   ✅ TypeScript compiled');
} catch (e) {
  console.error('   ❌ Build failed');
  process.exit(1);
}

// Create VSIX using vsce programmatically
console.log('\n📦 Packaging VSIX...');
try {
  // Use vsce package command directly with full path to npm
  const npmPath = execSync('where npm', { encoding: 'utf8' }).trim().split('\n')[0];
  
  // Set environment variable to help vsce find npm
  process.env.npm_execpath = npmPath;
  process.env.npm_node_execpath = process.execPath;
  
  const vsce = require('@vscode/vsce');
  
  vsce.createVSIX({
    cwd: process.cwd(),
    packagePath: vsixName,
    useYarn: false,
    dependencies: true,
    skipLicense: false,
    ignoreFile: '.vscodeignore',
    gitlabBranch: undefined,
    githubBranch: undefined,
  }).then(() => {
    console.log(`\n✅ SUCCESS: ${vsixName} created!`);
    const stats = fs.statSync(vsixName);
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`\n📍 Location: ${path.resolve(vsixName)}`);
    console.log('\n🚀 Next steps:');
    console.log(`   1. Test: code --install-extension ${vsixName}`);
    console.log(`   2. Publish: vsce publish`);
  }).catch(err => {
    console.error('\n❌ Packaging failed:', err.message);
    process.exit(1);
  });
} catch (e) {
  console.error('\n❌ Error:', e.message);
  
  // Fallback: Use manual ZIP creation
  console.log('\n⚠️  Falling back to manual ZIP creation...');
  console.log('   This requires manual publishing via VS Code Marketplace web UI');
  process.exit(1);
}
