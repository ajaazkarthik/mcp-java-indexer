/**
 * Advanced Symbol Resolver
 * Handles fuzzy matching, partial names, method signature variations, and framework patterns
 */

import { MemoryIndex, SymbolStub } from './memory-index.js';

export interface ResolvedSymbol {
  symbol: SymbolStub;
  confidence: number; // 0-100
  matchReason: string;
}

export class SymbolResolver {
  constructor(private memoryIndex: MemoryIndex) {}

  /**
   * Intelligently resolve a symbol from various input formats:
   * - Full FQN: "com.example.UserService"
   * - Simple name: "UserService"
   * - Method with params: "UserService.save(User)"
   * - Method without params: "UserService.save"
   * - Partial match: "User" → finds "UserService", "UserRepository", etc.
   */
  resolveSymbol(query: string): ResolvedSymbol[] {
    const results: ResolvedSymbol[] = [];

    // 1. Try exact FQN match (highest confidence)
    const exactMatch = this.memoryIndex.getSymbol(query);
    if (exactMatch) {
      results.push({
        symbol: exactMatch,
        confidence: 100,
        matchReason: 'Exact FQN match'
      });
      return results;
    }

    // 2. Try method signature variations (method name with/without params)
    const methodMatches = this.resolveMethodSignature(query);
    results.push(...methodMatches);

    // 3. Try simple class/interface name
    const simpleNameMatches = this.resolveSimpleName(query);
    results.push(...simpleNameMatches);

    // 4. Try partial matching (e.g., "User" → "UserService", "UserRepository")
    const partialMatches = this.resolvePartialMatch(query);
    results.push(...partialMatches);

    // 5. Try package-qualified partial matches (e.g., "service.UserService")
    const packagePartialMatches = this.resolvePackagePartial(query);
    results.push(...packagePartialMatches);

    // Deduplicate and sort by confidence
    const seen = new Set<string>();
    const unique = results.filter(r => {
      if (seen.has(r.symbol.fqn)) return false;
      seen.add(r.symbol.fqn);
      return true;
    });

    unique.sort((a, b) => b.confidence - a.confidence);

    return unique;
  }

  /**
   * Resolve method signatures with flexible parameter matching
   */
  private resolveMethodSignature(query: string): ResolvedSymbol[] {
    const results: ResolvedSymbol[] = [];

    // Check if it looks like a method call
    if (!query.includes('(')) {
      // Try adding empty params: "ClassName.methodName" → "ClassName.methodName()"
      const withParens = query + '()';
      const exactMethod = this.memoryIndex.getSymbol(withParens);
      if (exactMethod) {
        results.push({
          symbol: exactMethod,
          confidence: 90,
          matchReason: 'Method name match (no-arg constructor assumed)'
        });
      }
    }

    // Extract class and method name
    const methodPattern = /^(.+)\.([^.]+)\(([^)]*)\)$/;
    const match = query.match(methodPattern);
    
    if (match) {
      const [, className, methodName, params] = match;
      
      // Find the class first
      const classMatches = this.resolveSimpleName(className);
      
      for (const classMatch of classMatches) {
        // Find all methods in this class with matching name
        const allSymbols = Array.from(this.memoryIndex.getAllSymbols().values());
        const methods = allSymbols.filter(s => 
          s.kind === 'method' &&
          s.declaringClass === classMatch.symbol.fqn &&
          s.name === methodName
        );

        for (const method of methods) {
          // Calculate confidence based on parameter matching
          const confidence = this.calculateMethodConfidence(method, params);
          if (confidence > 0) {
            results.push({
              symbol: method,
              confidence: confidence * 0.9, // Slightly reduce for fuzzy matching
              matchReason: `Method match in ${classMatch.symbol.name} (param similarity)`
            });
          }
        }
      }
    }

    // Also try without params: "ClassName.methodName"
    const simpleMethodPattern = /^(.+)\.([^.]+)$/;
    const simpleMatch = query.match(simpleMethodPattern);
    
