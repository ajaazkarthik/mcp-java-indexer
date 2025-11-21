import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const findSymbolTool: Tool = {
  name: 'find_symbol',
  description: 'Find symbol definition by name or fully qualified name (FQN). Returns file location, line, column, and stub information.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Symbol name or fully qualified name (FQN) to search for. Supports partial matching.'
      }
    },
    required: ['name']
  }
};

export async function handleFindSymbol(
  args: any,
  memoryIndex: MemoryIndex
) {
  const name = args.name as string;

  try {
    const symbols = memoryIndex.findSymbols(name);

    if (symbols.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No symbols found matching: ${name}`
        }]
      };
    }

    // Format results
    const results = symbols.map(symbol => {
      let details = `**${symbol.kind}**: \`${symbol.fqn}\`
📁 File: ${symbol.file}:${symbol.line}:${symbol.column}
📦 Package: ${symbol.packageName}`;

      if (symbol.modifiers && symbol.modifiers.length > 0) {
        details += `\n🔧 Modifiers: ${symbol.modifiers.join(', ')}`;
      }

      if (symbol.signature) {
        details += `\n✍️ Signature: ${symbol.signature}`;
      }

      if (symbol.extends) {
        details += `\n⬆️ Extends: ${symbol.extends}`;
      }

      if (symbol.implements && symbol.implements.length > 0) {
        details += `\n🔌 Implements: ${symbol.implements.join(', ')}`;
      }

      if (symbol.declaringClass) {
        details += `\n🏠 Declaring Class: ${symbol.declaringClass}`;
      }

      return details;
    });

    const text = `Found ${symbols.length} symbol${symbols.length > 1 ? 's' : ''} matching "${name}":

${results.join('\n\n---\n\n')}`;

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
        text: `Failed to find symbol: ${errorMessage}`
      }],
      isError: true
    };
  }
}
