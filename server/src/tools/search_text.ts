import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';
import * as fs from 'fs/promises';

export const searchTextTool: Tool = {
  name: 'search_text',
  description: 'Search for a text pattern in indexed Java files. Returns matching lines with file locations.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Text pattern to search for (case-insensitive, supports regex)'
      },
      isRegex: {
        type: 'boolean',
        description: 'Whether the pattern is a regular expression. Default: false'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return. Default: 50'
      }
    },
    required: ['pattern']
  }
};

export async function handleSearchText(
  args: any,
  memoryIndex: MemoryIndex
) {
  const pattern = args.pattern as string;
  const isRegex = (args.isRegex as boolean) || false;
  const maxResults = (args.maxResults as number) || 50;

  try {
    const files = memoryIndex.getAllFiles();
    
    if (files.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No files indexed yet. Use index_project first.'
        }]
      };
    }

    // Create search regex
    let regex: RegExp;
    try {
      if (isRegex) {
        regex = new RegExp(pattern, 'gi');
      } else {
        // Escape special regex characters
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escaped, 'gi');
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Invalid regex pattern: ${pattern}`
        }],
        isError: true
      };
    }

    // Search through files
    const results: Array<{ file: string; line: number; content: string }> = [];

    for (const fileInfo of files) {
      try {
        const content = await fs.readFile(fileInfo.path, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({
              file: fileInfo.path,
              line: i + 1,
              content: lines[i].trim()
            });

            if (results.length >= maxResults) {
              break;
            }
          }
          
          // Reset regex lastIndex for global regex
          regex.lastIndex = 0;
        }

        if (results.length >= maxResults) {
          break;
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No matches found for pattern: ${pattern}`
        }]
      };
    }

    // Group by file
    const byFile = new Map<string, typeof results>();
    for (const result of results) {
      if (!byFile.has(result.file)) {
        byFile.set(result.file, []);
      }
      byFile.get(result.file)!.push(result);
    }

    // Format results
    const sections: string[] = [];
    sections.push(`Found ${results.length} match${results.length > 1 ? 'es' : ''} for "${pattern}" in ${byFile.size} file${byFile.size > 1 ? 's' : ''}:`);
    sections.push('');

    for (const [file, matches] of byFile) {
      sections.push(`📁 **${file}** (${matches.length} match${matches.length > 1 ? 'es' : ''})`);
      
      for (const match of matches) {
        sections.push(`  Line ${match.line}: ${match.content}`);
      }
      
      sections.push('');
    }

    if (results.length >= maxResults) {
      sections.push(`_Showing first ${maxResults} results. Use maxResults parameter to see more._`);
    }

    return {
      content: [{
        type: 'text',
        text: sections.join('\n')
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to search: ${errorMessage}`
      }],
      isError: true
    };
  }
}
