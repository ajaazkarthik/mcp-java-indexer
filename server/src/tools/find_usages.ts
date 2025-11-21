import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const findUsagesTool: Tool = {
  name: 'find_usages',
  description: 'Find all reference locations where a symbol (class, method, field) is used. Returns file locations with line and column numbers.',
  inputSchema: {
    type: 'object',
    properties: {
      fqn: {
        type: 'string',
        description: 'Fully qualified name (FQN) of the symbol to find usages for'
      }
    },
    required: ['fqn']
  }
};

export async function handleFindUsages(
  args: any,
  memoryIndex: MemoryIndex
) {
  const fqn = args.fqn as string;

  try {
    // Verify symbol exists
    const symbol = memoryIndex.getSymbol(fqn);
    if (!symbol) {
      return {
        content: [{
          type: 'text',
          text: `Symbol not found: ${fqn}\n\nTip: Use find_symbol to search for the correct FQN.`
        }]
      };
    }

    // Find all usages
    const usages = memoryIndex.findUsages(fqn);

    if (usages.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No usages found for: ${fqn}`
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

    const text = `Found ${usages.length} usage${usages.length > 1 ? 's' : ''} of \`${fqn}\` in ${byFile.size} file${byFile.size > 1 ? 's' : ''}:

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
