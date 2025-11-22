import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SymbolStub, Reference } from './memory-index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IndexResult {
  file: string;
  symbols: SymbolStub[];
  references: Reference[];
  error?: string;
}

export class IndexerClient {
  private javaProcess: ChildProcess | null = null;
  private messageBuffer: string = '';
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();
  private nextRequestId: number = 1;

  constructor() {}

  // Start Java indexer process
  async start(): Promise<void> {
    // Use __dirname to get the directory of this module, then navigate to the jar
    const javaIndexerJar = path.join(__dirname, '..', '..', 'java-indexer', 'target', 'java-indexer-1.0.0.jar');
    
    this.javaProcess = spawn('java', ['-jar', javaIndexerJar], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle stdout (JSON responses)
    this.javaProcess.stdout!.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString();
      this.processMessages();
    });

    // Handle stderr (logs)
    this.javaProcess.stderr!.on('data', (data: Buffer) => {
      console.error('[Java Indexer]', data.toString());
    });

    // Handle exit
    this.javaProcess.on('exit', (code) => {
      console.error(`Java indexer exited with code ${code}`);
      this.javaProcess = null;
    });

    // Wait for ready signal
    await this.waitForReady();
  }

  private async waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      const checkReady = () => {
        if (this.javaProcess && this.javaProcess.stdout) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }

  // Process incoming messages
  private processMessages(): void {
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line);
        const pending = this.pendingRequests.get(response.id);
        
        if (pending) {
          this.pendingRequests.delete(response.id);
          
          if (response.error) {
            pending.reject(new Error(response.error));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch (error) {
        console.error('Failed to parse Java response:', line, error);
      }
    }
  }

  // Send request to Java process
  private async sendRequest(method: string, params: any): Promise<any> {
    if (!this.javaProcess || !this.javaProcess.stdin) {
      throw new Error('Java indexer process not started');
    }

    const id = this.nextRequestId++;
    const request = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify(request) + '\n';
      this.javaProcess!.stdin!.write(message);

      // Timeout after 5 minutes (for large batches)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 300000);
    });
  }

  // Index a single file
  async indexFile(filePath: string, sourceRoots: string[]): Promise<IndexResult> {
    const result = await this.sendRequest('indexFile', { filePath, sourceRoots });
    return result;
  }

  // Index multiple files
  async indexFiles(filePaths: string[], sourceRoots: string[]): Promise<IndexResult[]> {
    const result = await this.sendRequest('indexFiles', { filePaths, sourceRoots });
    return result;
  }

  // Resolve type information
  async resolveType(typeName: string, context: string, sourceRoots: string[]): Promise<string | null> {
    const result = await this.sendRequest('resolveType', { typeName, context, sourceRoots });
    return result;
  }

  // Stop the process
  async stop(): Promise<void> {
    if (this.javaProcess) {
      this.javaProcess.kill();
      this.javaProcess = null;
    }
  }
}
