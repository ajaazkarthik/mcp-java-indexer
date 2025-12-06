import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
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

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
}

interface WorkerProcess {
  process: ChildProcess;
  messageBuffer: string;
  pendingRequests: Map<number, PendingRequest>;
  nextRequestId: number;
}

export class IndexerClient {
  private javaProcess: ChildProcess | null = null;
  private messageBuffer: string = '';
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private nextRequestId: number = 1;
  private startPromise: Promise<void> | null = null;
  private readonly REQUEST_TIMEOUT = 600000; // 10 minutes
  private readonly MAX_BUFFER_SIZE = 500 * 1024 * 1024; // 500MB max buffer - increased for large projects
  
  // Parallel processing support
  private parallelWorkers: WorkerProcess[] = [];
  // Default to 8 workers but respect CPU count and environment overrides
  private numWorkers = (() => {
    const defaultWorkers = 8;
    const env = process.env.MCP_INDEXER_WORKERS || process.env.INDEXER_WORKER_COUNT;
    const requested = env ? parseInt(env, 10) : defaultWorkers;
    return Math.max(1, Math.min(requested, Math.max(1, os.cpus().length - 1)));
  })();
  private useParallel = true;
  private javaIndexerJar: string = '';
  private javaExec: string = 'java';

  constructor() {}

