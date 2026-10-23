import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const gotoDefinitionTool: Tool = {
  name: 'goto_definition',
  description: 'Get the definition location for a symbol. Returns file path, line, and column number.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Symbol name or fully qualified name (FQN) to find definition for'
      },
      symbolName: {
        type: 'string',
        description: 'Alternative parameter name for symbol (for backward compatibility)'
      }
    },
    required: []
  }
};

export async function handleGotoDefinition(
  args: any,
  memoryIndex: MemoryIndex,
  signal?: AbortSignal
) {
  if (signal?.aborted) {
    console.error('[MCP] cancelled goto_definition');
    return { content: [{type:'text',text:'Request cancelled'}], isError: true };
  }

  // Accept both 'symbol' and 'symbolName' for backward compatibility
  const symbol = (args.symbol || args.symbolName) as string;
  
  if (!symbol) {
    return {
      content: [{
        type: 'text',
        text: 'Error: Missing required parameter. Please provide either "symbol" or "symbolName".'
      }],
      isError: true
    };
  }

  try {
    // Try exact match first
    let symbolStub = memoryIndex.getSymbol(symbol);

    // If not found, try searching
    if (!symbolStub) {
      const matches = memoryIndex.findSymbols(symbol);
      
      if (matches.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No definition found for: ${symbol}`
          }]
        };
      }

      if (matches.length === 1) {
        symbolStub = matches[0];
      } else {
        // Multiple matches - show all
        const list = matches.map((s, i) => 
          `${i + 1}. ${s.kind}: \`${s.fqn}\` in ${s.file}:${s.line}`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `Multiple definitions found for "${symbol}". Please specify the full FQN:

${list}

Use the exact FQN with this tool to get the specific definition.`
          }]
        };
      }
    }

    // Return definition location
    const text = `📍 Definition of \`${symbolStub.fqn}\`

**Kind**: ${symbolStub.kind}
**File**: ${symbolStub.file}
**Line**: ${symbolStub.line}
**Column**: ${symbolStub.column}
**Package**: ${symbolStub.packageName}
${symbolStub.signature ? `**Signature**: ${symbolStub.signature}` : ''}
${symbolStub.modifiers?.length ? `**Modifiers**: ${symbolStub.modifiers.join(', ')}` : ''}

🔗 Navigate to: ${symbolStub.file}:${symbolStub.line}:${symbolStub.column}`;

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
        text: `Failed to find definition: ${errorMessage}`
      }],
      isError: true
    };
  }
}
