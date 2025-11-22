const vsce = require('@vscode/vsce');

console.log('Publishing java-indexer-mcp v1.2.0...\n');

vsce.publish({
  cwd: process.cwd(),
  pat: process.env.VSCE_PAT,
  useYarn: false,
  skipNpmCheck: true
}).then(() => {
  console.log('\n✅ Published successfully to VS Code Marketplace!');
}).catch(e => {
  console.error('\n❌ Publish failed:', e.message);
  if (e.message.includes('Personal Access Token')) {
    console.log('\n💡 Set your PAT with: $env:VSCE_PAT="your-token-here"');
  }
  process.exit(1);
});
