/**
 * Sample references to understand the data structure
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const indexDir = path.join(__dirname, 'large-java-project', '.mcp-index');
const chunkFile = path.join(indexDir, 'references_0.json.gz');

console.log('Sampling first chunk of references...\n');

const gzippedData = fs.readFileSync(chunkFile);
const jsonData = zlib.gunzipSync(gzippedData).toString('utf-8');
const chunk = JSON.parse(jsonData);

console.log(`Chunk contains ${chunk.length} references\n`);
console.log('First 20 references:\n');

chunk.slice(0, 20).forEach((ref, i) => {
  console.log(`${i + 1}. ${ref.kind}:`);
  console.log(`   From: ${ref.fromFqn}`);
  console.log(`   To: ${ref.toFqn}`);
  console.log(`   File: ${path.basename(ref.file)}:${ref.line}:${ref.column}`);
  console.log();
});
