/**
 * Inspect raw index data to see what references exist
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'large-java-project', '.mcp-index', 'index.json');

console.log('Reading index from:', indexPath);
console.log('='.repeat(70));

if (!fs.existsSync(indexPath)) {
  console.error('Index file does not exist! Run indexing first.');
  process.exit(1);
}

const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

console.log('\nIndex contains:');
console.log(`  - ${Object.keys(indexData.symbols || {}).length} symbols`);
console.log(`  - ${(indexData.references || []).length} references`);
console.log(`  - ${(indexData.indexedFiles || []).length} indexed files`);

// Find references to PackageService005
console.log('\n' + '='.repeat(70));
console.log('References involving PackageService005:');
console.log('='.repeat(70));

const relevantRefs = (indexData.references || []).filter(ref =>
  ref.toFqn && (
    ref.toFqn.includes('PackageService005') ||
    ref.toFqn === 'PackageService005'
  )
);

console.log(`\nFound ${relevantRefs.length} references:\n`);

relevantRefs.forEach((ref, i) => {
  console.log(`${i + 1}. ${ref.kind}:`);
  console.log(`   From: ${ref.fromFqn}`);
  console.log(`   To: ${ref.toFqn}`);
  console.log(`   File: ${path.basename(ref.file)}:${ref.line}:${ref.column}`);
  console.log();
});

// Find references FROM MegaApplication constructor
console.log('='.repeat(70));
console.log('References FROM MegaApplication.MegaApplication():');
console.log('='.repeat(70));

const megaAppConstructorFqn = 'com.largeproj.app.MegaApplication.MegaApplication()';
const fromMegaApp = (indexData.references || []).filter(ref =>
  ref.fromFqn === megaAppConstructorFqn
);

console.log(`\nFound ${fromMegaApp.length} references:\n`);

fromMegaApp.slice(0, 20).forEach((ref, i) => {
  console.log(`${i + 1}. ${ref.kind}: ${ref.toFqn}`);
});

if (fromMegaApp.length > 20) {
  console.log(`... and ${fromMegaApp.length - 20} more`);
}

console.log('\n' + '='.repeat(70));
