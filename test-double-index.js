/**
 * Test to reproduce the double-indexing issue
 * Simulates calling index_project twice to verify incremental indexing works
 */

const path = require('path');
const fs = require('fs').promises;

const { MemoryIndex } = require('./server/dist/memory-index');
const { Persistence } = require('./server/dist/persistence');
const { IndexerClient } = require('./server/dist/indexer-client');
const { glob } = require('glob');

const testProjectPath = path.join(__dirname, 'example-java-project');
const indexDir = path.join(testProjectPath, '.mcp-index');

function normalizePath(p) {
    return path.resolve(p).replace(/\\/g, '/');
}

async function simulateIndexProject(memoryIndex, indexerClient, forceFullIndex = false) {
    const startTime = Date.now();
    const rootDir = normalizePath(testProjectPath);
    const sourceRoots = ['src/main/java', 'src'];
    
    // Set index directory first
    memoryIndex.setIndexDir(testProjectPath);

    // Try to load existing index
    const persistence = new Persistence(indexDir);
    let loadedExisting = false;
    
    if (!forceFullIndex) {
        try {
            const loaded = await persistence.load(memoryIndex);
            if (loaded) {
                loadedExisting = true;
                console.log(`✅ Loaded existing index from disk`);
            }
        } catch (error) {
            console.log(`⚠️  Could not load existing index, will do full reindex: ${error}`);
        }
    }

    if (!loadedExisting) {
        memoryIndex.clear();
        memoryIndex.setIndexDir(testProjectPath);
    }

    // Find all Java files
    const pattern = path.join(rootDir, '**/*.java').replace(/\\/g, '/');
    const javaFilesRaw = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
    });
    const javaFiles = javaFilesRaw.map(normalizePath);

    console.log(`📂 Found ${javaFiles.length} Java files on disk`);

    // Convert source roots to absolute paths
    const absoluteSourceRoots = sourceRoots.map(sr => path.join(rootDir, sr).replace(/\\/g, '/'));

    // Determine which files need indexing
    let filesToIndex = [];
    
    if (loadedExisting) {
        console.log(`🔍 Checking for changes...`);
        
        let unchangedCount = 0;
        let changedCount = 0;
        
        for (const file of javaFiles) {
            const needsReindex = await memoryIndex.needsReindex(file);
            if (needsReindex) {
                filesToIndex.push(file);
                changedCount++;
                console.log(`   ⚠️  Changed/new: ${path.basename(file)}`);
            } else {
                unchangedCount++;
            }
        }
        
        // Check for deleted files
        const indexedFiles = memoryIndex.getAllFiles();
        const currentFileSet = new Set(javaFiles.map(normalizePath));
        const deletedFiles = indexedFiles.filter(f => !currentFileSet.has(normalizePath(f.path)));
        
        console.log(`\n📊 Incremental check results:`);
        console.log(`   ✅ Unchanged: ${unchangedCount}`);
        console.log(`   ⚠️  Changed/New: ${changedCount}`);
        console.log(`   🗑️  Deleted: ${deletedFiles.length}`);
        
        if (filesToIndex.length === 0 && deletedFiles.length === 0) {
            const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`\n✅ Index is up-to-date (checked in ${elapsedTime}s)`);
            return { 
                mode: 'up-to-date', 
                filesIndexed: 0, 
                duration: elapsedTime 
            };
        }
    } else {
        filesToIndex = javaFiles;
        console.log(`🔄 Full index mode: ${filesToIndex.length} files to index`);
    }

    // Actually index the files
    if (filesToIndex.length > 0) {
        console.log(`\n🔨 Indexing ${filesToIndex.length} files...`);
        
        const results = await indexerClient.indexFiles(filesToIndex, absoluteSourceRoots);
        
        let totalSymbols = 0;
        for (const result of results) {
            if (result.error) continue;
            
            // Remove old data if incremental
            if (loadedExisting) {
                memoryIndex.removeFile(result.file);
            }
            
            const symbolFqns = [];
            for (const symbol of result.symbols) {
                memoryIndex.addSymbol(symbol);
                symbolFqns.push(symbol.fqn);
                totalSymbols++;
            }
            
            for (const ref of result.references) {
                memoryIndex.addReference(ref);
            }
            
            // CRITICAL: Save hash and mtime for staleness detection
            const hash = await MemoryIndex.calculateFileHash(result.file);
            const stats = await fs.stat(result.file);
            memoryIndex.addFile(result.file, hash, symbolFqns, true, stats.mtimeMs);
        }
        
        console.log(`✅ Indexed ${totalSymbols} symbols from ${filesToIndex.length} files`);
        
        // Persist
        await persistence.save(memoryIndex);
        console.log(`💾 Index saved to disk`);
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    return { 
        mode: loadedExisting ? 'incremental' : 'full', 
        filesIndexed: filesToIndex.length, 
        duration: elapsedTime 
    };
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Testing Double Index Behavior');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const indexerClient = new IndexerClient();
    await indexerClient.start();
    
    // First call - might be full or incremental depending on state
    console.log('📌 FIRST CALL to index_project:');
    console.log('────────────────────────────────────────────────────────');
    const memoryIndex1 = new MemoryIndex();
    const result1 = await simulateIndexProject(memoryIndex1, indexerClient, false);
    console.log(`\n   Result: ${result1.mode}, ${result1.filesIndexed} files, ${result1.duration}s`);
    
    // Wait a moment to ensure filesystem timestamps are stable
    await new Promise(r => setTimeout(r, 100));
    
    // Second call - should detect everything is up-to-date
    console.log('\n\n📌 SECOND CALL to index_project (should be up-to-date):');
    console.log('────────────────────────────────────────────────────────');
    const memoryIndex2 = new MemoryIndex();
    const result2 = await simulateIndexProject(memoryIndex2, indexerClient, false);
    console.log(`\n   Result: ${result2.mode}, ${result2.filesIndexed} files, ${result2.duration}s`);
    
    // Third call with forceFullIndex
    console.log('\n\n📌 THIRD CALL with forceFullIndex=true (should rebuild):');
    console.log('────────────────────────────────────────────────────────');
    const memoryIndex3 = new MemoryIndex();
    const result3 = await simulateIndexProject(memoryIndex3, indexerClient, true);
    console.log(`\n   Result: ${result3.mode}, ${result3.filesIndexed} files, ${result3.duration}s`);
    
    // Fourth call - should again be up-to-date
    console.log('\n\n📌 FOURTH CALL (should be up-to-date after force rebuild):');
    console.log('────────────────────────────────────────────────────────');
    const memoryIndex4 = new MemoryIndex();
    const result4 = await simulateIndexProject(memoryIndex4, indexerClient, false);
    console.log(`\n   Result: ${result4.mode}, ${result4.filesIndexed} files, ${result4.duration}s`);
    
    await indexerClient.stop();
    
    // Summary
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`\n  Call 1: ${result1.mode} (${result1.filesIndexed} files)`);
    console.log(`  Call 2: ${result2.mode} (${result2.filesIndexed} files) ${result2.mode === 'up-to-date' ? '✅' : '❌ BUG'}`);
    console.log(`  Call 3: ${result3.mode} (${result3.filesIndexed} files) - forced`);
    console.log(`  Call 4: ${result4.mode} (${result4.filesIndexed} files) ${result4.mode === 'up-to-date' ? '✅' : '❌ BUG'}`);
    
    if (result2.mode !== 'up-to-date' || result4.mode !== 'up-to-date') {
        console.log('\n  ❌ BUG DETECTED: Index should be up-to-date on subsequent calls!');
    } else {
        console.log('\n  ✅ Incremental indexing working correctly!');
    }
}

main().catch(console.error);
