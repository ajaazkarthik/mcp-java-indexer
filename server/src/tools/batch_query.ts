import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';
import { handleExploreClass } from './explore_class.js';

/**
 * batch_query - Execute multiple index queries in one call
 * 
 * Reduces round trips for agents that need multiple pieces of information.
 * Each query runs independently and returns results in the same order.
 */
export const batchQueryTool: Tool = {
  name: 'batch_query',
  description: `Execute multiple index queries in one call to reduce round trips.

**When to use**: When you need multiple pieces of information and the queries are independent.
**Supported operations**: find_symbol, find_usages, call_graph, explain_code

Example:
batch_query(queries: [
  { tool: "find_symbol", args: { name: "UserService" } },
  { tool: "find_usages", args: { fqn: "com.example.UserService.save(User)" } }
])

**Benefits**: 
- Single round trip for multiple queries
- Results returned in order
- Failed queries don't block others`,
  inputSchema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        description: 'Array of queries to execute',
        items: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              enum: ['find_symbol', 'find_usages', 'call_graph', 'explain_code', 'goto_definition', 'explore_class'],
              description: 'Tool to invoke'
            },
            args: {
              type: 'object',
              description: 'Arguments for the tool'
            },
            label: {
              type: 'string',
              description: 'Optional label to identify this query in results'
            }
          },
          required: ['tool', 'args']
        }
      }
    },
    required: ['queries']
  }
};

export async function handleBatchQuery(
  args: any,
  memoryIndex: MemoryIndex,
  signal?: AbortSignal
) {
  if (signal?.aborted) {
    console.error('[MCP] cancelled batch_query');
    return { content: [{type:'text',text:'Request cancelled'}], isError: true };
  }

  const queries = args.queries as Array<{
    tool: string;
    args: any;
    label?: string;
  }>;

  if (!queries || queries.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No queries provided. Please specify an array of queries.'
      }],
      isError: true
    };
  }

  if (queries.length > 10) {
    return {
      content: [{
        type: 'text',
        text: 'Too many queries (max 10). Please split into multiple batch_query calls.'
      }],
      isError: true
    };
  }

  const results: string[] = [];
  results.push(`# Batch Query Results (${queries.length} queries)`);
  results.push('');

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const label = query.label || `Query ${i + 1}`;
    results.push(`## ${label}: ${query.tool}`);
    results.push('');

    try {
      let result: string;

      switch (query.tool) {
        case 'find_symbol': {
          const name = query.args.name as string;
          if (!name) {
            result = '❌ Error: "name" parameter required';
          } else {
            const symbols = memoryIndex.findSymbols(name);
            if (symbols.length === 0) {
              result = `No symbols found matching: ${name}`;
            } else {
              result = symbols.slice(0, 5).map(s => 
                `- **${s.kind}**: \`${s.fqn}\` - ${s.file}:${s.line}`
              ).join('\n');
              if (symbols.length > 5) {
                result += `\n- ... and ${symbols.length - 5} more`;
              }
            }
          }
          break;
        }

        case 'find_usages': {
          const fqn = query.args.fqn as string;
          if (!fqn) {
            result = '❌ Error: "fqn" parameter required';
          } else {
            const usages = memoryIndex.findUsages(fqn);
            if (usages.length === 0) {
              result = `No usages found for: ${fqn}`;
            } else {
              const byFile: Record<string, number> = {};
              usages.forEach(u => {
                const file = u.file.split(/[/\\]/).pop() || u.file;
                byFile[file] = (byFile[file] || 0) + 1;
              });
              result = `**${usages.length} usages** across ${Object.keys(byFile).length} files:\n`;
              result += Object.entries(byFile).slice(0, 5).map(([f, c]) => 
                `- ${f}: ${c} usages`
              ).join('\n');
            }
          }
          break;
        }

        case 'call_graph': {
          const fqn = query.args.fqn as string;
          if (!fqn) {
            result = '❌ Error: "fqn" parameter required';
          } else {
            const outbound = memoryIndex.getOutboundCalls(fqn);
            const inbound = memoryIndex.getInboundCalls(fqn);
            result = `**Outbound**: ${outbound.length} calls\n`;
            if (outbound.length > 0) {
              result += outbound.slice(0, 3).map(e => `  → ${e.callee}`).join('\n') + '\n';
            }
            result += `**Inbound**: ${inbound.length} callers\n`;
            if (inbound.length > 0) {
              result += inbound.slice(0, 3).map(e => `  ← ${e.caller}`).join('\n');
            }
          }
          break;
        }

        case 'explain_code': {
          const fqn = query.args.fqn as string;
          if (!fqn) {
            result = '❌ Error: "fqn" parameter required';
          } else {
            const symbol = memoryIndex.getSymbol(fqn);
            if (!symbol) {
              result = `Symbol not found: ${fqn}`;
            } else {
              // Quick explanation
              result = `**${symbol.kind}**: ${symbol.name}\n`;
              result += `Location: ${symbol.file}:${symbol.line}\n`;
              if (symbol.signature) result += `Signature: ${symbol.signature}\n`;
              if (symbol.extends) result += `Extends: ${symbol.extends}\n`;
            }
          }
          break;
        }

        case 'goto_definition': {
          const symbol = query.args.symbol as string;
          if (!symbol) {
            result = '❌ Error: "symbol" parameter required';
          } else {
            const symbols = memoryIndex.findSymbols(symbol);
            if (symbols.length === 0) {
              result = `Symbol not found: ${symbol}`;
            } else {
              const s = symbols[0];
              result = `**${s.fqn}**\n`;
              result += `File: ${s.file}\n`;
              result += `Line: ${s.line}, Column: ${s.column}`;
            }
          }
          break;
        }

        case 'explore_class': {
          const className = query.args.className as string;
          if (!className) {
            result = '❌ Error: "className" parameter required';
          } else {
            const exploreResult = await handleExploreClass(
              { 
                className, 
                includeMethodDetails: query.args.includeMethodDetails || false,
                directOnly: query.args.directOnly || false
              },
              memoryIndex
            );
            result = exploreResult.content[0].text;
          }
          break;
        }

        default:
          result = `❌ Unsupported tool: ${query.tool}. Supported: find_symbol, find_usages, call_graph, explain_code, goto_definition, explore_class`;
      }

      results.push(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push(`❌ Error: ${errorMessage}`);
    }

    results.push('');
    results.push('---');
    results.push('');
  }

  return {
    content: [{
      type: 'text',
      text: results.join('\n')
    }]
  };
}
