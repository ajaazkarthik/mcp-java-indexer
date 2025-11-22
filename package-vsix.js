const fs = require('fs');
const vsce = require('@vscode/vsce');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const vsixName = `java-indexer-mcp-${pkg.version}.vsix`;

console.log(`Creating ${vsixName}...`);

vsce.createVSIX({
  cwd: process.cwd(),
  packagePath: vsixName,
  useYarn: false,
  dependencyEntryPoints: false,
  skipNpmCheck: true
}).then(() => {
  console.log(`✅ ${vsixName} created successfully`);
  fs.stat(vsixName, (err, stats) => {
    if (!err) {
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }
  });
}).catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
