import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex, SymbolStub } from '../memory-index.js';

/**
 * explore_class - All-in-one class exploration tool for agents
 * 
 * Combines multiple queries into a single call to reduce round trips
 * and provide comprehensive class understanding.
 */
export const exploreClassTool: Tool = {
  name: 'explore_class',
  description: `Complete class analysis in one call: structure, inheritance, dependencies, and usage patterns.

**When to use**: Understanding a class before modifying it, onboarding to unfamiliar code.
**Output includes**: Symbol info, fields, methods, inheritance hierarchy, inbound/outbound calls, usages.

Example: explore_class(className: "UserService")

This is more efficient than calling find_symbol + explain_code + call_graph + find_usages separately.`,
  inputSchema: {
    type: 'object',
    properties: {
      className: {
        type: 'string',
        description: 'Class name (simple or FQN). Examples: "UserService", "com.example.UserService"'
      },
      includeMethodDetails: {
        type: 'boolean',
        description: 'Include detailed analysis of each method (default: false for performance)',
        default: false
      }
    },
    required: ['className']
  }
};

export async function handleExploreClass(
  args: any,
  memoryIndex: MemoryIndex
) {
  const className = args.className as string;
  const includeMethodDetails = args.includeMethodDetails === true;

  try {
    // Find the class - first try exact match, then partial match
    let symbols = memoryIndex.findSymbols(className);
    let classSymbols = symbols.filter(s => s.kind === 'class' || s.kind === 'interface' || s.kind === 'enum');
    
    // If no exact match, try to find class by simple name
    if (classSymbols.length === 0) {
      const allSymbols = memoryIndex.getAllSymbols();
      const simpleName = className.split('.').pop()?.toLowerCase() || className.toLowerCase();
      
      for (const [fqn, stub] of allSymbols) {
        if ((stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum') &&
            stub.name.toLowerCase() === simpleName) {
          classSymbols.push(stub);
        }
      }
    }
    
    // If we have multiple matches, prefer exact name match over partial match
    if (classSymbols.length > 1) {
      const exactMatches = classSymbols.filter(s => 
        s.name.toLowerCase() === className.toLowerCase() ||
        s.fqn.toLowerCase() === className.toLowerCase()
      );
      if (exactMatches.length > 0) {
        classSymbols = exactMatches;
      }
    }
    
    if (classSymbols.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `Class not found: "${className}"

**Suggestions:**
- Try a partial name: find_symbol(name: "${className.split('.').pop()}")
- Check if the project is indexed: Use index_project first
- Use semantic_search to find similar classes`
        }]
      };
    }

    const classSymbol = classSymbols[0];
    const fqn = classSymbol.fqn;

    // Gather all related data
    const result: string[] = [];
    result.push(`# Class Exploration: ${classSymbol.name}`);
    result.push('');

    // Basic Info
    result.push('## 📋 Overview');
    result.push(`- **Type**: ${classSymbol.kind}`);
    result.push(`- **FQN**: \`${fqn}\``);
    result.push(`- **Package**: ${classSymbol.packageName}`);
    result.push(`- **File**: ${classSymbol.file}:${classSymbol.line}`);
    if (classSymbol.modifiers?.length) {
      result.push(`- **Modifiers**: ${classSymbol.modifiers.join(', ')}`);
    }
    result.push('');

    // Inheritance
    result.push('## 🔗 Inheritance');
    if (classSymbol.extends) {
      result.push(`- **Extends**: \`${classSymbol.extends}\``);
    }
    if (classSymbol.implements?.length) {
      result.push(`- **Implements**: ${classSymbol.implements.map(i => `\`${i}\``).join(', ')}`);
    }
    
    const children = memoryIndex.getChildren(fqn);
    if (children.length > 0) {
      result.push(`- **Subclasses**: ${children.slice(0, 5).map(c => `\`${c}\``).join(', ')}${children.length > 5 ? ` ... and ${children.length - 5} more` : ''}`);
    }
    result.push('');

    // Members - Methods and Fields (find by FQN prefix since declaringClass may not be set)
    const allSymbols = memoryIndex.getAllSymbols();
    const methods: SymbolStub[] = [];
    const fields: SymbolStub[] = [];
    const constructors: SymbolStub[] = [];
    
    for (const [symbolFqn, s] of allSymbols) {
      // Check if symbol belongs to this class (FQN starts with class FQN)
      if (symbolFqn.startsWith(fqn + '.') || s.declaringClass === fqn) {
        if (s.kind === 'method') methods.push(s);
        else if (s.kind === 'field') fields.push(s);
        else if (s.kind === 'constructor') constructors.push(s);
      }
    }

    result.push('## 📦 Structure');
    result.push(`- **Fields**: ${fields.length}`);
    result.push(`- **Constructors**: ${constructors.length}`);
    result.push(`- **Methods**: ${methods.length}`);
    result.push('');

    // List key fields
    if (fields.length > 0) {
      result.push('### Fields');
      fields.slice(0, 10).forEach(f => {
        const mods = f.modifiers?.join(' ') || '';
        result.push(`- \`${mods} ${f.signature || f.name}\``);
      });
      if (fields.length > 10) result.push(`- ... and ${fields.length - 10} more`);
      result.push('');
    }

    // List methods
    if (methods.length > 0) {
      result.push('### Methods');
      methods.slice(0, 15).forEach(m => {
        const visibility = m.modifiers?.includes('public') ? '🟢' : 
                          m.modifiers?.includes('private') ? '🔴' : '🟡';
        result.push(`- ${visibility} \`${m.name}\` - ${m.signature || 'no signature'}`);
      });
      if (methods.length > 15) result.push(`- ... and ${methods.length - 15} more`);
      result.push('');
    }

    // Dependencies (who does this class depend on?)
    result.push('## 📤 Dependencies (Outbound)');
    const outboundDeps = new Set<string>();
    methods.forEach(m => {
      const calls = memoryIndex.getOutboundCalls(m.fqn);
      calls.forEach(c => {
        // Extract class from callee FQN (e.g., "com.example.UserRepo.save(User)" -> "com.example.UserRepo")
        const calleeFqn = c.callee;
        // Find the method/constructor name (last part before parenthesis or last part with dot)
        const parenIndex = calleeFqn.indexOf('(');
        const fqnWithoutParams = parenIndex > 0 ? calleeFqn.substring(0, parenIndex) : calleeFqn;
        const lastDotIndex = fqnWithoutParams.lastIndexOf('.');
        if (lastDotIndex > 0) {
          const calleeClass = fqnWithoutParams.substring(0, lastDotIndex);
          // Only add if it looks like a class FQN (has dots and doesn't equal current class)
          if (calleeClass.includes('.') && calleeClass !== fqn && !calleeClass.startsWith(fqn + '.')) {
            outboundDeps.add(calleeClass);
          }
        }
      });
    });
    
    if (outboundDeps.size > 0) {
      Array.from(outboundDeps).slice(0, 10).forEach(dep => {
        result.push(`- \`${dep}\``);
      });
      if (outboundDeps.size > 10) result.push(`- ... and ${outboundDeps.size - 10} more`);
    } else {
      result.push('- No external dependencies found');
    }
    result.push('');

    // Dependents (who depends on this class?)
    result.push('## 📥 Dependents (Inbound)');
    const usages = memoryIndex.findUsages(fqn);
    const dependentClasses = new Set<string>();
    usages.forEach(u => {
      if (u.fromFqn && !u.fromFqn.startsWith(fqn)) {
        const fromParts = u.fromFqn.split('.');
        if (fromParts.length > 1) {
          // Extract class name from method FQN
          const fromClass = fromParts.slice(0, -1).join('.');
          dependentClasses.add(fromClass);
        }
      }
    });

    if (dependentClasses.size > 0) {
      Array.from(dependentClasses).slice(0, 10).forEach(dep => {
        result.push(`- \`${dep}\``);
      });
      if (dependentClasses.size > 10) result.push(`- ... and ${dependentClasses.size - 10} more`);
    } else {
      result.push('- No dependents found (class may be unused or a leaf node)');
    }
    result.push('');

    // Quick stats
    result.push('## 📊 Quick Stats');
    result.push(`- **Total usages**: ${usages.length}`);
    result.push(`- **Unique dependents**: ${dependentClasses.size}`);
    result.push(`- **Unique dependencies**: ${outboundDeps.size}`);
    result.push('');

    // Suggested next actions
    result.push('## 💡 Suggested Next Actions');
    result.push(`- \`explain_code(fqn: "${fqn}")\` - Natural language explanation`);
    if (methods.length > 0) {
      const publicMethod = methods.find(m => m.modifiers?.includes('public'));
      if (publicMethod) {
        result.push(`- \`call_graph(fqn: "${publicMethod.fqn}")\` - Analyze key method calls`);
      }
    }
    result.push(`- \`analyze_impact(symbolFqn: "${fqn}")\` - Assess change risk`);
    result.push(`- \`refactoring_suggestions(fqn: "${fqn}")\` - Get improvement suggestions`);

    return {
      content: [{
        type: 'text',
        text: result.join('\n')
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to explore class: ${errorMessage}`
      }],
      isError: true
    };
  }
}
