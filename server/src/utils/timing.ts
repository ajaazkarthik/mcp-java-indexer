/**
 * Timing utility for measuring and formatting tool execution time
 */

export interface TimedResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Wraps a tool handler function to measure its execution time and append timing info to the result
 * 
 * @param handler - The async tool handler function to measure
 * @returns A wrapped function that adds timing information to the result
 */
export function withTiming<T extends any[], R extends TimedResult>(
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now();
    const result = await handler(...args);
    const duration = Date.now() - startTime;
    
    // Format timing: "Time taken: X.XXs" or "X.XXXs" if under 1s
    const timeStr = duration < 1000 
      ? `${duration}ms` 
      : `${(duration / 1000).toFixed(2)}s`;
    
    // Append timing to the text content
    if (result.content && result.content.length > 0 && result.content[0].type === 'text') {
      const originalText = result.content[0].text;
      result.content[0].text = `${originalText}

⏱️ **Time taken**: ${timeStr}`;
    }
    
    return result;
  };
}
