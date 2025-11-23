/**
 * Sample symbols to check FQN format
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const indexDir = path.join(__dirname, 'large-java-project', '.mcp-index');
const chunkFile = path.join(indexDir, 'symbols_0.json.gz');

console.log('Sampling first chunk of symbols...\n');

const gzippedData = fs.readFileSync(chunkFile);
const jsonData = zlib.gunzipSync(gzippedData).toString('utf-8');
const symbolMap = JSON.parse(jsonData);
const symbols = Object.entries(symbolMap);

console.log(`Chunk contains ${symbols.length} symbols\n`);

// Find MegaApplication symbols
console.log('MegaApplication symbols:\n');
const megaAppSymbols = symbols.filter(([fqn, _]) => fqn.includes('MegaApplication'));
megaAppSymbols.forEach(([fqn, symbol]) => {
  console.log(`  ${symbol.kind}: ${fqn}`);
  if (symbol.kind === 'constructor') {
    console.log(`    signature: ${symbol.signature}`);
  }
});

console.log('\n' + '='.repeat(70));
console.log('\nPackageService005 symbols:\n');
const ps005Symbols = symbols.filter(([fqn, _]) => fqn.includes('PackageService005'));
ps005Symbols.forEach(([fqn, symbol]) => {
  console.log(`  ${symbol.kind}: ${fqn}`);
  if (symbol.signature) {
    console.log(`    signature: ${symbol.signature}`);
  }
});