  // Start Java indexer process
  async start(): Promise<void> {
    // Idempotent start: if already starting or running, reuse existing processes
    if (this.startPromise) {
      return this.startPromise;
    }
    if (this.javaProcess) {
      return;
    }

    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
    } finally {
      // Allow future restarts if the process exits
      this.startPromise = null;
    }
  }

  private async startInternal(): Promise<void> {
    // Use __dirname to get the directory of this module, then navigate to the jar
    this.javaIndexerJar = path.join(__dirname, '..', '..', 'java-indexer', 'target', 'java-indexer-1.0.0.jar');
    // Respect an explicit path to java executable if provided
    const envJavaPath = process.env.MCP_JAVA_PATH || process.env.INDEXER_JAVA_PATH;
    const javaHome = process.env.JAVA_HOME;
    let javaExec = 'java';
    if (envJavaPath && envJavaPath.trim().length > 0) {
      javaExec = envJavaPath;
    } else if (javaHome && javaHome.trim().length > 0) {
      javaExec = path.join(javaHome, 'bin', 'java');
    } else {
      // Try to detect that 'java' on PATH is Java 17 or later
      try {
        const { spawnSync } = await import('child_process');
        const r = spawnSync('java', ['-version']);
        const stderr = (r.stderr || r.stdout || Buffer.from('')).toString();
        const match = stderr.match(/version \"?(\d+)(?:\.|\D)/);
        if (match && parseInt(match[1], 10) >= 17) {
          javaExec = 'java';
        } else {
          // Try common Windows JDK17 paths if they exist
          const candidates = [
            'D:/workspace/software/jdk-17.0.17/bin/java',
            'C:/Program Files/Eclipse Adoptium/jdk-17/bin/java',
            'C:/Program Files/Java/jdk-17/bin/java'
          ];
          let found = false;
          const { stat } = await import('fs/promises');
          for (const candidate of candidates) {
            try {
              await stat(candidate);
              javaExec = candidate;
              found = true;
              break;
            } catch {
              // Try next candidate
            }
          }
          if (!found) {
            // Fallback to 'java' and warn
            console.warn('[IndexerClient] Java binary on PATH is not Java 17; consider setting MCP_JAVA_PATH to a JDK 17 binary. Falling back to PATH `java`.');
            javaExec = 'java';
          }
        }
      } catch (err) {
        console.warn('[IndexerClient] Java version detection failed; falling back to PATH `java`.', err);
        javaExec = 'java';
      }
    }
    
    // Add JVM optimization flags for better performance
    this.javaExec = javaExec;
    this.javaProcess = spawn(this.javaExec, [
      '-Xmx4g',                        // 4GB heap
      '-XX:+UseG1GC',                  // G1 garbage collector
      '-XX:+UseStringDeduplication',   // Reduce string memory
      `-XX:ParallelGCThreads=${Math.max(1, Math.min(os.cpus().length, this.numWorkers))}`,
      '-jar', this.javaIndexerJar
    ], {
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
    
    // Start parallel workers for multi-core indexing (once)
    if (this.useParallel && this.numWorkers > 1 && this.parallelWorkers.length === 0) {
      await this.startParallelWorkers();
    }
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
    // Small batches or no workers - use main process only
    if (this.parallelWorkers.length === 0 || filePaths.length <= 50) {
      const result = await this.sendRequest('indexFiles', { filePaths, sourceRoots });
      return result;
    }
    
    // Split work across all processes (main + workers) for parallel indexing
    const allProcesses = [
      { send: (files: string[]) => this.sendRequest('indexFiles', { filePaths: files, sourceRoots }) },
      ...this.parallelWorkers.map(w => ({
        send: (files: string[]) => this.sendWorkerRequest(w, 'indexFiles', { filePaths: files, sourceRoots })
      }))
    ];
    
    const chunks = this.splitIntoChunks(filePaths, allProcesses.length);
    
    console.error(`⚡ Parallel indexing: ${filePaths.length} files across ${allProcesses.length} processes`);
    
    const results = await Promise.all(
      chunks.map((chunk, i) => chunk.length === 0 ? Promise.resolve([]) : allProcesses[i].send(chunk))
    );
    
    return results.flat();
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
    this.startPromise = null;
    // Stop parallel workers first
    for (const worker of this.parallelWorkers) {
      this.rejectWorkerPending(worker, 'Stopping');
      worker.process.kill();
    }
    this.parallelWorkers = [];
    
    // Stop main process
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
      bufferSize: this.messageBuffer.length,
      parallelWorkers: this.parallelWorkers.length
    };
  }
  
  // === Parallel Processing Methods ===
  
  private async startParallelWorkers(): Promise<void> {
    console.error(`🚀 Starting ${this.numWorkers - 1} additional parallel workers...`);
    
    for (let i = 0; i < this.numWorkers - 1; i++) {
      const worker: WorkerProcess = {
        process: spawn(this.javaExec, [
          '-Xmx4g', '-XX:+UseG1GC', '-XX:+UseStringDeduplication',
          `-XX:ParallelGCThreads=${Math.max(1, Math.min(os.cpus().length, this.numWorkers))}`, '-jar', this.javaIndexerJar
        ], { stdio: ['pipe', 'pipe', 'pipe'] }),
        messageBuffer: '',
        pendingRequests: new Map(),
        nextRequestId: 1
      };
      
      worker.process.stdout!.on('data', (data: Buffer) => {
        worker.messageBuffer += data.toString();
        this.processWorkerMessages(worker);
      });
      
      worker.process.stderr!.on('data', (data: Buffer) => {
        console.error(`[Java Worker ${i}]`, data.toString());
      });
      
      worker.process.on('exit', (code) => {
        console.error(`Java worker ${i} exited with code ${code}`);
        this.rejectWorkerPending(worker, `Worker exited with code ${code}`);
      });
      
      worker.process.on('error', (error) => {
        console.error(`Java worker ${i} error:`, error);
        this.rejectWorkerPending(worker, error.message);
      });
      
      this.parallelWorkers.push(worker);
    }
    
    // Wait for workers to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.error(`✅ ${this.numWorkers} total indexer processes ready`);
  }
  
  private processWorkerMessages(worker: WorkerProcess): void {
    const lines = worker.messageBuffer.split('\n');
    worker.messageBuffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        const pending = worker.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timeout);
          worker.pendingRequests.delete(response.id);
          response.error ? pending.reject(new Error(response.error)) : pending.resolve(response.result);
        }
      } catch {
        // Ignore parse errors for non-JSON output
      }
    }
  }
  
  private async sendWorkerRequest(worker: WorkerProcess, method: string, params: any): Promise<any> {
    const id = worker.nextRequestId++;
    const request = { id, method, params };
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.pendingRequests.delete(id);
        reject(new Error('Worker request timeout'));
      }, this.REQUEST_TIMEOUT);
      
      worker.pendingRequests.set(id, { resolve, reject, timeout });
      worker.process.stdin!.write(JSON.stringify(request) + '\n');
    });
  }
  
  private rejectWorkerPending(worker: WorkerProcess, reason: string): void {
    for (const [, pending] of worker.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    worker.pendingRequests.clear();
  }
  
  private splitIntoChunks<T>(array: T[], n: number): T[][] {
    const chunks: T[][] = Array.from({ length: n }, () => []);
    array.forEach((item, i) => chunks[i % n].push(item));
    return chunks;
  }
}
