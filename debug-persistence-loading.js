/**
 * Debug script to examine persistence loading and needsReindex behavior
 */

const path = require('path');
const fs = require('fs').promises;
const zlib = require('zlib');
const { promisify } = require('util');

const gunzip = promisify(zlib.gunzip);

const testProjectPath = path.join(__dirname, 'example-java-project');
const indexDir = path.join(testProjectPath, '.mcp-index');

function normalizePath(p) {
    return path.resolve(p).replace(/\\/g, '/');
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Persistence Loading Debug');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Step 1: Read raw persisted files data
    console.log('📂 Step 1: Reading raw persisted files data...\n');
    
    const filesGzPath = path.join(indexDir, 'files_0.json.gz');
    const compressed = await fs.readFile(filesGzPath);
    const decompressed = await gunzip(compressed);
    const filesData = JSON.parse(decompressed.toString('utf-8'));
    
    console.log(`   Found ${filesData.length} file entries in persistence\n`);
    
    // Step 2: Check format of each entry
    console.log('📋 Step 2: Checking file entry format...\n');
    
    const sampleEntry = filesData[0];
    console.log(`   Sample entry:`);
    console.log(`   - Key (index 0): ${typeof sampleEntry[0]}`);
    console.log(`   - Value (index 1): ${typeof sampleEntry[1]}`);
    console.log(`   - Key value: ${sampleEntry[0]}`);
    console.log(`   - Hash in value: ${sampleEntry[1]?.hash?.substring(0, 20)}...`);
    console.log();
    
    // Step 3: Simulate what fromJSON does
    console.log('📋 Step 3: Simulating Map construction from persistence...\n');
    
    const filesMap = new Map(filesData);
    console.log(`   Created Map with ${filesMap.size} entries`);
    
    // Step 4: Try to find a file with different path formats
    const testFile = sampleEntry[0];
    const testFileBackslash = testFile.replace(/\//g, '\\');
    
    console.log('\n📋 Step 4: Testing path lookups...\n');
    console.log(`   Original key in persistence: ${testFile}`);
    console.log(`   Windows backslash version:   ${testFileBackslash}`);
    
    const lookupForward = filesMap.get(testFile);
    const lookupBackward = filesMap.get(testFileBackslash);
    const lookupNormalized = filesMap.get(normalizePath(testFile));
    
    console.log(`\n   Lookup with forward slashes:  ${lookupForward ? '✅ Found' : '❌ Not found'}`);
    console.log(`   Lookup with backslashes:      ${lookupBackward ? '✅ Found' : '❌ Not found'}`);
    console.log(`   Lookup with normalized path:  ${lookupNormalized ? '✅ Found' : '❌ Not found'}`);
    
    // Step 5: Check what glob returns
    const { glob } = require('glob');
    console.log('\n📋 Step 5: Checking what glob returns...\n');
    
    const pattern = path.join(testProjectPath, '**/*.java').replace(/\\/g, '/');
    const javaFilesRaw = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
    });
    
    console.log(`   Glob pattern: ${pattern}`);
    console.log(`   Found ${javaFilesRaw.length} files`);
    console.log(`   Sample file from glob: ${javaFilesRaw[0]}`);
    
    // Check if glob files match persistence keys
    const normalizedGlobFiles = javaFilesRaw.map(normalizePath);
    console.log(`   After normalization: ${normalizedGlobFiles[0]}`);
    
    // Step 6: Calculate hash for first file
    const crypto = require('crypto');
    console.log('\n📋 Step 6: Hash comparison for first file...\n');
    
    const firstFile = normalizedGlobFiles[0];
    const content = await fs.readFile(firstFile, 'utf-8');
    const currentHash = crypto.createHash('sha256').update(content).digest('hex');
    
    const persistedInfo = filesMap.get(firstFile);
    console.log(`   File: ${path.basename(firstFile)}`);
    console.log(`   Current hash:   ${currentHash.substring(0, 40)}...`);
    console.log(`   Persisted hash: ${persistedInfo?.hash?.substring(0, 40) || 'NOT FOUND'}...`);
    console.log(`   Match: ${currentHash === persistedInfo?.hash ? '✅ Yes' : '❌ No'}`);
    
    // Step 7: Full simulation of index_project's incremental check
    console.log('\n📋 Step 7: Full simulation of incremental check...\n');
    
    let unchangedCount = 0;
    let changedCount = 0;
    let notFoundCount = 0;
    
    for (const file of normalizedGlobFiles) {
        const fileInfo = filesMap.get(file);
        if (!fileInfo) {
            notFoundCount++;
            console.log(`   ⚠️  Not in persistence: ${path.basename(file)}`);
            continue;
        }
        
        const fileContent = await fs.readFile(file, 'utf-8');
        const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
        
        if (fileHash === fileInfo.hash) {
            unchangedCount++;
        } else {
            changedCount++;
            console.log(`   🔄 Hash mismatch: ${path.basename(file)}`);
        }
    }
    
    console.log(`\n   Results:`);
    console.log(`   ✅ Unchanged: ${unchangedCount}`);
    console.log(`   🔄 Changed:   ${changedCount}`);
    console.log(`   ⚠️  Not found: ${notFoundCount}`);
    
    if (changedCount === 0 && notFoundCount === 0) {
        console.log('\n   ✅ INCREMENTAL SHOULD WORK - All files match!');
    } else {
        console.log('\n   ❌ ISSUE DETECTED - Some files would trigger full reindex!');
    }
}

main().catch(console.error);
