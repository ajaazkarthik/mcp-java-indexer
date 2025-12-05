/**
 * Timer utility for measuring tool execution time
 */

export interface TimerResult<T> {
  result: T;
  elapsedMs: number;
  elapsedFormatted: string;
}

/**
 * Format milliseconds to a human-readable string
 */
export function formatElapsed(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Execute a function and measure its execution time
 */
export async function withTimer<T>(fn: () => Promise<T>): Promise<TimerResult<T>> {
  const startTime = Date.now();
  const result = await fn();
  const elapsedMs = Date.now() - startTime;
  const elapsedFormatted = formatElapsed(elapsedMs);
  
  return {
    result,
    elapsedMs,
    elapsedFormatted
  };
}

/**
 * Add timing information to tool result
 */
export function addTimingToResult(
  result: { content: Array<{ type: string; text?: string }> },
  toolName: string,
  elapsedFormatted: string
): void {
  if (result.content && result.content.length > 0 && result.content[0].type === 'text' && result.content[0].text) {
    const timerPrefix = `⏱️ \`${toolName}\` completed in **${elapsedFormatted}**\n\n`;
    result.content[0].text = timerPrefix + result.content[0].text;
  }
}
