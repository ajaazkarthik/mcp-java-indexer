/**
 * Test to reproduce the full reindex issue
 * Issue: Even when no files have changed, index_project does a full reindex
 */

const path = require('path');
const fs = require('fs').promises;

// Import the modules
const { MemoryIndex } = require('./server/dist/memory-index');
const { Persistence } = require('./server/dist/persistence');

const testProjectPath = path.join(__dirname, 'example-java-project');
const indexDir = path.join(testProjectPath, '.mcp-index');

async function testNeedsReindex() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Testing needsReindex behavior');
    console.log('═══════════════════════════════════════════════════════\n');

    // Step 1: Create a fresh MemoryIndex and load from disk
    console.log('Step 1: Loading existing index from disk...');
    const memoryIndex = new MemoryIndex();
    memoryIndex.setIndexDir(testProjectPath);
    
    const persistence = new Persistence(indexDir);
    const loaded = await persistence.load(memoryIndex);
    
    if (!loaded) {
        console.log('❌ No index found - run index_project first');
        return;
    }
    
    const stats = memoryIndex.getStats();
    console.log(`✅ Loaded index: ${stats.symbols} symbols, ${stats.indexedFiles} files`);
    
    // Step 2: Get all files from the index
    const allFiles = memoryIndex.getAllFiles();
    console.log(`\nStep 2: Checking ${allFiles.length} files for changes...`);
    
    // Step 3: Check each file's needsReindex status
    let needsReindexCount = 0;
    let noChangeCount = 0;
    let errorCount = 0;
    
    // Sample a few files to debug
    const sampleSize = Math.min(10, allFiles.length);
    const sampleFiles = allFiles.slice(0, sampleSize);
    
    console.log(`\nDetailed check of first ${sampleSize} files:`);
    
    for (const fileInfo of sampleFiles) {
        try {
            const filePath = fileInfo.path;
            const storedHash = fileInfo.hash;
            const storedMtime = fileInfo.mtime;
            
            // Get current file info
            const currentStats = await fs.stat(filePath);
            const currentMtime = currentStats.mtimeMs;
            
            // Calculate current hash
            const currentHash = await MemoryIndex.calculateFileHash(filePath);
            
            // Check needsReindex
            const needsReindex = await memoryIndex.needsReindex(filePath);
            
            const hashMatch = storedHash === currentHash;
            const mtimeMatch = storedMtime === currentMtime;
            
            console.log(`\n  File: ${path.basename(filePath)}`);
            console.log(`    Stored hash: ${storedHash?.substring(0, 16)}...`);
            console.log(`    Current hash: ${currentHash.substring(0, 16)}...`);
            console.log(`    Hash match: ${hashMatch ? '✅' : '❌'}`);
            console.log(`    Stored mtime: ${storedMtime}`);
            console.log(`    Current mtime: ${currentMtime}`);
            console.log(`    Mtime match: ${mtimeMatch ? '✅' : '❌'}`);
            console.log(`    needsReindex: ${needsReindex ? '⚠️ YES' : '✅ NO'}`);
            
            if (needsReindex) {
                needsReindexCount++;
            } else {
                noChangeCount++;
            }
        } catch (error) {
            console.log(`    ❌ Error: ${error.message}`);
            errorCount++;
        }
    }
    
    // Now check ALL files
    console.log(`\n\nStep 3: Full scan of all ${allFiles.length} files...`);
    
    let totalNeedsReindex = 0;
    let totalNoChange = 0;
    let totalErrors = 0;
    
    for (const fileInfo of allFiles) {
        try {
            const needsReindex = await memoryIndex.needsReindex(fileInfo.path);
            if (needsReindex) {
                totalNeedsReindex++;
            } else {
                totalNoChange++;
            }
        } catch {
            totalErrors++;
        }
    }
    
    console.log(`\n  Results:`);
    console.log(`    ✅ No change needed: ${totalNoChange}`);
    console.log(`    ⚠️  Needs reindex: ${totalNeedsReindex}`);
    console.log(`    ❌ Errors: ${totalErrors}`);
    
    if (totalNeedsReindex > 0) {
        console.log(`\n❌ BUG CONFIRMED: ${totalNeedsReindex} files incorrectly marked for reindex!`);
    } else {
        console.log(`\n✅ All files correctly detected as unchanged.`);
    }
    
    // Step 4: Check if FileInfo is being persisted correctly
    console.log('\n\nStep 4: Checking persistence format...');
    
    try {
        const filesChunksPath = path.join(indexDir, 'files_chunks.txt');
        const chunksContent = await fs.readFile(filesChunksPath, 'utf-8');
        const totalChunks = parseInt(chunksContent, 10);
        console.log(`  Found ${totalChunks} chunks for files`);
        
        // Read first chunk to check format
        const zlib = require('zlib');
        const { promisify } = require('util');
        const gunzip = promisify(zlib.gunzip);
        
        const chunkPath = path.join(indexDir, 'files_0.json.gz');
        const compressed = await fs.readFile(chunkPath);
        const decompressed = await gunzip(compressed);
        const chunk = JSON.parse(decompressed.toString('utf-8'));
        
        console.log(`  First chunk has ${chunk.length} entries`);
        
        if (chunk.length > 0) {
            const sample = chunk[0];
            console.log(`  Sample entry format:`);
            console.log(`    Type: ${Array.isArray(sample) ? 'Array (tuple)' : typeof sample}`);
            
            if (Array.isArray(sample)) {
                console.log(`    [0] (key): ${typeof sample[0]} - ${sample[0]?.substring?.(0, 50)}...`);
                console.log(`    [1] (value): ${typeof sample[1]}`);
                if (sample[1]) {
                    console.log(`      path: ${sample[1].path?.substring?.(0, 50)}...`);
                    console.log(`      hash: ${sample[1].hash?.substring?.(0, 16)}...`);
                    console.log(`      mtime: ${sample[1].mtime}`);
                    console.log(`      lastIndexed: ${sample[1].lastIndexed}`);
                    console.log(`      symbols: ${sample[1].symbols?.length} items`);
                }
            }
        }
    } catch (error) {
        console.log(`  Error checking persistence: ${error.message}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════');
}

testNeedsReindex().catch(console.error);
