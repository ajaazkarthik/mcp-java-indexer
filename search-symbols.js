/**
 * Search all symbol chunks for MegaApplication and PackageService005
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const indexDir = path.join(__dirname, 'large-java-project', '.mcp-index');
const chunksFile = path.join(indexDir, 'symbols_chunks.txt');
const chunkCount = parseInt(fs.readFileSync(chunksFile, 'utf-8').trim());

console.log(`Searching ${chunkCount} symbol chunks...\n`);

let megaAppSymbols = [];
let ps005Symbols = [];

for (let i = 0; i < chunkCount; i++) {
  const chunkFile = path.join(indexDir, `symbols_${i}.json.gz`);
  const gzippedData = fs.readFileSync(chunkFile);
  const jsonData = zlib.gunzipSync(gzippedData).toString('utf-8');
  const symbols = JSON.parse(jsonData); // Already an array of [fqn, symbol] pairs
  
  const megaApp = symbols.filter(([fqn, _]) => fqn.includes('MegaApplication'));
  const ps005 = symbols.filter(([fqn, _]) => fqn.includes('PackageService005'));
  
  megaAppSymbols = megaAppSymbols.concat(megaApp);
  ps005Symbols = ps005Symbols.concat(ps005);
}

console.log('MegaApplication symbols:\n');
megaAppSymbols.forEach(([fqn, symbol]) => {
  console.log(`  ${symbol.kind}: ${fqn}`);
  if (symbol.signature) {
    console.log(`    signature: ${symbol.signature}`);
  }
});

console.log('\n' + '='.repeat(70));
console.log('\nPackageService005 symbols:\n');
ps005Symbols.forEach(([fqn, symbol]) => {
  console.log(`  ${symbol.kind}: ${fqn}`);
  if (symbol.signature) {
    console.log(`    signature: ${symbol.signature}`);
  }
});
