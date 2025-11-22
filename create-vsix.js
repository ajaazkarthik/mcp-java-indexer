const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('📦 Creating VSIX package for local installation...\n');

try {
  const nodejsPath = 'C:\\Program Files\\nodejs';
  const newPath = `${nodejsPath};${process.env.PATH}`;
  
  const vsceModule = path.join(__dirname, 'node_modules', '@vscode', 'vsce', 'vsce');
  
  console.log('Running vsce package...');
  
  execSync(
    `node "${vsceModule}" package --out .`,
    {
      cwd: process.cwd(),
      env: { ...process.env, PATH: newPath },
      stdio: 'inherit'
    }
  );
  
  const vsixFile = 'java-indexer-mcp-1.2.0.vsix';
  if (fs.existsSync(vsixFile)) {
    const stats = fs.statSync(vsixFile);
    console.log(`\n✅ VSIX created: ${vsixFile}`);
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('\n📥 To install:');
    console.log('   1. Press Ctrl+Shift+P');
    console.log('   2. Type "Extensions: Install from VSIX"');
    console.log(`   3. Select: ${path.join(process.cwd(), vsixFile)}`);
  }
  
} catch (e) {
  console.error('\n❌ Package failed:', e.message);
  process.exit(1);
}
