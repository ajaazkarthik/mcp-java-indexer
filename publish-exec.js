const { execSync } = require('child_process');
const path = require('path');

const PAT = '3ngfyUwFESpmIRz2BypX0WDkiIaZwfeIhQ4ZmPTVG1ICckg2AOuAJQQJ99BKACAAAAAAAAAAAAASAZDO1VK4';

console.log('🚀 Publishing java-indexer-mcp v1.2.0 to VS Code Marketplace...\n');

try {
  // Add Node.js to PATH and run vsce publish
  const nodejsPath = 'C:\\Program Files\\nodejs';
  const newPath = `${nodejsPath};${process.env.PATH}`;
  
  const vsceModule = path.join(__dirname, 'node_modules', '@vscode', 'vsce', 'vsce');
  
  console.log('Running vsce publish...');
  
  const result = execSync(
    `node "${vsceModule}" publish --pat "${PAT}" --no-dependencies`,
    {
      cwd: process.cwd(),
      env: { ...process.env, PATH: newPath },
      stdio: 'inherit'
    }
  );
  
  console.log('\n✅ Successfully published v1.2.0 to VS Code Marketplace!');
  console.log('\n📊 Extension details:');
  console.log('   URL: https://marketplace.visualstudio.com/items?itemName=ubanishathanvenkatesan.java-indexer-mcp');
  console.log('   Management: https://marketplace.visualstudio.com/manage/publishers/ubanishathanvenkatesan');
  
} catch (e) {
  console.error('\n❌ Publish failed:', e.message);
  if (e.stdout) console.error('STDOUT:', e.stdout.toString());
  if (e.stderr) console.error('STDERR:', e.stderr.toString());
  process.exit(1);
}
