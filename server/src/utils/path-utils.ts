/**
 * Path normalization utilities for cross-platform compatibility
 * 
 * CRITICAL: On Windows, file paths are case-insensitive but JavaScript
 * Maps/Sets are case-sensitive. This module ensures consistent path
 * handling across all platforms.
 * 
 * BUG FIX: Prior versions only converted backslashes to forward slashes
 * but didn't normalize case. This caused incremental indexing to fail
 * on Windows because paths like "D:/Project/File.java" and 
 * "d:/project/file.java" were treated as different files.
 */

import * as path from 'path';

/**
 * Normalize a file path for consistent storage and lookup.
 * 
 * - Converts backslashes to forward slashes
 * - On Windows: converts to lowercase for case-insensitive comparison
 * - On Unix/Mac: preserves case (filesystems are case-sensitive)
 * 
 * Use this for ALL path storage and lookups in Maps/Sets.
 * 
 * @param filePath The file path to normalize
 * @returns Normalized path suitable for map keys and comparisons
 */
export function normalizePath(filePath: string): string {
  // Convert backslashes to forward slashes
  const normalized = filePath.replace(/\\/g, '/');
  
  // On Windows, normalize to lowercase for case-insensitive comparison
  // Windows file system is case-insensitive, but JS Maps are case-sensitive
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * Normalize a file path to an absolute path with consistent format.
 * 
 * - Resolves to absolute path using path.resolve()
 * - Converts backslashes to forward slashes
 * - On Windows: converts to lowercase for case-insensitive comparison
 * 
 * Use this when you need both normalization AND absolute path resolution.
 * 
 * @param filePath The file path to normalize (relative or absolute)
 * @returns Normalized absolute path
 */
export function normalizeAbsolutePath(filePath: string): string {
  return normalizePath(path.resolve(filePath));
}

/**
 * Check if two paths are equal after normalization.
 * 
 * @param path1 First path to compare
 * @param path2 Second path to compare
 * @returns true if paths are equal after normalization
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePath(path1) === normalizePath(path2);
}

/**
 * Check if a path starts with a base path (after normalization).
 * 
 * @param filePath The file path to check
 * @param basePath The base path that filePath should start with
 * @returns true if filePath starts with basePath after normalization
 */
export function pathStartsWith(filePath: string, basePath: string): boolean {
  const normalizedFile = normalizePath(filePath);
  const normalizedBase = normalizePath(basePath);
  return normalizedFile.startsWith(normalizedBase);
}
