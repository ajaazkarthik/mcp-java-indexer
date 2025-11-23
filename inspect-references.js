/**
 * Inspect chunked reference data
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const indexDir = path.join(__dirname, 'large-java-project', '.mcp-index');
const referencesChunksFile = path.join(indexDir, 'references_chunks.txt');

console.log('Reading chunked references...');
console.log('='.repeat(70));

if (!fs.existsSync(referencesChunksFile)) {
  console.error('References chunks file does not exist!');
  process.exit(1);
}

const chunkCount = parseInt(fs.readFileSync(referencesChunksFile, 'utf-8').trim());
console.log(`Found ${chunkCount} reference chunks\n`);

let allReferences = [];

for (let i = 0; i < chunkCount; i++) {
  const chunkFile = path.join(indexDir, `references_${i}.json.gz`);
  console.log(`Reading chunk ${i + 1}/${chunkCount}...`);
  
  const gzippedData = fs.readFileSync(chunkFile);
  const jsonData = zlib.gunzipSync(gzippedData).toString('utf-8');
  const chunk = JSON.parse(jsonData);
  
  allReferences = allReferences.concat(chunk);
}

console.log(`\nTotal references loaded: ${allReferences.length}\n`);

// Find references to PackageService005
console.log('='.repeat(70));
console.log('References involving PackageService005:');
console.log('='.repeat(70));

const relevantRefs = allReferences.filter(ref =>
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
const fromMegaApp = allReferences.filter(ref =>
  ref.fromFqn === megaAppConstructorFqn
);

console.log(`\nFound ${fromMegaApp.length} references:\n`);

fromMegaApp.slice(0, 30).forEach((ref, i) => {
  console.log(`${i + 1}. ${ref.kind}: ${ref.toFqn} (line ${ref.line})`);
});

if (fromMegaApp.length > 30) {
  console.log(`... and ${fromMegaApp.length - 30} more`);
}

console.log('\n' + '='.repeat(70));
