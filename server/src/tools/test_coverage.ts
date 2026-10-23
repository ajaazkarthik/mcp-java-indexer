import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const testCoverageTool: Tool = {
  name: 'test_coverage',
  description: 'Analyze test coverage for a class or method. Shows which tests exercise the code, identifies untested paths, and calculates coverage metrics.',
  inputSchema: {
    type: 'object',
    properties: {
      symbolFqn: {
        type: 'string',
        description: 'Fully qualified name of the class or method to analyze test coverage for'
      },
      includeIndirect: {
        type: 'boolean',
        description: 'Include tests that indirectly call this code (default: true)',
        default: true
      }
    },
    required: ['symbolFqn']
  }
};

export async function handleTestCoverage(
  args: any,
  memoryIndex: MemoryIndex,
  signal?: AbortSignal
) {
  if (signal?.aborted) {
    console.error('[MCP] cancelled test_coverage');
    return { content: [{type:'text',text:'Request cancelled'}], isError: true };
  }

  const symbolFqn = args.symbolFqn as string;
  const includeIndirect = args.includeIndirect !== false;

  try {
    // Try exact match first, then fuzzy search
    let symbol = memoryIndex.getSymbol(symbolFqn);
    let resolvedFqn = symbolFqn;
    
    if (!symbol) {
      // Use findSymbols for fuzzy matching
      const matches = memoryIndex.findSymbols(symbolFqn);
      
      if (matches.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `Symbol not found: ${symbolFqn}\n\nNo matching symbols in index. Possible reasons:\n• Symbol doesn't exist\n• Project not indexed (use index_project)\n• Typo in symbol name\n\nTip: Try partial name matching (e.g., "UserService" instead of full FQN)`
          }]
        };
      } else if (matches.length === 1) {
        // Single match - use it
        symbol = matches[0];
        resolvedFqn = symbol.fqn;
      } else {
        // Multiple matches - ask user to clarify
        const list = matches.map((s, i) => 
          `${i + 1}. ${s.kind}: \`${s.fqn}\` in ${s.file.split(/[\\/]/).pop()}:${s.line}`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `Multiple symbols match "${symbolFqn}". Please specify the full FQN:\n\n${list}\n\nUse the exact FQN from above.`
          }]
        };
      }
    }

    let report = `# Test Coverage Analysis: ${symbol.name}\n\n`;
    report += `**Type**: ${symbol.kind}\n`;
    report += `**Location**: ${getFileName(symbol.file)}:${symbol.line}\n`;
    report += `**FQN**: ${resolvedFqn}\n\n`;

    // Find all callers (potential test methods)
    const inboundCalls = memoryIndex.getInboundCalls(resolvedFqn);
    const directTests: any[] = [];
    const indirectTests: any[] = [];

    // Identify direct test methods
    for (const edge of inboundCalls) {
      const caller = memoryIndex.getSymbol(edge.caller);
      if (!caller) continue;

      if (isTestMethod(caller)) {
        directTests.push({
          method: caller,
          locations: edge.locations
        });
      } else if (includeIndirect) {
        // Check if this caller is called by tests
        const callerInbound = memoryIndex.getInboundCalls(edge.caller);
        for (const callerEdge of callerInbound) {
          const potentialTest = memoryIndex.getSymbol(callerEdge.caller);
          if (potentialTest && isTestMethod(potentialTest)) {
            indirectTests.push({
              method: potentialTest,
              via: caller,
              locations: callerEdge.locations
            });
          }
        }
      }
    }

    // Calculate coverage metrics
    const totalCallers = inboundCalls.length;
    const testedPaths = directTests.length + (includeIndirect ? indirectTests.length : 0);
    const coveragePercent = totalCallers > 0 ? Math.round((testedPaths / totalCallers) * 100) : 0;

    // Coverage status
    report += `## 📊 Coverage Summary\n\n`;
    report += `**Coverage**: ${coveragePercent}% (${testedPaths}/${totalCallers} paths tested)\n`;
    
    let statusEmoji = '🔴';
    let status = 'POOR';
    if (coveragePercent >= 80) {
      statusEmoji = '🟢';
      status = 'EXCELLENT';
    } else if (coveragePercent >= 60) {
      statusEmoji = '🟡';
      status = 'GOOD';
    } else if (coveragePercent >= 40) {
      statusEmoji = '🟠';
      status = 'MODERATE';
    }
    
    report += `**Status**: ${statusEmoji} ${status}\n\n`;

    // Direct test coverage
    if (directTests.length > 0) {
      report += `## ✅ Direct Test Coverage\n\n`;
      report += `**${directTests.length}** test method(s) directly call this code:\n\n`;
      
      for (const test of directTests.slice(0, 10)) {
        const testClass = getClassName(test.method.fqn);
        report += `### ${test.method.name}\n`;
        report += `- **Test Class**: \`${testClass}\`\n`;
        report += `- **Location**: ${getFileName(test.method.file)}:${test.method.line}\n`;
        report += `- **Calls**: ${test.locations.length} time(s)\n`;
        
        // Show call locations
        if (test.locations.length <= 3) {
          test.locations.forEach((loc: any) => {
            report += `  - Line ${loc.line}\n`;
          });
        }
        report += `\n`;
      }
      
      if (directTests.length > 10) {
        report += `... and ${directTests.length - 10} more direct tests\n\n`;
      }
    } else {
      report += `## ⚠️ No Direct Test Coverage\n\n`;
      report += `No test methods directly call this code.\n\n`;
    }

    // Indirect test coverage
    if (includeIndirect && indirectTests.length > 0) {
      report += `## 🔗 Indirect Test Coverage\n\n`;
      report += `**${indirectTests.length}** test method(s) indirectly exercise this code:\n\n`;
      
      for (const test of indirectTests.slice(0, 5)) {
        const testClass = getClassName(test.method.fqn);
        report += `### ${test.method.name}\n`;
        report += `- **Test Class**: \`${testClass}\`\n`;
        report += `- **Via**: \`${test.via.name}\`\n`;
        report += `- **Location**: ${getFileName(test.method.file)}:${test.method.line}\n\n`;
      }
      
      if (indirectTests.length > 5) {
        report += `... and ${indirectTests.length - 5} more indirect tests\n\n`;
      }
    }

    // Untested paths
    const untestedCallers = inboundCalls.filter(edge => {
      const caller = memoryIndex.getSymbol(edge.caller);
      if (!caller) return false;
      
      const isDirect = directTests.some(t => t.method.fqn === caller.fqn);
      const isIndirect = indirectTests.some(t => t.via?.fqn === caller.fqn);
      
      return !isDirect && !isIndirect && !isTestMethod(caller);
    });

    if (untestedCallers.length > 0) {
      report += `## 🔍 Untested Call Paths\n\n`;
      report += `**${untestedCallers.length}** production code path(s) are not covered by tests:\n\n`;
      
      for (const edge of untestedCallers.slice(0, 10)) {
        const caller = memoryIndex.getSymbol(edge.caller);
        if (!caller) continue;
        
        report += `- \`${caller.name}\` in \`${getClassName(caller.fqn)}\`\n`;
        report += `  - Location: ${getFileName(caller.file)}:${caller.line}\n`;
      }
      
      if (untestedCallers.length > 10) {
        report += `- ... and ${untestedCallers.length - 10} more\n`;
      }
      report += `\n`;
    }

    // Class-level analysis for methods
    if (symbol.kind === 'method' && symbol.declaringClass) {
      const classSymbol = memoryIndex.getSymbol(symbol.declaringClass);
      if (classSymbol) {
        const classMethods = findMethodsInClass(symbol.declaringClass, memoryIndex);
        const testedMethods = classMethods.filter(m => {
          const calls = memoryIndex.getInboundCalls(m.fqn);
          return calls.some(edge => {
            const caller = memoryIndex.getSymbol(edge.caller);
            return caller && isTestMethod(caller);
          });
        });
        
        const classCoverage = Math.round((testedMethods.length / classMethods.length) * 100);
        
        report += `## 📦 Class Coverage Context\n\n`;
        report += `**Class**: \`${classSymbol.name}\`\n`;
        report += `**Methods Tested**: ${testedMethods.length}/${classMethods.length} (${classCoverage}%)\n\n`;
      }
    }

    // Recommendations
    report += `## 💡 Recommendations\n\n`;
    
    if (coveragePercent >= 80) {
      report += `- ✅ Excellent coverage! Maintain quality with new changes\n`;
    } else if (coveragePercent >= 60) {
      report += `- 🟡 Good coverage, but room for improvement\n`;
      if (untestedCallers.length > 0) {
        report += `- 📝 Add tests for ${untestedCallers.length} untested call paths\n`;
      }
    } else if (coveragePercent >= 40) {
      report += `- ⚠️ Moderate coverage - prioritize adding tests\n`;
      if (directTests.length === 0) {
        report += `- 🎯 Create direct unit tests for this ${symbol.kind}\n`;
      }
      if (untestedCallers.length > 0) {
        report += `- 📝 Cover ${untestedCallers.length} untested production paths\n`;
      }
    } else {
      report += `- 🔴 Poor coverage - testing is critical\n`;
      report += `- 🚨 Create comprehensive test suite immediately\n`;
      if (directTests.length === 0) {
        report += `- 🎯 Start with direct unit tests\n`;
      }
      report += `- 📝 Add integration tests for production usage\n`;
    }

    // Suggest test names
    if (directTests.length === 0) {
      report += `\n### Suggested Test Names\n\n`;
      if (symbol.kind === 'method') {
        const methodName = symbol.name;
        report += `- \`test${capitalize(methodName)}Success\`\n`;
        report += `- \`test${capitalize(methodName)}WithInvalidInput\`\n`;
        report += `- \`test${capitalize(methodName)}ThrowsException\`\n`;
      } else if (symbol.kind === 'class') {
        report += `- \`${symbol.name}Test\`\n`;
        report += `- \`${symbol.name}IntegrationTest\`\n`;
      }
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
        text: `Failed to analyze test coverage: ${errorMessage}`
      }],
      isError: true
    };
  }
}

