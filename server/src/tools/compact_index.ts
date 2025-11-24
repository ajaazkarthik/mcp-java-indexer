import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const compactIndexTool: Tool = {
  name: 'compact_index',
  description: 'Emergency memory optimization - removes unused dependencies, evicts LRU symbols, and runs aggressive garbage collection. Use when memory usage is high or after indexing large projects.',
  inputSchema: {
    type: 'object',
    properties: {
      emergency: {
        type: 'boolean',
        description: 'Optional: Use EMERGENCY cleanup mode (removes ALL dependency data, keeps only indexed files). Default: false'
      },
      aggressive: {
        type: 'boolean',
        description: 'Optional: Use aggressive cleanup (multiple passes, extensive GC). Default: false'
      }
    }
  }
};

export async function handleCompactIndex(
  args: any,
  memoryIndex: MemoryIndex
) {
  const emergency = (args.emergency as boolean) || false;
  const aggressive = (args.aggressive as boolean) || false;

  try {
    const beforeMem = process.memoryUsage();
    const beforeHeapMB = Math.round(beforeMem.heapUsed / 1024 / 1024);
    const beforeStats = memoryIndex.getStats();

    let mode = 'standard';
    if (emergency) {
      mode = 'EMERGENCY';
      console.error(`🚨 Starting EMERGENCY index compaction...`);
      memoryIndex.performMaintenanceCleanup();
      memoryIndex.performMaintenanceCleanup();
    } else {
      mode = aggressive ? 'AGGRESSIVE' : 'standard';
      console.error(`🔧 Starting ${mode} index compaction...`);

      // Run maintenance cleanup
      const passes = aggressive ? 3 : 1;
      for (let i = 0; i < passes; i++) {
        memoryIndex.performMaintenanceCleanup();
        
        if (global.gc) {
          const gcPasses = aggressive ? 5 : 2;
          for (let g = 0; g < gcPasses; g++) {
            global.gc();
          }
        }
        
        if (aggressive && i < passes - 1) {
          // Wait a bit between passes for GC to complete
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
    
    // Final GC burst
    if (global.gc) {
      for (let g = 0; g < 5; g++) {
        global.gc();
      }
    }

    const afterMem = process.memoryUsage();
    const afterHeapMB = Math.round(afterMem.heapUsed / 1024 / 1024);
    const afterStats = memoryIndex.getStats();

    const symbolsRemoved = beforeStats.symbols - afterStats.symbols;
    const refsRemoved = beforeStats.references - afterStats.references;
    const memFreed = beforeHeapMB - afterHeapMB;
    
    const memFreedPercent = beforeHeapMB > 0 ? ((memFreed / beforeHeapMB) * 100).toFixed(1) : '0.0';

    return {
      content: [{
        type: 'text',
        text: `✅ Index compaction complete (${mode} mode)

📊 Results:
  • Symbols: ${beforeStats.symbols.toLocaleString()} → ${afterStats.symbols.toLocaleString()} (-${symbolsRemoved.toLocaleString()})
  • References: ${beforeStats.references.toLocaleString()} → ${afterStats.references.toLocaleString()} (-${refsRemoved.toLocaleString()})
  • Memory: ${beforeHeapMB}MB → ${afterHeapMB}MB (freed ${memFreed}MB, -${memFreedPercent}%)
  • Heap Total: ${Math.round(afterMem.heapTotal / 1024 / 1024)}MB
  • RSS: ${Math.round(afterMem.rss / 1024 / 1024)}MB

${emergency ? '⚠️  Emergency mode removed ALL dependency data. Some features may be limited until next index.' : ''}
${afterHeapMB > 1500 ? '⚠️  Memory still high. Consider:\n  • Use emergency=true for maximum cleanup\n  • Increase heap: --max-old-space-size=8192\n  • Reduce project scope or split indexing' : ''}
${memFreed < 50 && !emergency ? '💡 Tip: Try aggressive=true or emergency=true for more aggressive cleanup' : ''}`
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
