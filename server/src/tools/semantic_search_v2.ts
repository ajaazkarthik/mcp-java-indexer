import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex, SymbolStub, Reference } from '../memory-index.js';

export const semanticSearchTool: Tool = {
  name: 'semantic_search',
  description: 'Search code by intent, patterns, and context. Find methods/classes by what they do (e.g., "Hibernate session creation", "Spring transaction methods", "database save operations"). Uses advanced contextual matching beyond simple name search.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query or pattern description (e.g., "methods that create Hibernate sessions", "Spring repository save methods", "transaction handling code")'
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

interface ScoredResult {
  symbol: SymbolStub;
  score: number;
  reasons: string[];
  context: string;
}

export async function handleSemanticSearch(
  args: any,
  memoryIndex: MemoryIndex
) {
  const query = (args.query as string).toLowerCase();
  const scope = (args.scope as string) || 'all';
  const limit = (args.limit as number) || 20;

  try {
    const allSymbols = Array.from(memoryIndex.getAllSymbols().values());
    const results: ScoredResult[] = [];

    // Extract query keywords and intent
    const queryAnalysis = analyzeQuery(query);
    
    // Score and filter symbols
    for (const symbol of allSymbols) {
      // Apply scope filter
      if (scope !== 'all') {
        if (scope === 'methods' && symbol.kind !== 'method') continue;
        if (scope === 'classes' && symbol.kind !== 'class') continue;
        if (scope === 'fields' && symbol.kind !== 'field') continue;
      }

      const scoringResult = scoreSymbol(symbol, queryAnalysis, memoryIndex);
      
      if (scoringResult.score > 0) {
        results.push(scoringResult);
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    if (topResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No relevant results found for: "${args.query}"\n\n` +
            `**Tips:**\n` +
            `- Try more general terms (e.g., "session" instead of "SessionFactory creation")\n` +
            `- Use technology names (e.g., "Hibernate", "Spring", "JPA")\n` +
            `- Describe behavior (e.g., "methods that save to database", "transaction handling")\n` +
            `- Try pattern names (e.g., "factory", "builder", "repository")\n\n` +
            `**Suggestions:**\n` +
            `- Use \`find_symbol\` for exact name matching\n` +
            `- Use \`search_text\` for text/regex patterns\n` +
            `- Ensure project is indexed: \`index_project\``
        }]
      };
    }

    // Build detailed results report
    let report = `# 🔍 Semantic Search Results\n\n`;
    report += `**Query**: "${args.query}"\n`;
    report += `**Intent Detected**: ${queryAnalysis.intent || 'general search'}\n`;
    report += `**Found**: ${topResults.length} relevant symbols`;
    if (results.length > limit) {
      report += ` (showing top ${limit} of ${results.length})`;
    }
    report += `\n\n`;

    if (queryAnalysis.frameworks.length > 0) {
      report += `**Frameworks Detected**: ${queryAnalysis.frameworks.join(', ')}\n\n`;
    }

    report += `---\n\n`;

    for (let i = 0; i < topResults.length; i++) {
      const result = topResults[i];
      const sym = result.symbol;
      
      report += `## ${i + 1}. ${sym.kind}: \`${sym.name}\`\n\n`;
      report += `**Relevance Score**: ${result.score}% - ${result.reasons.slice(0, 3).join(', ')}\n`;
      report += `**Location**: \`${getFileName(sym.file)}:${sym.line}\`\n`;
      report += `**FQN**: \`${sym.fqn}\`\n`;
      
      if (sym.signature) {
        report += `**Signature**: \`${sym.signature}\`\n`;
      }
      
      if (sym.modifiers && sym.modifiers.length > 0) {
        report += `**Modifiers**: ${sym.modifiers.join(', ')}\n`;
      }
      
      // Show context
      if (result.context) {
        report += `**Context**: ${result.context}\n`;
      }
      
      report += `\n`;
    }

    // Add suggestions for low confidence results
    if (topResults.length > 0 && topResults[0].score < 50) {
      report += `\n---\n\n`;
      report += `⚠️ **Low Confidence Results**: The matches above have relatively low relevance scores. `;
      report += `Consider refining your query or using \`find_symbol\` for exact name matching.\n`;
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

interface QueryAnalysis {
  keywords: string[];
  intent: string;
  frameworks: string[];
  operations: string[];
  technologies: string[];
}

/**
 * Analyze query to understand user intent
 */
function analyzeQuery(query: string): QueryAnalysis {
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
  
  // Detect frameworks
  const frameworks: string[] = [];
  const frameworkPatterns = {
    'hibernate': ['hibernate', 'sessionfactory', 'session', 'hql', 'criteria'],
    'spring': ['spring', 'autowired', 'component', 'service', 'repository', 'controller', 'bean', 'transactional'],
    'jpa': ['jpa', 'entitymanager', 'persistence', 'entity', 'repository'],
    'jdbc': ['jdbc', 'connection', 'statement', 'resultset', 'preparedstatement'],
    'junit': ['junit', 'test', 'assert', 'mock', 'mockito'],
    'jackson': ['jackson', 'json', 'objectmapper', 'serialize', 'deserialize'],
    'servlet': ['servlet', 'http', 'request', 'response', 'filter']
  };
  
  for (const [framework, patterns] of Object.entries(frameworkPatterns)) {
    if (patterns.some(p => query.includes(p))) {
      frameworks.push(framework);
    }
  }
  
  // Detect intent (what user is trying to find)
  let intent = '';
  if (query.includes('create') || query.includes('creat') || query.includes('build') || query.includes('new')) {
    intent = 'object creation';
  } else if (query.includes('save') || query.includes('persist') || query.includes('insert') || query.includes('store')) {
    intent = 'data persistence';
  } else if (query.includes('find') || query.includes('get') || query.includes('retrieve') || query.includes('fetch') || query.includes('load')) {
    intent = 'data retrieval';
  } else if (query.includes('delete') || query.includes('remove')) {
    intent = 'data deletion';
  } else if (query.includes('update') || query.includes('modify') || query.includes('change')) {
    intent = 'data modification';
  } else if (query.includes('transaction') || query.includes('commit') || query.includes('rollback')) {
    intent = 'transaction management';
  } else if (query.includes('validate') || query.includes('check')) {
    intent = 'validation';
  } else if (query.includes('test')) {
    intent = 'testing';
  }
  
  // Detect operations
  const operations: string[] = [];
  const opPatterns = ['create', 'save', 'find', 'get', 'delete', 'update', 'load', 'close', 'open', 'connect', 'execute'];
  for (const op of opPatterns) {
    if (query.includes(op)) {
      operations.push(op);
    }
  }
  
  // Detect technologies
  const technologies: string[] = [];
  const techPatterns = ['database', 'db', 'sql', 'rest', 'api', 'web', 'http', 'file', 'io', 'stream', 'thread'];
  for (const tech of techPatterns) {
    if (query.includes(tech)) {
      technologies.push(tech);
    }
  }
  
  return { keywords, intent, frameworks, operations, technologies };
}

/**
 * Score a symbol based on query analysis
 */
function scoreSymbol(
  symbol: SymbolStub, 
  queryAnalysis: QueryAnalysis, 
  memoryIndex: MemoryIndex
): ScoredResult {
  let score = 0;
  const reasons: string[] = [];
  let context = '';
  
  const symbolNameLower = symbol.name.toLowerCase();
  const fqnLower = symbol.fqn.toLowerCase();
  const signatureLower = (symbol.signature || '').toLowerCase();
  const packageLower = symbol.packageName.toLowerCase();
  
  // 1. Exact keyword matching in name (highest priority)
  for (const keyword of queryAnalysis.keywords) {
    if (symbolNameLower === keyword) {
      score += 100;
      reasons.push(`exact name match: "${keyword}"`);
    } else if (symbolNameLower.includes(keyword)) {
      score += 50;
      reasons.push(`name contains "${keyword}"`);
    } else if (fqnLower.includes(keyword)) {
      score += 30;
      reasons.push(`FQN contains "${keyword}"`);
    } else if (signatureLower.includes(keyword)) {
      score += 25;
      reasons.push(`signature contains "${keyword}"`);
    }
  }
  
  // 2. Framework-specific scoring
  for (const framework of queryAnalysis.frameworks) {
    const frameworkScore = scoreFrameworkRelevance(symbol, framework, memoryIndex);
    if (frameworkScore > 0) {
      score += frameworkScore;
      reasons.push(`${framework} framework usage`);
    }
  }
  
  // 3. Operation matching (create, save, find, etc.)
  for (const operation of queryAnalysis.operations) {
    if (symbolNameLower.includes(operation) || symbolNameLower.startsWith(operation)) {
      score += 40;
      reasons.push(`operation: ${operation}`);
    }
  }
  
  // 4. Intent-based scoring
  if (queryAnalysis.intent) {
    const intentScore = scoreIntent(symbol, queryAnalysis.intent);
    if (intentScore > 0) {
      score += intentScore;
      reasons.push(queryAnalysis.intent);
    }
  }
  
  // 5. Return type and parameter matching
  if (symbol.signature) {
    for (const tech of queryAnalysis.technologies) {
      if (signatureLower.includes(tech)) {
        score += 20;
        reasons.push(`uses ${tech}`);
      }
    }
  }
  
  // 6. Package relevance
  for (const framework of queryAnalysis.frameworks) {
    if (packageLower.includes(framework) || packageLower.includes(framework.replace('spring', 'springframework'))) {
      score += 15;
      reasons.push(`in ${framework} package`);
    }
  }
  
  // 7. Dependency analysis (what this symbol uses)
  const dependencies = memoryIndex.findUsages(symbol.fqn);
  if (dependencies.length > 0) {
    // Check if this symbol depends on framework classes
    for (const dep of dependencies) {
      const depLower = dep.toFqn.toLowerCase();
      for (const framework of queryAnalysis.frameworks) {
        if (depLower.includes(framework)) {
          score += 10;
          if (!context.includes('uses ' + framework)) {
            context += `Uses ${framework} API. `;
          }
          break;
        }
      }
    }
  }
  
  // 8. Boost for public API methods
  if (symbol.modifiers && symbol.modifiers.includes('public') && symbol.kind === 'method') {
    score += 5;
  }
  
  // 9. Penalize test code unless explicitly searching for tests
  if (!queryAnalysis.intent.includes('test') && 
      (packageLower.includes('test') || symbolNameLower.includes('test'))) {
    score -= 20;
  }
  
  return {
    symbol,
    score: Math.min(100, score),
    reasons,
    context
  };
}

/**
 * Score framework relevance for a symbol
 */
function scoreFrameworkRelevance(symbol: SymbolStub, framework: string, memoryIndex: MemoryIndex): number {
  let score = 0;
  const fqnLower = symbol.fqn.toLowerCase();
  const nameLower = symbol.name.toLowerCase();
  const signatureLower = (symbol.signature || '').toLowerCase();
  
  switch (framework) {
    case 'hibernate':
      if (fqnLower.includes('hibernate') || fqnLower.includes('org.hibernate')) score += 50;
      if (nameLower.includes('session') || nameLower.includes('hibernate')) score += 30;
      if (signatureLower.includes('session') || signatureLower.includes('sessionfactory')) score += 25;
      // Check if it uses Hibernate classes
      const refs = memoryIndex.findUsages(symbol.fqn);
      if (refs.some(r => r.toFqn.toLowerCase().includes('hibernate'))) score += 20;
      break;
      
    case 'spring':
      if (fqnLower.includes('spring') || fqnLower.includes('springframework')) score += 50;
      // Check for Spring stereotypes
      if (symbol.modifiers) {
        const hasSpringAnnotation = ['service', 'repository', 'controller', 'component', 'bean']
          .some(ann => symbol.modifiers!.some(m => m.toLowerCase().includes(ann)));
        if (hasSpringAnnotation) score += 40;
      }
      if (nameLower.includes('service') || nameLower.includes('repository') || 
          nameLower.includes('controller')) score += 20;
      break;
      
    case 'jpa':
      if (fqnLower.includes('jpa') || fqnLower.includes('javax.persistence') || 
          fqnLower.includes('jakarta.persistence')) score += 50;
      if (nameLower.includes('entity') || nameLower.includes('repository')) score += 30;
      if (signatureLower.includes('entitymanager')) score += 35;
      break;
      
    case 'jdbc':
      if (nameLower.includes('connection') || nameLower.includes('statement') || 
          nameLower.includes('resultset')) score += 40;
      if (signatureLower.includes('connection') || signatureLower.includes('statement')) score += 30;
      break;
  }
  
  return score;
}

/**
 * Score based on detected intent
 */
function scoreIntent(symbol: SymbolStub, intent: string): number {
  const nameLower = symbol.name.toLowerCase();
  const signatureLower = (symbol.signature || '').toLowerCase();
  
  switch (intent) {
    case 'object creation':
      if (nameLower.includes('create') || nameLower.includes('build') || 
          nameLower.includes('new') || nameLower.startsWith('get')) return 30;
      if (symbol.kind === 'constructor') return 25;
      break;
      
    case 'data persistence':
      if (nameLower.includes('save') || nameLower.includes('persist') || 
          nameLower.includes('insert') || nameLower.includes('store')) return 40;
      break;
      
    case 'data retrieval':
      if (nameLower.includes('find') || nameLower.includes('get') || 
          nameLower.includes('load') || nameLower.includes('retrieve') || 
          nameLower.includes('fetch') || nameLower.startsWith('get')) return 35;
      break;
      
    case 'data deletion':
      if (nameLower.includes('delete') || nameLower.includes('remove')) return 40;
      break;
      
    case 'data modification':
      if (nameLower.includes('update') || nameLower.includes('modify') || 
          nameLower.includes('change') || nameLower.includes('set')) return 35;
      break;
      
    case 'transaction management':
      if (nameLower.includes('transaction') || nameLower.includes('commit') || 
          nameLower.includes('rollback') || nameLower.includes('begin')) return 40;
      if (signatureLower.includes('transaction')) return 30;
      break;
      
    case 'validation':
      if (nameLower.includes('validate') || nameLower.includes('check') || 
          nameLower.includes('verify') || nameLower.startsWith('is')) return 35;
      break;
  }
  
  return 0;
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}
