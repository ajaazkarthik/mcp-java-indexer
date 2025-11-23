import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const analyzeImpactTool: Tool = {
  name: 'analyze_impact',
  description: 'Analyze the impact of changing a class or method. Shows all code that depends on it, call chains, and risk assessment. Essential for safe refactoring.',
  inputSchema: {
    type: 'object',
    properties: {
      symbolFqn: {
        type: 'string',
        description: 'Fully qualified name of the class or method to analyze (e.g., "com.example.UserService" or "com.example.UserService.save(User)")'
      },
      depth: {
        type: 'number',
        description: 'How many levels deep to trace dependencies (1-5, default: 3)',
        default: 3
      }
    },
    required: ['symbolFqn']
  }
};

export async function handleAnalyzeImpact(
  args: any,
  memoryIndex: MemoryIndex
) {
  const symbolFqn = args.symbolFqn as string;
  const depth = (args.depth as number) || 3;

  try {
    const symbol = memoryIndex.getSymbol(symbolFqn);
    if (!symbol) {
      return {
        content: [{
          type: 'text',
          text: `Symbol not found: ${symbolFqn}\n\nTry searching first with find_symbol to get the exact FQN.`
        }]
      };
    }

    // Find all direct usages
    const directUsages = memoryIndex.findUsages(symbolFqn);
    const directCallers = memoryIndex.getInboundCalls(symbolFqn);
    
    // Find indirect usages (recursive)
    const impactChain = buildImpactChain(symbolFqn, memoryIndex, depth);
    
    // Calculate risk score
    const riskScore = calculateRiskScore(directUsages.length, directCallers.length, impactChain.levels);
    
    // Build report
    let report = `# Impact Analysis: ${symbol.name}\n\n`;
    report += `**Type**: ${symbol.kind}\n`;
    report += `**Location**: ${symbol.file}:${symbol.line}\n`;
    report += `**FQN**: ${symbolFqn}\n\n`;
    
    // Risk assessment
    report += `## 🎯 Risk Assessment\n\n`;
    report += `**Risk Level**: ${getRiskLevel(riskScore)} (${riskScore}/100)\n`;
    report += `**Direct Dependencies**: ${directUsages.length} references, ${directCallers.length} callers\n`;
    report += `**Indirect Impact**: ${impactChain.totalAffected} symbols across ${impactChain.levels} levels\n\n`;
    
    if (riskScore > 70) {
      report += `⚠️ **HIGH RISK**: This symbol is heavily used. Changes require extensive testing.\n\n`;
    } else if (riskScore > 40) {
      report += `⚡ **MODERATE RISK**: Multiple dependencies. Review callers before changes.\n\n`;
    } else {
      report += `✅ **LOW RISK**: Limited dependencies. Changes are relatively safe.\n\n`;
    }
    
    // Direct usages
    if (directUsages.length > 0) {
      report += `## 📍 Direct Usages (${directUsages.length})\n\n`;
      const grouped = groupByFile(directUsages);
      const files = Object.keys(grouped).slice(0, 10);
      
      for (const file of files) {
        const refs = grouped[file];
        report += `**${getFileName(file)}** (${refs.length} references)\n`;
        refs.slice(0, 3).forEach(ref => {
          report += `  - Line ${ref.line}: ${ref.kind}\n`;
        });
        if (refs.length > 3) {
          report += `  - ... and ${refs.length - 3} more\n`;
        }
        report += `\n`;
      }
      
      if (Object.keys(grouped).length > 10) {
        report += `... and ${Object.keys(grouped).length - 10} more files\n\n`;
      }
    }
    
    // Call chain
    if (directCallers.length > 0) {
      report += `## 📞 Call Chain (${directCallers.length} direct callers)\n\n`;
      for (const edge of directCallers.slice(0, 10)) {
        const callerSymbol = memoryIndex.getSymbol(edge.caller);
        if (callerSymbol) {
          report += `**${callerSymbol.name}**\n`;
          report += `  - ${callerSymbol.file}:${edge.locations[0].line}\n`;
          
          // Show who calls this caller (one level up)
          const secondLevel = memoryIndex.getInboundCalls(edge.caller);
          if (secondLevel.length > 0) {
            report += `  - Called by: ${secondLevel.slice(0, 3).map(e => getSymbolName(e.caller, memoryIndex)).join(', ')}`;
            if (secondLevel.length > 3) report += ` and ${secondLevel.length - 3} more`;
            report += `\n`;
          }
          report += `\n`;
        }
      }
      
      if (directCallers.length > 10) {
        report += `... and ${directCallers.length - 10} more callers\n\n`;
      }
    }
    
    // Impact summary by level
    if (impactChain.levels > 1) {
      report += `## 🌊 Ripple Effect\n\n`;
      report += `Changes propagate through ${impactChain.levels} levels:\n\n`;
      impactChain.byLevel.forEach((count, level) => {
        if (count > 0) {
          report += `**Level ${level}**: ${count} symbols affected\n`;
        }
      });
      report += `\n**Total Impact**: ${impactChain.totalAffected} symbols\n\n`;
    }
    
    // Recommendations
    report += `## 💡 Recommendations\n\n`;
    if (riskScore > 70) {
      report += `- ✅ Write comprehensive unit tests before changes\n`;
      report += `- ✅ Consider creating a new version/overload instead of modifying\n`;
      report += `- ✅ Use @Deprecated annotation if removing functionality\n`;
      report += `- ✅ Coordinate with team - this affects many modules\n`;
    } else if (riskScore > 40) {
      report += `- ✅ Review and test all direct callers\n`;
      report += `- ✅ Check for interface contracts and breaking changes\n`;
      report += `- ✅ Update related documentation\n`;
    } else {
      report += `- ✅ Verify behavior with existing tests\n`;
      report += `- ✅ Consider edge cases in the few affected areas\n`;
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
        text: `Failed to analyze impact: ${errorMessage}`
      }],
      isError: true
    };
  }
}

