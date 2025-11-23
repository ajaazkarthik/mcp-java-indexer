import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const semanticSearchTool: Tool = {
  name: 'semantic_search',
  description: 'Search code by intent and patterns, not just names. Find methods by what they do (e.g., "database transactions", "file operations"), detect design patterns, or locate similar code structures.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query or pattern description (e.g., "methods that throw IOException", "builder pattern implementations", "database save methods")'
      },
      scope: {
        type: 'string',
        enum: ['all', 'methods', 'classes', 'fields'],
        description: 'Limit search to specific symbol types',
        default: 'all'
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 20)',
        default: 20
      }
    },
    required: ['query']
  }
};

export async function handleSemanticSearch(
  args: any,
  memoryIndex: MemoryIndex
) {
  const query = (args.query as string).toLowerCase();
  const scope = (args.scope as string) || 'all';
  const limit = (args.limit as number) || 20;

  try {
    const allSymbols = Array.from(memoryIndex.getAllSymbols());
    const results: any[] = [];

    // Pattern detection keywords
    const patterns = {
      builder: ['builder', 'build()', 'with', 'fluent'],
      factory: ['factory', 'create', 'newinstance'],
      singleton: ['singleton', 'getinstance', 'instance'],
      observer: ['observer', 'observable', 'listener', 'notify'],
      repository: ['repository', 'dao', 'findby', 'save', 'delete'],
      service: ['service', 'process', 'execute', 'handle'],
      controller: ['controller', 'endpoint', 'mapping', '@controller'],
      validator: ['validator', 'validate', 'isvalid'],
      exception: ['exception', 'error', 'throw'],
      transaction: ['transaction', 'transactional', '@transactional', 'commit', 'rollback'],
      async: ['async', 'future', 'completable', 'executor'],
      cache: ['cache', 'cached', 'cacheable'],
      logger: ['log', 'logger', 'logging'],
      database: ['database', 'jdbc', 'query', 'connection', 'resultset'],
      io: ['read', 'write', 'stream', 'file', 'inputstream', 'outputstream'],
      http: ['http', 'request', 'response', 'client', 'resttemplate'],
      json: ['json', 'serialize', 'deserialize', 'jackson', 'gson'],
      test: ['test', 'mock', 'assert', '@test'],
      deprecated: ['deprecated', '@deprecated'],
      override: ['override', '@override'],
      getter: ['get', 'is', 'has'],
      setter: ['set'],
      static: ['static'],
      abstract: ['abstract'],
      final: ['final']
    };

    // Detect query intent
    const matchedPatterns: string[] = [];
    for (const [pattern, keywords] of Object.entries(patterns)) {
      if (keywords.some(kw => query.includes(kw))) {
        matchedPatterns.push(pattern);
      }
    }

    // Score and filter symbols
    for (const [fqn, symbol] of allSymbols) {
      // Apply scope filter
      if (scope !== 'all') {
        if (scope === 'methods' && symbol.kind !== 'method') continue;
        if (scope === 'classes' && symbol.kind !== 'class') continue;
        if (scope === 'fields' && symbol.kind !== 'field') continue;
      }

      let score = 0;
      const reasons: string[] = [];

      // Name matching
      const symbolNameLower = symbol.name.toLowerCase();
      const fqnLower = fqn.toLowerCase();
      
      if (symbolNameLower.includes(query)) {
        score += 50;
        reasons.push('name match');
      } else if (fqnLower.includes(query)) {
        score += 30;
        reasons.push('FQN match');
      } else {
        // Check individual words in the query
        const queryWords = query.split(/\s+/).filter(w => w.length > 2);
        let wordMatchCount = 0;
        for (const word of queryWords) {
          if (symbolNameLower.includes(word) || fqnLower.includes(word)) {
            wordMatchCount++;
          }
        }
        if (wordMatchCount > 0) {
          score += wordMatchCount * 15;
          reasons.push(`${wordMatchCount} word match${wordMatchCount > 1 ? 'es' : ''}`);
        }
      }

      // Signature matching
      if (symbol.signature) {
        const sigLower = symbol.signature.toLowerCase();
        if (sigLower.includes(query)) {
          score += 40;
          reasons.push('signature match');
        }
        
        // Check for exceptions in signature
        if (query.includes('throw') || query.includes('exception')) {
          if (sigLower.includes('throws') || sigLower.includes('exception')) {
            score += 30;
            reasons.push('throws exceptions');
          }
        }
      }

      // Pattern matching
      for (const pattern of matchedPatterns) {
        const keywords = patterns[pattern as keyof typeof patterns];
        const matchCount = keywords.filter((kw: string) => 
          symbolNameLower.includes(kw) || 
          fqnLower.includes(kw) ||
          (symbol.signature && symbol.signature.toLowerCase().includes(kw))
        ).length;
        
        if (matchCount > 0) {
          score += matchCount * 20;
          reasons.push(`${pattern} pattern (${matchCount} matches)`);
        }
      }

      // Modifier matching
      if (symbol.modifiers) {
        const modifiersLower = symbol.modifiers.map(m => m.toLowerCase());
        if (query.includes('static') && modifiersLower.includes('static')) {
          score += 25;
          reasons.push('static member');
        }
        if (query.includes('abstract') && modifiersLower.includes('abstract')) {
          score += 25;
          reasons.push('abstract');
        }
        if (query.includes('final') && modifiersLower.includes('final')) {
          score += 25;
          reasons.push('final');
        }
        if (query.includes('public') && modifiersLower.includes('public')) {
          score += 10;
        }
        if (query.includes('private') && modifiersLower.includes('private')) {
          score += 10;
        }
      }

      // Inheritance matching
      if (query.includes('extend') || query.includes('inherit')) {
        if (symbol.extendsClass || symbol.extends) {
          score += 30;
          reasons.push('has inheritance');
        }
      }
      if (query.includes('implement') || query.includes('interface')) {
        if (symbol.implementsInterfaces || symbol.implements) {
          score += 30;
          reasons.push('implements interfaces');
        }
      }

      if (score > 0) {
        results.push({
          symbol,
          score,
          reasons
        });
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    if (topResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `# Semantic Search Results\n\n**Query**: "${args.query}"\n**Found**: 0 symbols\n\nNo results found. Try:\n- More general terms (e.g., "save" instead of "saveToDatabase")\n- Pattern names (e.g., "builder", "factory", "repository")\n- Exception types (e.g., "IOException", "SQLException")\n- Operations (e.g., "read file", "http request", "database query")`
        }]
      };
    }

    // Build results report
    let report = `# Semantic Search Results\n\n`;
    report += `**Query**: "${args.query}"\n`;
    report += `**Scope**: ${scope}\n`;
    report += `**Found**: ${topResults.length} relevant symbols`;
    if (results.length > limit) {
      report += ` (showing top ${limit} of ${results.length})`;
    }
    report += `\n\n`;

    if (matchedPatterns.length > 0) {
      report += `**Detected Patterns**: ${matchedPatterns.join(', ')}\n\n`;
    }
    
    // Scoring explanation
    report += `## 📊 Scoring System\n\n`;
    report += `- **Name match** (50 pts): Symbol name contains query\n`;
    report += `- **FQN match** (30 pts): Full qualified name contains query\n`;
    report += `- **Word matches** (15 pts each): Individual query words found\n`;
    report += `- **Signature match** (40 pts): Method signature contains query\n`;
    report += `- **Pattern match** (20 pts each): Design pattern keywords found\n`;
    report += `- **Modifiers** (10-25 pts): static, abstract, final, etc.\n`;
    report += `- **Inheritance** (30 pts): extends/implements matches query\n\n`;

    report += `---\n\n`;

    for (const result of topResults) {
      const sym = result.symbol;
      const scoreBar = getScoreBar(result.score);
      
      report += `## ${sym.kind}: \`${sym.name}\`\n\n`;
      report += `**Relevance**: ${scoreBar} ${result.score} pts\n`;
      report += `**Match Reasons**: ${result.reasons.join(', ')}\n`;
      report += `**Location**: ${getFileName(sym.file)}:${sym.line}\n`;
      report += `**FQN**: \`${sym.fqn}\`\n`;
      
      if (sym.signature) {
        report += `**Signature**: \`${sym.signature}\`\n`;
      }
      
      if (sym.modifiers && sym.modifiers.length > 0) {
        report += `**Modifiers**: ${sym.modifiers.join(', ')}\n`;
      }
      
      if (sym.extendsClass || sym.extends) {
        report += `**Extends**: \`${sym.extendsClass || sym.extends}\`\n`;
      }
      
      if (sym.implementsInterfaces || sym.implements) {
        const interfaces = sym.implementsInterfaces || sym.implements || [];
        report += `**Implements**: \`${interfaces.join(', ')}\`\n`;
      }
      
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
        text: `Semantic search failed: ${errorMessage}`
      }],
      isError: true
    };
  }
}

// Helper functions
function getScoreBar(score: number): string {
  // Visual score indicator
  if (score >= 100) return '🟢🟢🟢';
  if (score >= 70) return '🟢🟢⚪';
  if (score >= 50) return '🟢⚪⚪';
  if (score >= 30) return '🟡⚪⚪';
  return '⚪⚪⚪';
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}
