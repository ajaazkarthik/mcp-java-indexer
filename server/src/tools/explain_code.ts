import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const explainCodeTool: Tool = {
  name: 'explain_code',
  description: 'Generate natural language explanation of a class or method. Analyzes purpose, parameters, return values, side effects, dependencies, and design patterns used.',
  inputSchema: {
    type: 'object',
    properties: {
      symbolFqn: {
        type: 'string',
        description: 'Fully qualified name of the class or method to explain'
      },
      verbosity: {
        type: 'string',
        enum: ['brief', 'detailed', 'comprehensive'],
        description: 'Level of detail (brief: 2-3 sentences, detailed: paragraph, comprehensive: full analysis)',
        default: 'detailed'
      }
    },
    required: ['symbolFqn']
  }
};

export async function handleExplainCode(
  args: any,
  memoryIndex: MemoryIndex
) {
  const symbolFqn = args.symbolFqn as string;
  const verbosity = (args.verbosity as string) || 'detailed';

  try {
    const symbol = memoryIndex.getSymbol(symbolFqn);
    if (!symbol) {
      return {
        content: [{
          type: 'text',
          text: `Symbol not found: ${symbolFqn}\n\nTry using find_symbol first to get the exact FQN.`
        }]
      };
    }

    let explanation = `# Code Explanation: ${symbol.name}\n\n`;
    
    // Basic info
    explanation += `**Type**: ${symbol.kind}\n`;
    explanation += `**Package**: ${symbol.packageName}\n`;
    explanation += `**Location**: ${getFileName(symbol.file)}:${symbol.line}\n\n`;

    // Modifiers analysis
    if (symbol.modifiers && symbol.modifiers.length > 0) {
      explanation += `**Access & Modifiers**: ${symbol.modifiers.join(', ')}\n`;
      
      const isPublic = symbol.modifiers.includes('public');
      const isPrivate = symbol.modifiers.includes('private');
      const isProtected = symbol.modifiers.includes('protected');
      const isStatic = symbol.modifiers.includes('static');
      const isFinal = symbol.modifiers.includes('final');
      const isAbstract = symbol.modifiers.includes('abstract');
      
      let accessExplanation = '- ';
      if (isPublic) accessExplanation += 'Publicly accessible from anywhere. ';
      else if (isPrivate) accessExplanation += 'Private - only accessible within this class. ';
      else if (isProtected) accessExplanation += 'Protected - accessible to subclasses and same package. ';
      else accessExplanation += 'Package-private - accessible within same package. ';
      
      if (isStatic) accessExplanation += 'Static member - belongs to class, not instances. ';
      if (isFinal) accessExplanation += 'Final - cannot be overridden/changed. ';
      if (isAbstract) accessExplanation += 'Abstract - must be implemented by subclasses. ';
      
      explanation += accessExplanation + '\n\n';
    }

    // Class-specific analysis
    if (symbol.kind === 'class' || symbol.kind === 'interface') {
      explanation += `## Purpose\n\n`;
      
      const className = symbol.name;
      const purpose = inferClassPurpose(className, symbol);
      explanation += purpose + '\n\n';
      
      // Inheritance
      if (symbol.extendsClass || symbol.extends) {
        const parent = symbol.extendsClass || symbol.extends;
        explanation += `**Extends**: \`${parent}\`\n`;
        explanation += `- Inherits behavior and fields from parent class\n\n`;
      }
      
      if (symbol.implementsInterfaces || symbol.implements) {
        const interfaces = symbol.implementsInterfaces || symbol.implements || [];
        explanation += `**Implements**: ${interfaces.map(i => `\`${i}\``).join(', ')}\n`;
        explanation += `- Must provide implementations for all interface methods\n\n`;
      }
      
      // Find members
      const methods = findMembersOfClass(symbolFqn, 'method', memoryIndex);
      const fields = findMembersOfClass(symbolFqn, 'field', memoryIndex);
      const constructors = findMembersOfClass(symbolFqn, 'constructor', memoryIndex);
      
      explanation += `## Structure\n\n`;
      explanation += `- **${fields.length}** fields (data members)\n`;
      explanation += `- **${constructors.length}** constructor(s)\n`;
      explanation += `- **${methods.length}** methods\n\n`;
      
      // Public API
      const publicMethods = methods.filter(m => m.modifiers?.includes('public'));
      if (publicMethods.length > 0 && verbosity !== 'brief') {
        explanation += `## Public API\n\n`;
        publicMethods.slice(0, 10).forEach(method => {
          explanation += `- \`${method.name}\``;
          if (method.signature) {
            const returnType = method.signature.split(' ')[0];
            explanation += ` → ${returnType}`;
          }
          explanation += `\n`;
        });
        if (publicMethods.length > 10) {
          explanation += `- ... and ${publicMethods.length - 10} more\n`;
        }
        explanation += `\n`;
      }
      
      // Dependencies
      if (verbosity === 'comprehensive') {
        const usages = memoryIndex.findUsages(symbolFqn);
        const callers = memoryIndex.getInboundCalls(symbolFqn);
        
        if (usages.length > 0 || callers.length > 0) {
          explanation += `## Dependencies\n\n`;
          explanation += `- **Used by**: ${callers.length} other classes\n`;
          explanation += `- **References**: ${usages.length} total usages in codebase\n\n`;
        }
      }
    }
    
    // Method-specific analysis
    if (symbol.kind === 'method') {
      explanation += `## Purpose\n\n`;
      
      const methodPurpose = inferMethodPurpose(symbol.name, symbol);
      explanation += methodPurpose + '\n\n';
      
      // Signature breakdown
      if (symbol.signature) {
        explanation += `**Signature**: \`${symbol.signature}\`\n\n`;
        
        const parts = parseMethodSignature(symbol.signature);
        
        explanation += `### Returns\n`;
        explanation += `- **${parts.returnType}**`;
        if (parts.returnType === 'void') {
          explanation += ` - No return value (side-effects only)`;
        } else if (parts.returnType === 'boolean') {
          explanation += ` - True/false result (predicate/validator)`;
        } else if (parts.returnType.includes('List') || parts.returnType.includes('Set') || parts.returnType.includes('Collection')) {
          explanation += ` - Collection of items`;
        } else if (parts.returnType.includes('Optional')) {
          explanation += ` - May or may not contain a value`;
        }
        explanation += `\n\n`;
        
        if (parts.parameters.length > 0) {
          explanation += `### Parameters\n`;
          parts.parameters.forEach(param => {
            explanation += `- \`${param}\` - Input data for processing\n`;
          });
          explanation += `\n`;
        } else {
          explanation += `### Parameters\n`;
          explanation += `- None (no-arg method)\n\n`;
        }
        
        if (parts.exceptions.length > 0) {
          explanation += `### Exceptions\n`;
          parts.exceptions.forEach(exc => {
            explanation += `- \`${exc}\` - Thrown when operation fails\n`;
          });
          explanation += `\n`;
        }
      }
      
      // Call analysis
      if (verbosity === 'comprehensive') {
        const outboundCalls = memoryIndex.getOutboundCalls(symbolFqn);
        const inboundCalls = memoryIndex.getInboundCalls(symbolFqn);
        
        if (outboundCalls.length > 0) {
          explanation += `### Dependencies\n`;
          explanation += `This method calls:\n`;
          outboundCalls.slice(0, 5).forEach(edge => {
            const callee = memoryIndex.getSymbol(edge.callee);
            explanation += `- \`${callee?.name || edge.callee}\`\n`;
          });
          if (outboundCalls.length > 5) {
            explanation += `- ... and ${outboundCalls.length - 5} more\n`;
          }
          explanation += `\n`;
        }
        
        if (inboundCalls.length > 0) {
          explanation += `### Called By\n`;
          explanation += `${inboundCalls.length} other method(s) call this\n`;
          if (inboundCalls.length <= 3) {
            inboundCalls.forEach(edge => {
              const caller = memoryIndex.getSymbol(edge.caller);
              explanation += `- \`${caller?.name || edge.caller}\`\n`;
            });
          }
          explanation += `\n`;
        }
      }
    }
    
    // Field-specific analysis
    if (symbol.kind === 'field') {
      explanation += `## Purpose\n\n`;
      
      const fieldPurpose = inferFieldPurpose(symbol.name, symbol);
      explanation += fieldPurpose + '\n\n';
      
      if (symbol.signature) {
        explanation += `**Type**: \`${symbol.signature}\`\n\n`;
      }
      
      const isConstant = symbol.modifiers?.includes('static') && symbol.modifiers?.includes('final');
      if (isConstant) {
        explanation += `This is a **constant** - an immutable value shared across all instances.\n\n`;
      }
    }
    
    // Design patterns detection
    if (verbosity === 'comprehensive') {
      const patterns = detectDesignPatterns(symbol, memoryIndex);
      if (patterns.length > 0) {
        explanation += `## Design Patterns\n\n`;
        patterns.forEach(pattern => {
          explanation += `- **${pattern.name}**: ${pattern.description}\n`;
        });
        explanation += `\n`;
      }
    }
    
    // Best practices & recommendations
    if (verbosity === 'comprehensive') {
      explanation += `## Recommendations\n\n`;
      const recommendations = generateRecommendations(symbol, memoryIndex);
      recommendations.forEach(rec => {
        explanation += `- ${rec}\n`;
      });
    }

    return {
      content: [{
        type: 'text',
        text: explanation
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to explain code: ${errorMessage}`
      }],
      isError: true
    };
  }
}

function inferClassPurpose(name: string, symbol: any): string {
  const lower = name.toLowerCase();
  
  if (lower.includes('repository') || lower.includes('dao')) {
    return 'This is a **Repository/DAO** class - handles data persistence and database operations.';
  }
  if (lower.includes('service')) {
    return 'This is a **Service** class - contains business logic and orchestrates operations.';
  }
  if (lower.includes('controller')) {
    return 'This is a **Controller** class - handles HTTP requests and responses.';
  }
  if (lower.includes('builder')) {
    return 'This is a **Builder** class - provides fluent API for object construction.';
  }
  if (lower.includes('factory')) {
    return 'This is a **Factory** class - creates and initializes objects.';
  }
  if (lower.includes('validator')) {
    return 'This is a **Validator** class - validates data and enforces business rules.';
  }
  if (lower.includes('exception')) {
    return 'This is an **Exception** class - represents error conditions.';
  }
  if (lower.includes('util') || lower.includes('helper')) {
    return 'This is a **Utility/Helper** class - provides common helper methods.';
  }
  if (lower.includes('config')) {
    return 'This is a **Configuration** class - manages application settings.';
  }
  if (lower.includes('entity') || lower.includes('model')) {
    return 'This is an **Entity/Model** class - represents domain data.';
  }
  
  return `This ${symbol.kind} provides core functionality for ${name}.`;
}

function inferMethodPurpose(name: string, symbol: any): string {
  const lower = name.toLowerCase();
  
  if (lower.startsWith('get')) return 'Retrieves/returns a value or property.';
  if (lower.startsWith('set')) return 'Updates/sets a value or property.';
  if (lower.startsWith('is') || lower.startsWith('has')) return 'Checks a condition and returns true/false.';
  if (lower.startsWith('find') || lower.startsWith('search')) return 'Searches for and returns matching data.';
  if (lower.startsWith('save') || lower.startsWith('create')) return 'Persists new data to storage.';
  if (lower.startsWith('update')) return 'Modifies existing data.';
  if (lower.startsWith('delete') || lower.startsWith('remove')) return 'Removes data from storage.';
  if (lower.startsWith('validate')) return 'Validates data against business rules.';
  if (lower.startsWith('process') || lower.startsWith('handle')) return 'Processes input and performs operations.';
  if (lower.startsWith('calculate') || lower.startsWith('compute')) return 'Performs calculations and returns result.';
  if (lower === 'tostring') return 'Converts object to string representation.';
  if (lower === 'equals') return 'Compares this object with another for equality.';
  if (lower === 'hashcode') return 'Returns hash code for this object.';
  
  return 'Performs a specific operation or calculation.';
}

function inferFieldPurpose(name: string, symbol: any): string {
  const lower = name.toLowerCase();
  const isStatic = symbol.modifiers?.includes('static');
  const isFinal = symbol.modifiers?.includes('final');
  
  if (isStatic && isFinal) {
    if (lower.includes('version')) return 'Version identifier constant.';
    if (lower.includes('max') || lower.includes('min')) return 'Boundary/limit constant.';
    if (lower.includes('default')) return 'Default value constant.';
    return 'Constant value shared across all instances.';
  }
  
  if (lower.includes('logger') || lower.includes('log')) return 'Logger instance for this class.';
  if (lower.includes('id')) return 'Unique identifier for this entity.';
  if (lower.includes('name')) return 'Name or label field.';
  if (lower.includes('list') || lower.includes('set') || lower.includes('map')) return 'Collection of related items.';
  
  return 'Stores data for this object.';
}

function parseMethodSignature(signature: string): { returnType: string; parameters: string[]; exceptions: string[] } {
  const result = { returnType: '', parameters: [] as string[], exceptions: [] as string[] };
  
  const parts = signature.split('(');
  result.returnType = parts[0].trim().split(' ')[0];
  
  if (parts.length > 1) {
    const paramsPart = parts[1].split(')')[0];
    if (paramsPart.trim()) {
      result.parameters = paramsPart.split(',').map(p => p.trim());
    }
    
    const throwsPart = parts[1].split('throws');
    if (throwsPart.length > 1) {
      result.exceptions = throwsPart[1].trim().split(',').map(e => e.trim());
    }
  }
  
  return result;
}

function findMembersOfClass(classFqn: string, kind: string, index: MemoryIndex): any[] {
  const members: any[] = [];
  for (const [fqn, symbol] of index.getAllSymbols()) {
    if (symbol.kind === kind && symbol.declaringClass === classFqn) {
      members.push(symbol);
    }
  }
  return members;
}

function detectDesignPatterns(symbol: any, index: MemoryIndex): Array<{name: string; description: string}> {
  const patterns: Array<{name: string; description: string}> = [];
  const name = symbol.name.toLowerCase();
  
  if (name.includes('builder')) {
    patterns.push({
      name: 'Builder Pattern',
      description: 'Separates object construction from representation'
    });
  }
  if (name.includes('factory')) {
    patterns.push({
      name: 'Factory Pattern',
      description: 'Creates objects without specifying exact class'
    });
  }
  if (name.includes('singleton')) {
    patterns.push({
      name: 'Singleton Pattern',
      description: 'Ensures only one instance exists'
    });
  }
  if (name.includes('observer') || name.includes('listener')) {
    patterns.push({
      name: 'Observer Pattern',
      description: 'Notifies multiple objects of state changes'
    });
  }
  if (name.includes('adapter')) {
    patterns.push({
      name: 'Adapter Pattern',
      description: 'Converts interface to another interface'
    });
  }
  if (name.includes('decorator')) {
    patterns.push({
      name: 'Decorator Pattern',
      description: 'Adds behavior to objects dynamically'
    });
  }
  
  return patterns;
}

function generateRecommendations(symbol: any, index: MemoryIndex): string[] {
  const recommendations: string[] = [];
  
  if (symbol.kind === 'method') {
    const calls = index.getOutboundCalls(symbol.fqn);
    if (calls.length > 10) {
      recommendations.push('⚠️ High complexity - consider breaking into smaller methods');
    }
    
    if (!symbol.modifiers?.includes('public') && !symbol.modifiers?.includes('private') && !symbol.modifiers?.includes('protected')) {
      recommendations.push('💡 Add explicit access modifier for clarity');
    }
  }
  
  if (symbol.kind === 'class') {
    const methods = findMembersOfClass(symbol.fqn, 'method', index);
    if (methods.length > 20) {
      recommendations.push('⚠️ Large class - consider splitting responsibilities');
    }
    
    if (!symbol.extendsClass && !symbol.extends && !symbol.implementsInterfaces && !symbol.implements) {
      recommendations.push('💡 Consider using interfaces for better testability');
    }
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ Code looks well-structured');
  }
  
  return recommendations;
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}
