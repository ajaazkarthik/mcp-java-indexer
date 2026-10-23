import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const findUsagesTool: Tool = {
  name: 'find_usages',
  description: `Find all places where a symbol is referenced (method calls, field access, instantiation).

**Input:** Fully Qualified Name (FQN) of a class, method, or field.

**Examples:**
- Class: "com.example.UserService"
- Method: "com.example.UserService.save(User)"  
- Field: "com.example.UserService.repository"

**Returns:** File locations grouped by file, with line numbers and reference type.

**Use cases:**
- Finding all callers before refactoring
- Understanding code dependencies
- Checking if a symbol is used before removal

**Tip:** Use find_symbol first to get the exact FQN.`,
  inputSchema: {
    type: 'object',
    properties: {
      fqn: {
        type: 'string',
        description: 'Fully Qualified Name of the symbol (e.g., "com.example.UserService.save(User)")'
      }
    },
    required: ['fqn']
  }
};

export async function handleFindUsages(
  args: any,
  memoryIndex: MemoryIndex,
  signal?: AbortSignal
) {
  if (signal?.aborted) {
    console.error('[MCP] cancelled server/src/tools/find_usages.ts');
    return {content:[{type:'text',text:'Request cancelled'}],isError:true};
  }

  // Support both 'fqn' and 'symbolFqn' for backward compatibility
  const fqn = (args.fqn || args.symbolFqn) as string;

  if (!fqn) {
    return {
      content: [{
        type: 'text',
        text: 'Error: Missing required parameter "fqn"'
      }],
      isError: true
    };
  }

  try {
    // Try exact match first
    let symbol = memoryIndex.getSymbol(fqn);
    let resolvedFqn = fqn;
    
    // If not found, try searching for partial matches
    if (!symbol) {
      const matches = memoryIndex.findSymbols(fqn);
      
      if (matches.length === 1) {
        symbol = matches[0];
        resolvedFqn = symbol.fqn;
      } else if (matches.length > 1) {
        // Multiple matches - show options
        const list = matches.map((s, i) => 
          `${i + 1}. ${s.kind}: \`${s.fqn}\` in ${s.file}:${s.line}`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `Multiple symbols match "${fqn}". Please specify the full FQN:

${list}

Use the exact FQN to find usages.`
          }]
        };
      }
      // If no matches, continue anyway - symbol might be from external library
      // and we can still find usages of it
    }

    // Find all usages using the resolved FQN
    // Merge references array with call graph data for complete results
    const directReferences = memoryIndex.findUsages(resolvedFqn);
    const callGraphRefs = memoryIndex.getInboundCalls(resolvedFqn);
    
    // Convert call graph edges to Reference format
    const callGraphUsages: any[] = [];
    for (const edge of callGraphRefs) {
      for (const loc of edge.locations) {
        // Check if this location is already in directReferences to avoid duplicates
        const isDuplicate = directReferences.some(
          ref => ref.file === loc.file && ref.line === loc.line && ref.column === loc.column
        );
        if (!isDuplicate) {
          callGraphUsages.push({
            fromFqn: edge.caller,
            toFqn: resolvedFqn,
            file: loc.file,
            line: loc.line,
            column: loc.column,
            kind: 'method_call' // Call graph only tracks method calls and instantiations
          });
        }
      }
    }
    
    // Merge both sources
    const usages = [...directReferences, ...callGraphUsages];

    if (usages.length === 0) {
      // Provide helpful message
      if (!symbol) {
        return {
          content: [{
            type: 'text',
            text: `No usages found for: ${fqn}\n\nSymbol not found in index. It may not exist or may be from an external library.\n\nTip: Use find_symbol to search for similar symbols.`
          }]
        };
      }
      return {
        content: [{
          type: 'text',
          text: `No usages found for: ${resolvedFqn}`
        }]
      };
    }

    // Group by file
    const byFile = new Map<string, typeof usages>();
    for (const usage of usages) {
      if (!byFile.has(usage.file)) {
        byFile.set(usage.file, []);
      }
      byFile.get(usage.file)!.push(usage);
    }

    // Format results
    const results: string[] = [];
    for (const [file, refs] of byFile) {
      results.push(`📁 **${file}** (${refs.length} usage${refs.length > 1 ? 's' : ''})`);
      
      for (const ref of refs) {
        const kindEmoji = ref.kind === 'method_call' ? '📞' : 
                         ref.kind === 'field_access' ? '📝' :
                         ref.kind === 'instantiation' ? '🆕' :
                         ref.kind === 'inheritance' ? '⬆️' : '🔗';
        results.push(`  ${kindEmoji} Line ${ref.line}:${ref.column} - ${ref.kind} from ${ref.fromFqn}`);
      }
    }

    const text = `Found ${usages.length} usage${usages.length > 1 ? 's' : ''} of \`${resolvedFqn}\` in ${byFile.size} file${byFile.size > 1 ? 's' : ''}:

${results.join('\n')}`;

    return {
      content: [{
        type: 'text',
        text
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to find usages: ${errorMessage}`
      }],
      isError: true
    };
  }
}
