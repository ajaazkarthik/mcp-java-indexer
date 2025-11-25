/**
 * Tool Annotations for MCP Java Indexer
 * 
 * These annotations help AI agents understand tool behavior:
 * - readOnlyHint: Tool doesn't modify state
 * - idempotentHint: Same inputs produce same outputs (safe to retry)
 * - destructiveHint: Tool may destroy/overwrite data
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool annotations for agent safety and behavior hints
 */
export interface ToolAnnotations {
  /** Tool only reads data, doesn't modify anything */
  readOnlyHint?: boolean;
  /** Same inputs always produce same outputs (safe to retry) */
  idempotentHint?: boolean;
  /** Tool may destroy or overwrite data */
  destructiveHint?: boolean;
  /** Tool may take a long time to complete */
  longRunningHint?: boolean;
}

/**
 * Extended tool definition with annotations
 */
export interface AnnotatedTool extends Tool {
  annotations?: ToolAnnotations;
}

/**
 * Annotations for all tools in the indexer
 */
export const toolAnnotations: Record<string, ToolAnnotations> = {
  // Index Management
  index_project: {
    readOnlyHint: false,
    idempotentHint: true,  // Re-indexing same project gives same result
    destructiveHint: false,
    longRunningHint: true
  },
  reindex_file: {
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: false
  },
  compact_index: {
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: false  // Only cleans up, doesn't lose data
  },

  // Pure Analysis Tools (Read-Only)
  find_symbol: {
    readOnlyHint: true,
    idempotentHint: true
  },
  find_usages: {
    readOnlyHint: true,
    idempotentHint: true
  },
  call_graph: {
    readOnlyHint: true,
    idempotentHint: true
  },
  goto_definition: {
    readOnlyHint: true,
    idempotentHint: true
  },
  search_text: {
    readOnlyHint: true,
    idempotentHint: true
  },
  semantic_search: {
    readOnlyHint: true,
    idempotentHint: true
  },
  explain_code: {
    readOnlyHint: true,
    idempotentHint: true
  },
  analyze_impact: {
    readOnlyHint: true,
    idempotentHint: true
  },
  test_coverage: {
    readOnlyHint: true,
    idempotentHint: true
  },
  refactoring_suggestions: {
    readOnlyHint: true,
    idempotentHint: true
  },
  code_generation: {
    readOnlyHint: true,  // Generates suggestions, doesn't write files
    idempotentHint: true
  }
};

/**
 * Add annotations to a tool definition
 */
export function annotateTools(tools: Tool[]): AnnotatedTool[] {
  return tools.map(tool => ({
    ...tool,
    annotations: toolAnnotations[tool.name] || { readOnlyHint: true }
  }));
}