function isTestMethod(symbol: any): boolean {
  // Check if method name suggests it's a test
  const name = symbol.name.toLowerCase();
  if (name.startsWith('test') || name.startsWith('should')) {
    return true;
  }

  // Check for @Test annotation in file path or common test packages
  const file = symbol.file.toLowerCase();
  if (file.includes('/test/') || file.includes('\\test\\')) {
    return true;
  }

  // Check if in test package
  const pkg = symbol.packageName?.toLowerCase() || '';
  if (pkg.includes('.test') || pkg.includes('.tests')) {
    return true;
  }

  // Check for JUnit/TestNG modifiers or naming
  const className = getClassName(symbol.fqn).toLowerCase();
  if (className.endsWith('test') || className.endsWith('tests') || 
      className.endsWith('spec') || className.startsWith('test')) {
    return true;
  }

  return false;
}

function findMethodsInClass(classFqn: string, index: MemoryIndex): any[] {
  const methods: any[] = [];
  for (const [fqn, symbol] of index.getAllSymbols()) {
    if (symbol.kind === 'method' && symbol.declaringClass === classFqn) {
      methods.push(symbol);
    }
  }
  return methods;
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function getClassName(fqn: string): string {
  const parts = fqn.split('.');
  // For methods, remove method name and parameters
  if (fqn.includes('(')) {
    const methodPart = fqn.substring(0, fqn.indexOf('('));
    const classPath = methodPart.substring(0, methodPart.lastIndexOf('.'));
    return classPath.split('.').pop() || classPath;
  }
  return parts[parts.length - 1];
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