interface ImpactChain {
  totalAffected: number;
  levels: number;
  byLevel: number[];
}

function buildImpactChain(fqn: string, index: MemoryIndex, maxDepth: number): ImpactChain {
  const visited = new Set<string>();
  const byLevel: number[] = [];
  
  function traverse(currentFqn: string, level: number) {
    if (level >= maxDepth || visited.has(currentFqn)) return;
    
    visited.add(currentFqn);
    byLevel[level] = (byLevel[level] || 0) + 1;
    
    const callers = index.getInboundCalls(currentFqn);
    for (const edge of callers) {
      traverse(edge.caller, level + 1);
    }
    
    const usages = index.findUsages(currentFqn);
    const uniqueUsers = new Set(usages.map(u => u.fromFqn));
    for (const userFqn of uniqueUsers) {
      traverse(userFqn, level + 1);
    }
  }
  
  traverse(fqn, 0);
  
  return {
    totalAffected: visited.size,
    levels: byLevel.length,
    byLevel
  };
}

function calculateRiskScore(directUsages: number, directCallers: number, levels: number): number {
  // Risk factors:
  // - Number of direct usages (0-40 points)
  // - Number of direct callers (0-30 points)
  // - Depth of impact chain (0-30 points)
  
  const usageScore = Math.min(40, directUsages * 2);
  const callerScore = Math.min(30, directCallers * 3);
  const depthScore = Math.min(30, (levels - 1) * 10);
  
  return Math.min(100, usageScore + callerScore + depthScore);
}

function getRiskLevel(score: number): string {
  if (score >= 70) return '🔴 HIGH';
  if (score >= 40) return '🟡 MODERATE';
  return '🟢 LOW';
}

function groupByFile(usages: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  for (const usage of usages) {
    if (!grouped[usage.file]) {
      grouped[usage.file] = [];
    }
    grouped[usage.file].push(usage);
  }
  return grouped;
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function getSymbolName(fqn: string, index: MemoryIndex): string {
  const symbol = index.getSymbol(fqn);
  return symbol ? symbol.name : fqn.split('.').pop() || fqn;
}
