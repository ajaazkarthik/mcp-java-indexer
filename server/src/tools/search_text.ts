import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';
import * as fs from 'fs/promises';

export const searchTextTool: Tool = {
  name: 'search_text',
  description: 'Search for a text pattern in indexed Java files. Returns matching lines with file locations. Use regex for powerful pattern matching (e.g., "class.*Service" to find all Service classes).',
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
        description: 'Maximum number of results to return. Default: 200 (increased from 50 for better coverage)'
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
  const maxResults = (args.maxResults as number) || 200; // Increased default for better coverage

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

    // Search through files - collect ALL matches first, then truncate
    const results: Array<{ file: string; line: number; content: string }> = [];
    let filesSearched = 0;
    let totalFiles = files.length;

    for (const fileInfo of files) {
      filesSearched++;
      if (filesSearched % 64 === 0) {
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      try {
        const content = await fs.readFile(fileInfo.path, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          // Create new regex for each line to avoid lastIndex issues
          const lineRegex = new RegExp(pattern, 'gi');
          if (lineRegex.test(lines[i])) {
            results.push({
              file: fileInfo.path,
              line: i + 1,
              content: lines[i].trim()
            });
          }
        }
        
        // Don't break early - search all files unless we have too many results
        if (results.length >= maxResults * 2) {
          // Only stop if we have way more than maxResults
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
          text: `No matches found for pattern: ${pattern}

Searched ${filesSearched} file${filesSearched > 1 ? 's' : ''}.

💡 Tips:
- Try simpler patterns (e.g., "Service" instead of "class.*Service")
- Use isRegex: true for regex patterns
- Check if files are indexed (use index_project first)`
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

    // Truncate to maxResults
    const displayResults = results.slice(0, maxResults);
    const truncated = results.length > maxResults;

    // Format results
    const sections: string[] = [];
    sections.push(`Found ${results.length} match${results.length > 1 ? 'es' : ''} for "${pattern}" in ${byFile.size} file${byFile.size > 1 ? 's' : ''}${truncated ? ` (showing first ${maxResults})` : ''}`);
    sections.push(`Searched: ${filesSearched}/${totalFiles} files`);
    sections.push('');

    // Group display results by file
    const displayByFile = new Map<string, typeof displayResults>();
    for (const result of displayResults) {
      if (!displayByFile.has(result.file)) {
        displayByFile.set(result.file, []);
      }
      displayByFile.get(result.file)!.push(result);
    }

    for (const [file, matches] of displayByFile) {
      sections.push(`📁 **${file}** (${matches.length} match${matches.length > 1 ? 'es' : ''})`);
      
      for (const match of matches.slice(0, 10)) { // Limit per file to keep output manageable
        sections.push(`  Line ${match.line}: ${match.content}`);
      }
      
      if (matches.length > 10) {
        sections.push(`  ... and ${matches.length - 10} more matches in this file`);
      }
      
      sections.push('');
    }

    if (truncated) {
      sections.push(`⚠️ Showing first ${maxResults} of ${results.length} total matches.`);
      sections.push(`Use maxResults parameter to see more (e.g., maxResults: ${results.length}).`);
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
