/**
 * Simulate full MCP server flow - exactly as handleIndexProject does
 */

const path = require('path');
const fs = require('fs').promises;

const { MemoryIndex } = require('./server/dist/memory-index');
const { Persistence } = require('./server/dist/persistence');
const { IndexerClient } = require('./server/dist/indexer-client');
const { glob } = require('glob');

// Get project path from argument or use example
const testProjectPath = process.argv[2] 
    ? path.resolve(process.argv[2]) 
    : path.join(__dirname, 'example-java-project');

function normalizePath(p) {
    return path.resolve(p).replace(/\\/g, '/');
}

async function handleIndexProjectSimulation(args, memoryIndex, indexerClient) {
    // This simulates the EXACT logic from server/src/tools/index_project.ts
    
    const rootDir = normalizePath(args.rootDir);
    const sourceRoots = args.sourceRoots || ['src/main/java', 'src'];
    const forceFullIndex = args.forceFullIndex || false;

    const startTime = Date.now();

    // Set index directory first
    memoryIndex.setIndexDir(rootDir);
    
    console.log(`📂 Project: ${rootDir}`);
    console.log(`   Force full: ${forceFullIndex}`);
    console.log(`   Index dir: ${memoryIndex.getIndexDir()}`);

    // Try to load existing index
    const persistence = new Persistence(memoryIndex.getIndexDir());
    let loadedExisting = false;
    
    if (!forceFullIndex) {
        try {
            const loaded = await persistence.load(memoryIndex);
            if (loaded) {
                loadedExisting = true;
                const stats = memoryIndex.getStats();
                console.log(`\n✅ Loaded existing index from disk`);
                console.log(`   Symbols: ${stats.symbols}`);
                console.log(`   Files: ${stats.files}`);
            }
        } catch (error) {
            console.log(`⚠️  Could not load existing index: ${error}`);
        }
    }

    if (!loadedExisting) {
        console.log('\n🔄 No existing index or force=true, will do full index');
        memoryIndex.clear();
        memoryIndex.setIndexDir(rootDir);
    }

    // Find all Java files
    const pattern = path.join(rootDir, '**/*.java').replace(/\\/g, '/');
    const javaFilesRaw = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/build/**', '**/.mcp-index/**']
    });
    const javaFiles = javaFilesRaw.map(normalizePath);

    console.log(`\n📂 Found ${javaFiles.length} Java files on disk`);

    if (javaFiles.length === 0) {
        return { status: 'no-files', duration: Date.now() - startTime };
    }

    // Convert source roots to absolute paths
    const absoluteSourceRoots = sourceRoots.map(sr => path.join(rootDir, sr).replace(/\\/g, '/'));

    // Determine which files need indexing
    let filesToIndex = [];
    
    if (loadedExisting) {
        console.log(`\n🔍 Checking for changes...`);
        
        let unchangedCount = 0;
        let changedCount = 0;
        
        for (const file of javaFiles) {
            const needsReindex = await memoryIndex.needsReindex(file);
            if (needsReindex) {
                filesToIndex.push(file);
                changedCount++;
                if (changedCount <= 5) {
                    console.log(`   🔄 Changed: ${path.basename(file)}`);
                } else if (changedCount === 6) {
                    console.log(`   ... and more`);
                }
            } else {
                unchangedCount++;
            }
        }
        
        // Check for deleted files
        const indexedFiles = memoryIndex.getAllFiles();
        const currentFileSet = new Set(javaFiles);
        const deletedFiles = indexedFiles.filter(f => !currentFileSet.has(normalizePath(f.path)));
        
        console.log(`\n📊 Incremental check results:`);
        console.log(`   ✅ Unchanged: ${unchangedCount}`);
        console.log(`   🔄 Changed/New: ${changedCount}`);
        console.log(`   🗑️  Deleted: ${deletedFiles.length}`);
        
        if (filesToIndex.length === 0 && deletedFiles.length === 0) {
            const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`\n✅ Index is up-to-date! (${elapsedTime}s)`);
            return { 
                status: 'up-to-date', 
                duration: Date.now() - startTime,
                filesIndexed: 0 
            };
        }
    } else {
        filesToIndex = javaFiles;
        console.log(`\n🔄 Full index mode: ${filesToIndex.length} files`);
    }

    // Actually do the indexing
    console.log(`\n🔨 Indexing ${filesToIndex.length} files...`);
    
    const results = await indexerClient.indexFiles(filesToIndex, absoluteSourceRoots);
    
    let totalSymbols = 0;
    for (const result of results) {
        if (result.error) continue;
        
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
        
        const hash = await MemoryIndex.calculateFileHash(result.file);
        const stats = await fs.stat(result.file);
        memoryIndex.addFile(result.file, hash, symbolFqns, true, stats.mtimeMs);
    }
    
    console.log(`✅ Indexed ${totalSymbols} symbols`);
    
    // Save to persistence
    await persistence.save(memoryIndex);
    console.log(`💾 Saved to disk`);
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    return { 
        status: loadedExisting ? 'incremental' : 'full', 
        duration: Date.now() - startTime,
        filesIndexed: filesToIndex.length 
    };
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Full MCP Server Flow Simulation');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`\n  Testing with: ${testProjectPath}\n`);
    
    const indexerClient = new IndexerClient();
    await indexerClient.start();
    
    // Simulate 3 consecutive index_project calls (like MCP restarts)
    console.log('\n════════════════════════════════════════════════════');
    console.log('  FIRST CALL (simulating MCP server start)');
    console.log('════════════════════════════════════════════════════\n');
    
    const memoryIndex1 = new MemoryIndex();
    const result1 = await handleIndexProjectSimulation(
        { rootDir: testProjectPath }, 
        memoryIndex1, 
        indexerClient
    );
    
    // Simulate MCP server restart (new MemoryIndex instance)
    console.log('\n\n════════════════════════════════════════════════════');
    console.log('  SECOND CALL (simulating MCP restart)');
    console.log('════════════════════════════════════════════════════\n');
    
    const memoryIndex2 = new MemoryIndex();
    const result2 = await handleIndexProjectSimulation(
        { rootDir: testProjectPath }, 
        memoryIndex2, 
        indexerClient
    );
    
    // Third call
    console.log('\n\n════════════════════════════════════════════════════');
    console.log('  THIRD CALL (another restart)');
    console.log('════════════════════════════════════════════════════\n');
    
    const memoryIndex3 = new MemoryIndex();
    const result3 = await handleIndexProjectSimulation(
        { rootDir: testProjectPath }, 
        memoryIndex3, 
        indexerClient
    );
    
    await indexerClient.stop();
    
    // Summary
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log(`  Call 1: ${result1.status} (${result1.filesIndexed} files, ${(result1.duration/1000).toFixed(2)}s)`);
    console.log(`  Call 2: ${result2.status} (${result2.filesIndexed} files, ${(result2.duration/1000).toFixed(2)}s)`);
    console.log(`  Call 3: ${result3.status} (${result3.filesIndexed} files, ${(result3.duration/1000).toFixed(2)}s)`);
    
    if (result2.status === 'up-to-date' && result3.status === 'up-to-date') {
        console.log('\n  ✅ Incremental indexing is working correctly!');
        console.log('  ✅ Subsequent calls detect unchanged files without reindexing.');
    } else {
        console.log('\n  ❌ BUG: Files being reindexed when they shouldn\'t be!');
    }
}

main().catch(console.error);
