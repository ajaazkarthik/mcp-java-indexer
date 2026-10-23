import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const refactoringSuggestionsTool: Tool = {
  name: 'refactoring_suggestions',
  description: 'Analyze code and provide intelligent refactoring suggestions. Detects code smells, complexity issues, duplications, and suggests improvements with priority levels.',
  inputSchema: {
    type: 'object',
    properties: {
      symbolFqn: {
        type: 'string',
        description: 'Fully qualified name of the class or method to analyze'
      },
      analysisDepth: {
        type: 'string',
        enum: ['quick', 'thorough', 'comprehensive'],
        description: 'Level of analysis: quick (basic smells), thorough (includes complexity), comprehensive (full analysis)',
        default: 'thorough'
      }
    },
    required: ['symbolFqn']
  }
};

interface Suggestion {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  issue: string;
  suggestion: string;
  impact: string;
  effort: string;
}

export async function handleRefactoringSuggestions(
  args: any,
  memoryIndex: MemoryIndex,
  signal?: AbortSignal
) {
  if (signal?.aborted) {
    console.error('[MCP] cancelled refactoring_suggestions');
    return { content: [{type:'text',text:'Request cancelled'}], isError: true };
  }

  const symbolFqn = args.symbolFqn as string;
  const analysisDepth = (args.analysisDepth as string) || 'thorough';

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

    let report = `# Refactoring Suggestions: ${symbol.name}\n\n`;
    report += `**Type**: ${symbol.kind}\n`;
    report += `**Location**: ${getFileName(symbol.file)}:${symbol.line}\n`;
    report += `**Analysis Depth**: ${analysisDepth}\n\n`;

    const suggestions: Suggestion[] = [];

    // Analyze based on symbol type
    if (symbol.kind === 'class' || symbol.kind === 'interface') {
      analyzeClass(symbol, memoryIndex, suggestions, analysisDepth);
    } else if (symbol.kind === 'method') {
      analyzeMethod(symbol, memoryIndex, suggestions, analysisDepth);
    } else if (symbol.kind === 'field') {
      analyzeField(symbol, memoryIndex, suggestions, analysisDepth);
    }

    // Sort by priority
    const high = suggestions.filter(s => s.priority === 'HIGH');
    const medium = suggestions.filter(s => s.priority === 'MEDIUM');
    const low = suggestions.filter(s => s.priority === 'LOW');

    // Overall health score
    const healthScore = calculateHealthScore(suggestions);
    report += `## 🎯 Code Health Score: ${healthScore}/100\n\n`;
    
    let healthStatus = '🔴 NEEDS ATTENTION';
    if (healthScore >= 80) healthStatus = '🟢 EXCELLENT';
    else if (healthScore >= 60) healthStatus = '🟡 GOOD';
    else if (healthScore >= 40) healthStatus = '🟠 FAIR';
    
    report += `**Status**: ${healthStatus}\n`;
    report += `**Issues Found**: ${suggestions.length} (${high.length} high, ${medium.length} medium, ${low.length} low)\n\n`;

    // High priority suggestions
    if (high.length > 0) {
      report += `## 🔴 HIGH Priority (${high.length})\n\n`;
      report += `These issues should be addressed immediately:\n\n`;
      high.forEach((s, i) => {
        report += formatSuggestion(s, i + 1);
      });
    }

    // Medium priority suggestions
    if (medium.length > 0) {
      report += `## 🟡 MEDIUM Priority (${medium.length})\n\n`;
      report += `Consider addressing these in the near term:\n\n`;
      medium.forEach((s, i) => {
        report += formatSuggestion(s, i + 1);
      });
    }

    // Low priority suggestions
    if (low.length > 0) {
      report += `## 🟢 LOW Priority (${low.length})\n\n`;
      report += `Nice-to-have improvements:\n\n`;
      low.forEach((s, i) => {
        report += formatSuggestion(s, i + 1);
      });
    }

    // No issues found
    if (suggestions.length === 0) {
      report += `## ✅ No Issues Found\n\n`;
      report += `The code looks clean! Keep up the good work.\n\n`;
    }

    // Refactoring plan
    if (suggestions.length > 0) {
      report += `## 📋 Recommended Refactoring Plan\n\n`;
      const plan = generateRefactoringPlan(suggestions);
      plan.forEach((step, i) => {
        report += `${i + 1}. ${step}\n`;
      });
      report += `\n`;
    }

    return {
      content: [{
        type: 'text',
        text: report
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to generate refactoring suggestions: ${errorMessage}`
      }],
      isError: true
    };
  }
}

function analyzeClass(symbol: any, index: MemoryIndex, suggestions: Suggestion[], depth: string) {
  const className = symbol.name;
  
  // Find all methods and fields
  const methods = findMembersOfClass(symbol.fqn, 'method', index);
  const fields = findMembersOfClass(symbol.fqn, 'field', index);
  
  // God Class detection
  if (methods.length > 20) {
    suggestions.push({
      priority: 'HIGH',
      category: 'Design',
      issue: `God Class: ${methods.length} methods in single class`,
      suggestion: 'Split into smaller, focused classes using Single Responsibility Principle',
      impact: 'Improved maintainability and testability',
      effort: 'High (requires careful refactoring)'
    });
  } else if (methods.length > 15) {
    suggestions.push({
      priority: 'MEDIUM',
      category: 'Design',
      issue: `Large Class: ${methods.length} methods`,
      suggestion: 'Consider extracting related methods into separate classes',
      impact: 'Better organization and clarity',
      effort: 'Medium'
    });
  }

  // Too many fields
  if (fields.length > 10) {
    suggestions.push({
      priority: 'MEDIUM',
      category: 'Design',
      issue: `Too many fields: ${fields.length} instance variables`,
      suggestion: 'Group related fields into value objects or extract data classes',
      impact: 'Reduced complexity and better encapsulation',
      effort: 'Medium'
    });
  }

  // Naming issues
  if (className.length < 3) {
    suggestions.push({
      priority: 'LOW',
      category: 'Naming',
      issue: 'Class name too short',
      suggestion: 'Use a more descriptive name that clearly conveys purpose',
      impact: 'Better code readability',
      effort: 'Low (rename refactoring)'
    });
  }

  if (className.toLowerCase().includes('util') || className.toLowerCase().includes('helper')) {
    suggestions.push({
      priority: 'MEDIUM',
      category: 'Design',
      issue: 'Generic utility class name',
      suggestion: 'Consider more specific naming or break into domain-specific helpers',
      impact: 'Clearer responsibilities',
      effort: 'Medium'
    });
  }

  // Missing interface
  const hasInterface = symbol.implementsInterfaces || symbol.implements;
  if (!hasInterface && methods.length > 5) {
    const publicMethods = methods.filter((m: any) => m.modifiers?.includes('public'));
    if (publicMethods.length > 3) {
      suggestions.push({
        priority: 'LOW',
        category: 'Design',
        issue: 'No interface for public API',
        suggestion: 'Extract interface for better testability and dependency inversion',
        impact: 'Easier mocking and testing',
        effort: 'Low'
      });
    }
  }

  // Analyze method complexity if thorough or comprehensive
  if (depth === 'thorough' || depth === 'comprehensive') {
    for (const method of methods) {
      const calls = index.getOutboundCalls(method.fqn);
      if (calls.length > 10) {
        suggestions.push({
          priority: 'HIGH',
          category: 'Complexity',
          issue: `Method ${method.name} has ${calls.length} outbound calls`,
          suggestion: 'Extract private helper methods to reduce complexity',
          impact: 'Improved readability and testability',
          effort: 'Medium'
        });
      }
    }
  }

  // Check for static methods that should be instance methods
  const staticMethods = methods.filter((m: any) => m.modifiers?.includes('static'));
  if (staticMethods.length > fields.length && fields.length > 0) {
    suggestions.push({
      priority: 'LOW',
      category: 'Design',
      issue: 'Many static methods in stateful class',
      suggestion: 'Consider converting static methods to instance methods or extract utility class',
      impact: 'Better OOP design',
      effort: 'Low to Medium'
    });
  }
}

function analyzeMethod(symbol: any, index: MemoryIndex, suggestions: Suggestion[], depth: string) {
  const methodName = symbol.name;
  
  // Parameter analysis from signature
  if (symbol.signature) {
    const paramCount = countParameters(symbol.signature);
    if (paramCount > 5) {
      suggestions.push({
        priority: 'HIGH',
        category: 'Parameters',
        issue: `Too many parameters: ${paramCount}`,
        suggestion: 'Introduce parameter object or builder pattern',
        impact: 'Cleaner API and easier maintenance',
        effort: 'Medium'
      });
    } else if (paramCount > 3) {
      suggestions.push({
        priority: 'MEDIUM',
        category: 'Parameters',
        issue: `Many parameters: ${paramCount}`,
        suggestion: 'Consider parameter object for related parameters',
        impact: 'Better organization',
        effort: 'Low to Medium'
      });
    }
  }

  // Method length/complexity via call count
  const outboundCalls = index.getOutboundCalls(symbol.fqn);
  if (outboundCalls.length > 15) {
    suggestions.push({
      priority: 'HIGH',
      category: 'Complexity',
      issue: `High complexity: ${outboundCalls.length} method calls`,
      suggestion: 'Extract smaller private methods following Single Responsibility Principle',
      impact: 'Significantly improved readability and testability',
      effort: 'Medium to High'
    });
  } else if (outboundCalls.length > 10) {
    suggestions.push({
      priority: 'MEDIUM',
      category: 'Complexity',
      issue: `Complex method: ${outboundCalls.length} method calls`,
      suggestion: 'Consider extracting helper methods',
      impact: 'Better maintainability',
      effort: 'Medium'
    });
  }

  // Naming conventions
  if (methodName.length < 3) {
    suggestions.push({
      priority: 'LOW',
      category: 'Naming',
      issue: 'Method name too short',
      suggestion: 'Use descriptive name that explains what the method does',
      impact: 'Better code documentation',
      effort: 'Low'
    });
  }

  // Boolean methods should start with is/has/can
  const returnType = extractReturnType(symbol.signature);
  if (returnType === 'boolean' && 
      !methodName.startsWith('is') && 
      !methodName.startsWith('has') && 
      !methodName.startsWith('can') &&
      !methodName.startsWith('should')) {
    suggestions.push({
      priority: 'LOW',
      category: 'Naming',
      issue: 'Boolean method naming convention',
      suggestion: `Rename to start with 'is', 'has', 'can', or 'should'`,
      impact: 'Clearer intent',
      effort: 'Low'
    });
  }

  // Usage analysis
  const inboundCalls = index.getInboundCalls(symbol.fqn);
  if (inboundCalls.length === 0 && !symbol.modifiers?.includes('private')) {
    suggestions.push({
      priority: 'MEDIUM',
      category: 'Dead Code',
      issue: 'Unused public method',
      suggestion: 'Remove if truly unused, or make private if only for future use',
      impact: 'Reduced code maintenance burden',
      effort: 'Low'
    });
  }

  // Access modifier issues
  if (symbol.modifiers?.includes('public') && inboundCalls.length <= 1) {
    suggestions.push({
      priority: 'LOW',
      category: 'Encapsulation',
      issue: 'Public method with limited usage',
      suggestion: 'Consider reducing visibility to package-private or protected',
      impact: 'Better encapsulation',
      effort: 'Low'
    });
  }
}

function analyzeField(symbol: any, index: MemoryIndex, suggestions: Suggestion[], depth: string) {
  const fieldName = symbol.name;
  
  // Mutable static fields
  if (symbol.modifiers?.includes('static') && !symbol.modifiers?.includes('final')) {
    suggestions.push({
      priority: 'HIGH',
      category: 'Thread Safety',
      issue: 'Mutable static field',
      suggestion: 'Make final or use proper synchronization',
      impact: 'Prevent thread safety issues',
      effort: 'Low to Medium'
    });
  }

  // Public fields
  if (symbol.modifiers?.includes('public') && !symbol.modifiers?.includes('final')) {
    suggestions.push({
      priority: 'HIGH',
      category: 'Encapsulation',
      issue: 'Public mutable field',
      suggestion: 'Make private and add getter/setter methods',
      impact: 'Better encapsulation and control',
      effort: 'Low'
    });
  }

  // Naming conventions
  if (symbol.modifiers?.includes('static') && symbol.modifiers?.includes('final')) {
    if (fieldName !== fieldName.toUpperCase()) {
      suggestions.push({
        priority: 'LOW',
        category: 'Naming',
        issue: 'Constant not in UPPER_CASE',
        suggestion: 'Rename to follow Java constant naming convention',
        impact: 'Better code consistency',
        effort: 'Low'
      });
    }
  }

  // Check for unused fields
  const usages = index.findUsages(symbol.fqn);
  if (usages.length === 0) {
    suggestions.push({
      priority: 'MEDIUM',
      category: 'Dead Code',
      issue: 'Unused field',
      suggestion: 'Remove if not needed',
      impact: 'Cleaner codebase',
      effort: 'Low'
    });
  }
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

function countParameters(signature: string): number {
  const match = signature.match(/\(([^)]*)\)/);
  if (!match || !match[1].trim()) return 0;
  return match[1].split(',').length;
}

function extractReturnType(signature: string | undefined): string {
  if (!signature) return 'unknown';
  return signature.split(' ')[0].trim();
}

function calculateHealthScore(suggestions: Suggestion[]): number {
  let score = 100;
  suggestions.forEach(s => {
    if (s.priority === 'HIGH') score -= 15;
    else if (s.priority === 'MEDIUM') score -= 8;
    else score -= 3;
  });
  return Math.max(0, score);
}

function formatSuggestion(s: Suggestion, index: number): string {
  let result = `### ${index}. ${s.category}: ${s.issue}\n\n`;
  result += `**💡 Suggestion**: ${s.suggestion}\n\n`;
  result += `**📊 Impact**: ${s.impact}\n\n`;
  result += `**⏱️ Effort**: ${s.effort}\n\n`;
  return result;
}

function generateRefactoringPlan(suggestions: Suggestion[]): string[] {
  const plan: string[] = [];
  const high = suggestions.filter(s => s.priority === 'HIGH');
  const medium = suggestions.filter(s => s.priority === 'MEDIUM');
  
  if (high.length > 0) {
    plan.push(`**Phase 1** - Address ${high.length} high-priority issues (${estimateEffort(high)})`);
    high.forEach(s => {
      plan.push(`  - ${s.category}: ${s.issue}`);
    });
  }
  
  if (medium.length > 0) {
    plan.push(`**Phase 2** - Address ${medium.length} medium-priority issues (${estimateEffort(medium)})`);
    medium.slice(0, 3).forEach(s => {
      plan.push(`  - ${s.category}: ${s.issue}`);
    });
    if (medium.length > 3) {
      plan.push(`  - ... and ${medium.length - 3} more`);
    }
  }
  
  plan.push(`**Phase 3** - Run comprehensive test suite to verify refactorings`);
  plan.push(`**Phase 4** - Update documentation to reflect changes`);
  
  return plan;
}

function estimateEffort(suggestions: Suggestion[]): string {
  const efforts = suggestions.map(s => s.effort);
  if (efforts.some(e => e.includes('High'))) return 'High effort';
  if (efforts.some(e => e.includes('Medium'))) return 'Medium effort';
  return 'Low effort';
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}
