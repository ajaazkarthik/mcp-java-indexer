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
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (error: any) => void; timeout: NodeJS.Timeout }> = new Map();
  private nextRequestId: number = 1;
  private readonly REQUEST_TIMEOUT = 600000; // 10 minutes
  private readonly MAX_BUFFER_SIZE = 500 * 1024 * 1024; // 500MB max buffer - increased for large projects

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
      
      // Process messages BEFORE checking buffer size to prevent premature rejection
      this.processMessages();
      
      // Only reject if buffer is still too large after processing (incomplete malformed data)
      if (this.messageBuffer.length > this.MAX_BUFFER_SIZE) {
        console.error(`Buffer overflow: ${Math.round(this.messageBuffer.length / 1024 / 1024)}MB - clearing incomplete data`);
        // Only clear the incomplete buffer, don't reject pending requests
        // The pending request will timeout naturally if no response comes
        this.messageBuffer = '';
      }
    });

    // Handle stderr (logs)
    this.javaProcess.stderr!.on('data', (data: Buffer) => {
      console.error('[Java Indexer]', data.toString());
    });

    // Handle exit
    this.javaProcess.on('exit', (code) => {
      console.error(`Java indexer exited with code ${code}`);
      this.rejectAllPending(`Java process exited with code ${code}`);
      this.javaProcess = null;
    });
    
    // Handle errors
    this.javaProcess.on('error', (error) => {
      console.error('Java indexer error:', error);
      this.rejectAllPending(error.message);
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
          clearTimeout(pending.timeout);
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
      // Create timeout
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout after ${this.REQUEST_TIMEOUT / 1000}s`));
        }
      }, this.REQUEST_TIMEOUT);
      
      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message = JSON.stringify(request) + '\n';
      this.javaProcess!.stdin!.write(message);
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

  // Reject all pending requests
  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }
  
  // Stop the process
  async stop(): Promise<void> {
    if (this.javaProcess) {
      this.rejectAllPending('IndexerClient stopped');
      this.javaProcess.kill();
      this.javaProcess = null;
    }
    this.messageBuffer = '';
  }
  
  // Get memory stats
  getMemoryStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      bufferSize: this.messageBuffer.length
    };
  }
}