    if (simpleMatch) {
      const [, className, methodName] = simpleMatch;
      const classMatches = this.resolveSimpleName(className);
      
      for (const classMatch of classMatches) {
        const allSymbols = Array.from(this.memoryIndex.getAllSymbols().values());
        const methods = allSymbols.filter(s => 
          s.kind === 'method' &&
          s.declaringClass === classMatch.symbol.fqn &&
          s.name === methodName
        );

        for (const method of methods) {
          results.push({
            symbol: method,
            confidence: 75,
            matchReason: `Method name match in ${classMatch.symbol.name}`
          });
        }
      }
    }

    return results;
  }

  /**
   * Calculate confidence for method parameter matching
   */
  private calculateMethodConfidence(method: SymbolStub, queryParams: string): number {
    if (!method.signature) return 50;

    // Extract parameter types from signature
    const sigMatch = method.signature.match(/\(([^)]*)\)/);
    if (!sigMatch) return 50;

    const methodParams = sigMatch[1].split(',').map(p => p.trim()).filter(p => p);
    const queryParamList = queryParams.split(',').map(p => p.trim()).filter(p => p);

    // Empty params on both sides = 100% match
    if (methodParams.length === 0 && queryParamList.length === 0) return 100;

    // Different param count = lower confidence but not zero (overloads)
    if (methodParams.length !== queryParamList.length) return 40;

    // Compare parameter types
    let matches = 0;
    for (let i = 0; i < methodParams.length; i++) {
      const methodParam = methodParams[i].split(' ').pop() || '';
      const queryParam = queryParamList[i];

      if (this.paramTypesMatch(methodParam, queryParam)) {
        matches++;
      }
    }

    // Calculate confidence based on match ratio
    if (methodParams.length === 0) return 100;
    const ratio = matches / methodParams.length;
    return Math.round(ratio * 100);
  }

  /**
   * Check if two parameter types match (handles simple name vs FQN)
   */
  private paramTypesMatch(methodParam: string, queryParam: string): boolean {
    // Exact match
    if (methodParam === queryParam) return true;

    // Simple name match (e.g., "User" matches "com.example.User")
    const methodSimple = methodParam.split('.').pop() || '';
    const querySimple = queryParam.split('.').pop() || '';
    if (methodSimple === querySimple) return true;

    // Case-insensitive match
    if (methodSimple.toLowerCase() === querySimple.toLowerCase()) return true;

    return false;
  }

  /**
   * Resolve by simple class name
   */
  private resolveSimpleName(query: string): ResolvedSymbol[] {
    const results: ResolvedSymbol[] = [];
    const allSymbols = Array.from(this.memoryIndex.getAllSymbols().values());

    // Exact simple name match
    const exactMatches = allSymbols.filter(s => 
      (s.kind === 'class' || s.kind === 'interface' || s.kind === 'enum') &&
      s.name === query
    );

    for (const symbol of exactMatches) {
      results.push({
        symbol,
        confidence: 85,
        matchReason: 'Exact class name match'
      });
    }

    // Case-insensitive match
    const caseInsensitiveMatches = allSymbols.filter(s => 
      (s.kind === 'class' || s.kind === 'interface' || s.kind === 'enum') &&
      s.name.toLowerCase() === query.toLowerCase() &&
      !exactMatches.includes(s)
    );

    for (const symbol of caseInsensitiveMatches) {
      results.push({
        symbol,
        confidence: 80,
        matchReason: 'Case-insensitive class name match'
      });
    }

    return results;
  }

  /**
   * Resolve by partial matching
   */
  private resolvePartialMatch(query: string): ResolvedSymbol[] {
    const results: ResolvedSymbol[] = [];
    const allSymbols = Array.from(this.memoryIndex.getAllSymbols().values());
    const queryLower = query.toLowerCase();

    // Find symbols where name contains query
    const partialMatches = allSymbols.filter(s => 
      s.name.toLowerCase().includes(queryLower)
    );

    for (const symbol of partialMatches) {
      // Higher confidence if query is at start of name
      const startsWithQuery = symbol.name.toLowerCase().startsWith(queryLower);
      const confidence = startsWithQuery ? 70 : 60;

      results.push({
        symbol,
        confidence,
        matchReason: startsWithQuery ? 'Name starts with query' : 'Partial name match'
      });
    }

    return results;
  }

  /**
   * Resolve package-qualified partial matches
   */
  private resolvePackagePartial(query: string): ResolvedSymbol[] {
    const results: ResolvedSymbol[] = [];
    
    if (!query.includes('.')) return results;

    const allSymbols = Array.from(this.memoryIndex.getAllSymbols().values());
    const queryLower = query.toLowerCase();

    // Find symbols where FQN ends with query
    const matches = allSymbols.filter(s => 
      s.fqn.toLowerCase().endsWith(queryLower)
    );

    for (const symbol of matches) {
      results.push({
        symbol,
        confidence: 75,
        matchReason: 'Package-qualified partial match'
      });
    }

    return results;
  }

  /**
   * Smart resolution with user-friendly output
   */
  async resolveWithFeedback(query: string): Promise<{
    resolved: ResolvedSymbol[];
    suggestion: string;
  }> {
    const resolved = this.resolveSymbol(query);

    let suggestion = '';

    if (resolved.length === 0) {
      suggestion = `No symbols found for "${query}". Try:\n` +
        `- Use simpler class name (e.g., "UserService" instead of full package)\n` +
        `- Check spelling\n` +
        `- Use find_symbol tool to search first`;
    } else if (resolved.length === 1) {
      suggestion = `✅ Found exact match: ${resolved[0].symbol.fqn}`;
    } else if (resolved[0].confidence >= 90) {
      suggestion = `✅ High confidence match: ${resolved[0].symbol.fqn}\n` +
        `${resolved.length - 1} other potential matches available.`;
    } else {
      suggestion = `Found ${resolved.length} potential matches:\n` +
        resolved.slice(0, 5).map((r, i) => 
          `${i + 1}. ${r.symbol.fqn} (${r.confidence}% - ${r.matchReason})`
        ).join('\n');
      
      if (resolved.length > 5) {
        suggestion += `\n... and ${resolved.length - 5} more`;
      }
    }

    return { resolved, suggestion };
  }

  /**
   * Get best match (highest confidence)
   */
  getBestMatch(query: string): SymbolStub | null {
    const resolved = this.resolveSymbol(query);
    return resolved.length > 0 ? resolved[0].symbol : null;
  }

  /**
   * Resolve with automatic disambiguation for tools
   */
  resolveForTool(query: string, preferKind?: string): {
    symbol: SymbolStub | null;
    alternatives: ResolvedSymbol[];
    message: string;
  } {
    const resolved = this.resolveSymbol(query);

    if (resolved.length === 0) {
      return {
        symbol: null,
        alternatives: [],
        message: `Symbol not found: "${query}"\n\nTip: Use find_symbol to search, or provide more context (e.g., package name).`
      };
    }

    // Filter by preferred kind if specified
    let filtered = resolved;
    if (preferKind) {
      const kindMatches = resolved.filter(r => r.symbol.kind === preferKind);
      if (kindMatches.length > 0) {
        filtered = kindMatches;
      }
    }

    // If high confidence match (>= 85), use it automatically
    if (filtered[0].confidence >= 85) {
      return {
        symbol: filtered[0].symbol,
        alternatives: filtered.slice(1, 5),
        message: `✅ Resolved to: ${filtered[0].symbol.fqn} (${filtered[0].matchReason})`
      };
    }

    // Multiple ambiguous matches - provide alternatives
    if (filtered.length > 1) {
      return {
        symbol: filtered[0].symbol, // Use best match but warn
        alternatives: filtered.slice(1, 5),
        message: `⚠️ Ambiguous match. Using: ${filtered[0].symbol.fqn}\n\n` +
          `Other possibilities:\n` +
          filtered.slice(1, 4).map((r, i) => 
            `${i + 1}. ${r.symbol.fqn} (${r.confidence}%)`
          ).join('\n') +
          (filtered.length > 4 ? `\n... and ${filtered.length - 4} more` : '')
      };
    }

    // Single medium-confidence match
    return {
      symbol: filtered[0].symbol,
      alternatives: [],
      message: `Found: ${filtered[0].symbol.fqn} (${filtered[0].confidence}% confidence - ${filtered[0].matchReason})`
    };
  }
}
