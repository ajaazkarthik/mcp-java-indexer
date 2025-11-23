import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const callGraphTool: Tool = {
  name: 'call_graph',
  description: 'Get call graph for a method: inbound calls (who calls this) and outbound calls (what this calls). Supports polymorphism resolution.',
  inputSchema: {
    type: 'object',
    properties: {
      fqn: {
        type: 'string',
        description: 'Fully qualified name (FQN) of the method to analyze'
      }
    },
    required: ['fqn']
  }
};

export async function handleCallGraph(
  args: any,
  memoryIndex: MemoryIndex
) {
  const fqn = args.fqn as string;

  try {
    // Try to find symbol - first exact match, then fuzzy match for methods
    let symbol = memoryIndex.getSymbol(fqn);
    let actualFqn = fqn;
    
    if (!symbol) {
      // Try fuzzy matching for methods
      // User might provide: com.example.Service.method
      // But stored as: com.example.Service.method(String, Integer)
      const symbols = memoryIndex.findSymbols(fqn);
      
      // Filter to only methods/constructors that match the base name
      const methodSymbols = symbols.filter(s => 
        (s.kind === 'method' || s.kind === 'constructor') && 
        s.fqn.startsWith(fqn + '(')
      );
      
      if (methodSymbols.length === 1) {
        // Found exactly one matching method
        symbol = methodSymbols[0];
        actualFqn = symbol.fqn;
      } else if (methodSymbols.length > 1) {
        // Multiple matches - show them to user
        const matches = methodSymbols.map(s => `  • ${s.fqn}`).join('\n');
        return {
          content: [{
            type: 'text',
            text: `Multiple methods found matching "${fqn}". Please specify with full signature:\n\n${matches}\n\nExample: ${methodSymbols[0].fqn}`
          }]
        };
      }
    }
    
    if (!symbol) {
      return {
        content: [{
          type: 'text',
          text: `Symbol not found: ${fqn}\n\nTip: Use find_symbol to search for the correct FQN.`
        }]
      };
    }

    // Get outbound and inbound calls (use actualFqn which might be resolved)
    const outbound = memoryIndex.getOutboundCalls(actualFqn);
    const inbound = memoryIndex.getInboundCalls(actualFqn);

    // Also check for polymorphic calls if this is a method in a class hierarchy
    let polymorphicInbound: typeof inbound = [];
    if (symbol.kind === 'method' && symbol.declaringClass) {
      // Check if any subclasses override this method
      const children = memoryIndex.getChildren(symbol.declaringClass);
      for (const child of children) {
        const overriddenFqn = `${child}.${symbol.name}`;
        const overriddenSymbol = memoryIndex.getSymbol(overriddenFqn);
        if (overriddenSymbol) {
          const childInbound = memoryIndex.getInboundCalls(overriddenFqn);
          polymorphicInbound.push(...childInbound);
        }
      }
    }

    // Format results
    const sections: string[] = [];

    sections.push(`# Call Graph for \`${actualFqn}\``);
    sections.push('');
    sections.push(`**Symbol**: ${symbol.kind} in ${symbol.declaringClass || symbol.packageName}`);
    sections.push(`**Location**: ${symbol.file}:${symbol.line}`);
    if (actualFqn !== fqn) {
      sections.push(`**Note**: Resolved "${fqn}" to "${actualFqn}"`);
    }

    // Outbound calls
    sections.push('');
    sections.push(`## 📤 Outbound Calls (${outbound.length})`);
    if (outbound.length === 0) {
      sections.push('_This method doesn\'t call any other methods_');
    } else {
      for (const edge of outbound) {
        sections.push(`\n### → \`${edge.callee}\``);
        sections.push(`Called from ${edge.locations.length} location${edge.locations.length > 1 ? 's' : ''}:`);
        for (const loc of edge.locations.slice(0, 5)) {
          sections.push(`  • ${loc.file}:${loc.line}:${loc.column}`);
        }
        if (edge.locations.length > 5) {
          sections.push(`  ... and ${edge.locations.length - 5} more`);
        }
      }
    }

    // Inbound calls
    sections.push('');
    sections.push(`## 📥 Inbound Calls (${inbound.length})`);
    if (inbound.length === 0) {
      sections.push('_This method is not called by any indexed methods_');
    } else {
      for (const edge of inbound) {
        sections.push(`\n### ← \`${edge.caller}\``);
        sections.push(`Calls from ${edge.locations.length} location${edge.locations.length > 1 ? 's' : ''}:`);
        for (const loc of edge.locations.slice(0, 5)) {
          sections.push(`  • ${loc.file}:${loc.line}:${loc.column}`);
        }
        if (edge.locations.length > 5) {
          sections.push(`  ... and ${edge.locations.length - 5} more`);
        }
      }
    }

    // Polymorphic inbound calls
    if (polymorphicInbound.length > 0) {
      sections.push('');
      sections.push(`## 🔀 Polymorphic Inbound Calls (${polymorphicInbound.length})`);
      sections.push('_Calls to overridden versions in subclasses_');
      
      for (const edge of polymorphicInbound.slice(0, 10)) {
        sections.push(`\n### ← \`${edge.caller}\` → \`${edge.callee}\``);
        sections.push(`  • ${edge.locations[0].file}:${edge.locations[0].line}:${edge.locations[0].column}`);
      }
      if (polymorphicInbound.length > 10) {
        sections.push(`\n... and ${polymorphicInbound.length - 10} more polymorphic calls`);
      }
    }

    // Summary
    sections.push('');
    sections.push('---');
    sections.push(`**Total**: ${outbound.length} outbound, ${inbound.length} inbound${polymorphicInbound.length > 0 ? `, ${polymorphicInbound.length} polymorphic` : ''}`);

    return {
      content: [{
        type: 'text',
        text: sections.join('\n')
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to generate call graph: ${errorMessage}`
      }],
      isError: true
    };
  }
}
