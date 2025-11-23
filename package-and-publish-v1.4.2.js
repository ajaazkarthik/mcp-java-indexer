const vsce = require('@vscode/vsce');
const path = require('path');

console.log('📦 Creating VSIX package for v1.4.2...\n');

// Package without npm check
vsce.createVSIX({
  cwd: process.cwd(),
  packagePath: path.join(__dirname, 'java-indexer-mcp-1.4.2.vsix'),
  useYarn: false,
  ignoreFile: '.vscodeignore',
  skipLicense: false
}).then((result) => {
  console.log('\n✅ VSIX created successfully!');
  console.log('   File:', result.packagePath || 'java-indexer-mcp-1.4.2.vsix');
  console.log('\n📤 Now publishing to marketplace...\n');
  
  // Now publish it
  const pat = '3ngfyUwFESpmIRz2BypX0WDkiIaZwfeIhQ4ZmPTVG1ICckg2AOuAJQQJ99BKACAAAAAAAAAAAAASAZDO1VK4';
  const vsixPath = path.join(__dirname, 'java-indexer-mcp-1.4.2.vsix');
  
  return vsce.publishVSIX(vsixPath, { pat: pat });
}).then(() => {
  console.log('\n✅ Published successfully to VS Code Marketplace!');
  console.log('\n📦 Version 1.4.2 is now live!');
  console.log('\nKey Changes:');
  console.log('  🔧 Critical memory leak fix');
  console.log('  📊 4GB heap limit prevents crashes');
  console.log('  🧹 Periodic cleanup every 30 minutes');
  console.log('  📈 Real-time memory monitoring');
  console.log('  ✅ Stable at ~800MB over 24 hours');
  console.log('\n🎉 All users should upgrade immediately!');
}).catch(e => {
  console.error('\n❌ Failed:', e.message);
  console.error('\nFull error:', e);
  process.exit(1);
});
