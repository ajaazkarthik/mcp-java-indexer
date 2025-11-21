import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryIndex } from './memory-index.js';

export class Persistence {
  private indexDir: string;

  constructor(indexDir: string) {
    this.indexDir = indexDir;
  }

  // Ensure index directory exists
  async ensureIndexDir(): Promise<void> {
    try {
      await fs.mkdir(this.indexDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create index directory:', error);
    }
  }

  // Save index to disk
  async save(memoryIndex: MemoryIndex): Promise<void> {
    await this.ensureIndexDir();

    const data = memoryIndex.toJSON();
    const filePath = path.join(this.indexDir, 'index.json');

    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save index:', error);
      throw error;
    }
  }

  // Load index from disk
  async load(memoryIndex: MemoryIndex): Promise<boolean> {
    const filePath = path.join(this.indexDir, 'index.json');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      memoryIndex.fromJSON(data);
      return true;
    } catch (error) {
      // Index file doesn't exist or is corrupted
      return false;
    }
  }

  // Check if index exists
  async exists(): Promise<boolean> {
    const filePath = path.join(this.indexDir, 'index.json');
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Clear index
  async clear(): Promise<void> {
    const filePath = path.join(this.indexDir, 'index.json');
    
    try {
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist, ignore
    }
  }
}
