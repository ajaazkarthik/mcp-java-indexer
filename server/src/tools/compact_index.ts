import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const compactIndexTool: Tool = {
  name: 'compact_index',
  description: 'Emergency memory optimization - removes unused dependencies, evicts LRU symbols, and runs aggressive garbage collection. Use when memory usage is high.',
  inputSchema: {
    type: 'object',
    properties: {
      aggressive: {
        type: 'boolean',
        description: 'Optional: Use maximum aggressive cleanup (triple GC, multiple passes). Default: false'
      }
    }
  }
};

export async function handleCompactIndex(
  args: any,
  memoryIndex: MemoryIndex
) {
  const aggressive = (args.aggressive as boolean) || false;

  try {
    const beforeMem = process.memoryUsage();
    const beforeHeapMB = Math.round(beforeMem.heapUsed / 1024 / 1024);
    const beforeStats = memoryIndex.getStats();

    console.error(`🔧 Starting ${aggressive ? 'AGGRESSIVE' : 'standard'} index compaction...`);

    // Run maintenance cleanup
    const passes = aggressive ? 3 : 1;
    for (let i = 0; i < passes; i++) {
      memoryIndex.performMaintenanceCleanup();
      
      if (global.gc) {
        global.gc();
        if (aggressive) {
          global.gc();
          global.gc();
        }
      }
      
      if (aggressive && i < passes - 1) {
        // Wait a bit between passes for GC to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const afterMem = process.memoryUsage();
    const afterHeapMB = Math.round(afterMem.heapUsed / 1024 / 1024);
    const afterStats = memoryIndex.getStats();

    const symbolsRemoved = beforeStats.symbols - afterStats.symbols;
    const refsRemoved = beforeStats.references - afterStats.references;
    const memFreed = beforeHeapMB - afterHeapMB;

    return {
      content: [{
        type: 'text',
        text: `✅ Index compaction complete

📊 Results:
  • Symbols: ${beforeStats.symbols.toLocaleString()} → ${afterStats.symbols.toLocaleString()} (-${symbolsRemoved.toLocaleString()})
  • References: ${beforeStats.references.toLocaleString()} → ${afterStats.references.toLocaleString()} (-${refsRemoved.toLocaleString()})
  • Memory: ${beforeHeapMB}MB → ${afterHeapMB}MB (freed ${memFreed}MB)
  • Heap Total: ${Math.round(afterMem.heapTotal / 1024 / 1024)}MB
  • RSS: ${Math.round(afterMem.rss / 1024 / 1024)}MB

💡 Tip: If memory is still high, consider using forceFullIndex=true to rebuild the index from scratch.`
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `❌ Compaction failed: ${errorMessage}`
      }],
      isError: true
    };
  }
}
