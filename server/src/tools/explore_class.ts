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

    // Inheritance - check both old and new property names for compatibility
    result.push('## 🔗 Inheritance');
    const extendsClass = classSymbol.extends || classSymbol.extendsClass;
    const implementsInterfaces = classSymbol.implements || classSymbol.implementsInterfaces;
    
    if (extendsClass) {
      result.push(`- **Extends**: \`${extendsClass}\``);
    }
    if (implementsInterfaces?.length) {
      result.push(`- **Implements**: ${implementsInterfaces.map(i => `\`${i}\``).join(', ')}`);
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
    // IMPORTANT: We must check ALL reference types, not just method calls!
    // Same-package classes may not have explicit imports but are still dependencies
    result.push('## 📤 Dependencies (Outbound)');
    const outboundDeps = new Map<string, Set<string>>(); // class -> reference kinds
    const unresolvedDeps = new Set<string>(); // Dependencies not found in index (external libraries)
    const currentPackage = classSymbol.packageName;
    
    // Helper to check if a name looks like a class name (starts with uppercase)
    // For FQNs, check the last part (class name part)
    const isClassName = (name: string): boolean => {
      if (!name || name.length === 0) return false;
      // For FQNs like com.example.MyClass, check the last part
      const lastDot = name.lastIndexOf('.');
      const className = lastDot >= 0 ? name.substring(lastDot + 1) : name;
      return className.length > 0 && className[0] === className[0].toUpperCase() && className[0] !== className[0].toLowerCase();
    };
    
    // Helper to resolve simple class name to FQN and track unresolved
    // If it's already a FQN (has dots), return as-is
    // If it's a simple name, look it up in the index
    const resolveToFqn = (name: string): { fqn: string | null; isIndexed: boolean } => {
      if (!name || name === 'String' || name === 'Object' || name === 'void') {
        return { fqn: null, isIndexed: false }; // Skip primitives and basic types
      }
      
      // Skip keywords and variable-like names
      if (name === 'this' || name === 'super' || !isClassName(name)) {
        return { fqn: null, isIndexed: false };
      }
      
      // Already qualified (has dots) - validate it exists in index
      if (name.includes('.')) {
        // Check if this FQN exists as a class in the index
        const symbol = memoryIndex.getSymbol(name);
        if (symbol && (symbol.kind === 'class' || symbol.kind === 'interface' || symbol.kind === 'enum')) {
          return { fqn: name, isIndexed: true };
        }
        // Not in index - treat as external/unresolved
        return { fqn: name, isIndexed: false };
      }
      
      // Simple name - try to resolve from indexed symbols
      // ONLY return if we find an actual match in the index
      const matches = memoryIndex.findSymbols(name).filter(s => 
        (s.kind === 'class' || s.kind === 'interface' || s.kind === 'enum') &&
        s.name === name // Exact match only
      );
      
      // Prefer same package
      const samePackageMatch = matches.find(s => s.packageName === currentPackage);
      if (samePackageMatch) {
        return { fqn: samePackageMatch.fqn, isIndexed: true };
      }
      
      // Fall back to first match
      if (matches.length > 0) {
        return { fqn: matches[0].fqn, isIndexed: true };
      }
      
      // Not found in index - could be external library
      return { fqn: null, isIndexed: false };
    };
    
    // Helper to add dependency
    const addDep = (targetClass: string | null | undefined, kind: string) => {
      if (!targetClass) return;
      
      // Resolve to FQN
      const resolved = resolveToFqn(targetClass);
      
      // Track unresolved dependencies (external libraries or missing from index)
      if (!resolved.isIndexed && targetClass.includes('.')) {
        // Only track qualified names that look like real class references
        if (!targetClass.startsWith('java.') && !targetClass.startsWith('javax.') && 
            !targetClass.startsWith('org.w3c.') && !targetClass.startsWith('org.xml.')) {
          unresolvedDeps.add(targetClass);
        }
      }
      
      if (!resolved.fqn) return;
      
      const resolvedFqn = resolved.fqn;
      
      // Skip self-references and inner class references
      if (resolvedFqn === fqn || resolvedFqn.startsWith(fqn + '.') || resolvedFqn.startsWith(fqn + '$')) {
        return;
      }
      // Skip java.lang classes
      if (resolvedFqn.startsWith('java.lang.')) {
        return;
      }
      
      // Only add if it's actually indexed
      if (resolved.isIndexed) {
        if (!outboundDeps.has(resolvedFqn)) {
          outboundDeps.set(resolvedFqn, new Set());
        }
        outboundDeps.get(resolvedFqn)!.add(kind);
      }
    };
    
    // 1. Check method calls from call graph
    methods.forEach(m => {
      const calls = memoryIndex.getOutboundCalls(m.fqn);
      calls.forEach(c => {
        const calleeFqn = c.callee;
        const parenIndex = calleeFqn.indexOf('(');
        const fqnWithoutParams = parenIndex > 0 ? calleeFqn.substring(0, parenIndex) : calleeFqn;
        const lastDotIndex = fqnWithoutParams.lastIndexOf('.');
        if (lastDotIndex > 0) {
          const calleeClass = fqnWithoutParams.substring(0, lastDotIndex);
          addDep(calleeClass, 'method_call');
        }
      });
    });
    
    // 2. Check ALL references from this class's file for type_reference, instantiation, field_access
    // This captures same-package dependencies that don't require imports
    const allRefs = memoryIndex.findReferencesFromClass(fqn);
    allRefs.forEach(ref => {
      let targetClass = ref.toFqn;
      
      // For method_call and field_access, extract the class part
      if (ref.kind === 'method_call' || ref.kind === 'field_access') {
        const parenIndex = targetClass.indexOf('(');
        const fqnWithoutParams = parenIndex > 0 ? targetClass.substring(0, parenIndex) : targetClass;
        const lastDotIndex = fqnWithoutParams.lastIndexOf('.');
        if (lastDotIndex > 0) {
          targetClass = fqnWithoutParams.substring(0, lastDotIndex);
        } else {
          // No dot means it's a call like `doSomething()` on `this` - skip
          return;
        }
      }
      
      // Add the dependency - addDep will resolve simple names to FQN
      addDep(targetClass, ref.kind);
    });
    
    // Show indexed dependencies
    result.push('### Indexed (in project)');
    if (outboundDeps.size > 0) {
      const sortedDeps = Array.from(outboundDeps.entries())
        .sort((a, b) => b[1].size - a[1].size); // Sort by number of reference types
      
      sortedDeps.slice(0, 15).forEach(([dep, kinds]) => {
        const kindList = Array.from(kinds).join(', ');
        result.push(`- \`${dep}\` (${kindList})`);
      });
      if (sortedDeps.length > 15) result.push(`- ... and ${sortedDeps.length - 15} more`);
    } else {
      result.push('- No indexed dependencies found');
    }
    
    // Show unresolved dependencies (external libraries or missing from index)
    if (unresolvedDeps.size > 0) {
      result.push('');
      result.push('### ⚠️ External/Unresolved (not in index)');
      result.push('> These dependencies are referenced but NOT in the index. They may be:');
      result.push('> - External libraries (verify in Maven/Gradle dependencies)');
      result.push('> - Classes from a different Maven module (index that module too)');
      result.push('> - Or the index may be stale - run `index_project` to refresh');
      result.push('');
      const sortedUnresolved = Array.from(unresolvedDeps).sort();
      sortedUnresolved.slice(0, 10).forEach(dep => {
        result.push(`- \`${dep}\``);
      });
      if (sortedUnresolved.length > 10) result.push(`- ... and ${sortedUnresolved.length - 10} more`);
    }
    result.push('');

    // Dependents (who depends on this class?)
    result.push('## 📥 Dependents (Inbound)');
    const usages = memoryIndex.findUsages(fqn);
    const dependentClasses = new Set<string>();
    usages.forEach(u => {
      if (u.fromFqn && typeof u.fromFqn === 'string' && !u.fromFqn.startsWith(fqn)) {
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
    if (unresolvedDeps.size > 0) {
      result.push(`- **⚠️ Unresolved dependencies**: ${unresolvedDeps.size} (external or not indexed)`);
    }
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
