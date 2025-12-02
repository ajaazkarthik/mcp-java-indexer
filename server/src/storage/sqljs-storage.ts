/**
 * SQLite-based storage implementation using sql.js (WebAssembly)
 * Zero-config, works on all platforms without native compilation
 * 
 * sql.js is SQLite compiled to WebAssembly - no native dependencies!
 * Slightly slower than better-sqlite3 (2-10x) but works everywhere.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import { IIndexStorage, IndexStats, StorageQueryOptions } from './index-storage.js';
import { SymbolStub, Reference, CallGraphEdge, FileInfo } from '../memory-index.js';

export class SqlJsStorage implements IIndexStorage {
  private db: SqlJsDatabase | null = null;
  private SQL: SqlJsStatic | null = null;
  private readonly dbPath: string;
  private inTransaction = false;
  private dirty = false;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private readonly AUTO_SAVE_MS = 30000; // Save every 30 seconds if dirty
  private closed = false; // Track if storage has been closed
  private exitHandler: (() => void) | null = null;
  private sigintHandler: (() => void) | null = null;
  private sigtermHandler: (() => void) | null = null;

  constructor(indexDir: string) {
    this.dbPath = path.join(indexDir, 'index.db');
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fsPromises.mkdir(dir, { recursive: true });

    // Initialize sql.js
    this.SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
      console.error('✅ sql.js storage loaded from', this.dbPath);
    } else {
      this.db = new this.SQL.Database();
      console.error('✅ sql.js storage created (new database)');
    }

    // Create tables
    this.createTables();

    // Set up periodic auto-save
    this.autoSaveInterval = setInterval(() => this.saveIfDirty(), this.AUTO_SAVE_MS);

    // Handle process exit for graceful shutdown (store handlers so we can remove them)
    this.exitHandler = () => this.saveSync();
    this.sigintHandler = () => { this.saveSync(); process.exit(0); };
    this.sigtermHandler = () => { this.saveSync(); process.exit(0); };
    
    process.on('exit', this.exitHandler);
    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);

    // Apply PRAGMA optimizations for better performance
    this.applyPragmaOptimizations();

    console.error('✅ sql.js storage initialized at', this.dbPath);
  }

  /**
   * Apply SQLite PRAGMA settings for better performance.
   * These settings optimize for read-heavy workloads typical in code indexing.
   */
  private applyPragmaOptimizations(): void {
    if (!this.db) return;
    
    // Cache size: Increase to ~64MB (default is 2MB)
    // Negative value = kilobytes, positive = pages
    this.db.run('PRAGMA cache_size = -65536;'); // 64MB
    
    // Memory mapping: Use mmap for reads (faster for large DBs)
    // sql.js runs in memory anyway, but this helps with large datasets
    this.db.run('PRAGMA mmap_size = 268435456;'); // 256MB
    
    // Temp store in memory (faster temp table operations)
    this.db.run('PRAGMA temp_store = MEMORY;');
    
    // Journal mode: WAL is faster for concurrent reads
    // Note: sql.js doesn't support true WAL but setting it doesn't hurt
    this.db.run('PRAGMA journal_mode = MEMORY;');
    
    // Synchronous: OFF for speed (data is in memory anyway)
    this.db.run('PRAGMA synchronous = OFF;');
    
    // Analyze tables to update query optimizer statistics
    // This helps with LIKE queries and index selection
    this.db.run('ANALYZE;');
    
    console.error('✅ Applied SQLite PRAGMA optimizations');
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(`
      -- Symbols table
      CREATE TABLE IF NOT EXISTS symbols (
        fqn TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER,
        col INTEGER,
        package TEXT,
        data TEXT NOT NULL
      );
    `);
    
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);`);

    this.db.run(`
      -- References table
      CREATE TABLE IF NOT EXISTS refs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_fqn TEXT NOT NULL,
        to_fqn TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER,
        col INTEGER,
        kind TEXT NOT NULL
      );
    `);
    
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_refs_to ON refs(to_fqn);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_refs_from ON refs(from_fqn);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_refs_file ON refs(file);`);

    this.db.run(`
      -- Call graph edges (forward)
      CREATE TABLE IF NOT EXISTS call_edges_forward (
        caller TEXT NOT NULL,
        callee TEXT NOT NULL,
        locations TEXT NOT NULL,
        PRIMARY KEY (caller, callee)
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_edges_fwd_callee ON call_edges_forward(callee);`);

    this.db.run(`
      -- Call graph edges (reverse)
      CREATE TABLE IF NOT EXISTS call_edges_reverse (
        callee TEXT NOT NULL,
        caller TEXT NOT NULL,
        locations TEXT NOT NULL,
        PRIMARY KEY (callee, caller)
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_edges_rev_caller ON call_edges_reverse(caller);`);

    this.db.run(`
      -- Inheritance
      CREATE TABLE IF NOT EXISTS inheritance (
        child TEXT NOT NULL,
        parent TEXT NOT NULL,
        PRIMARY KEY (child, parent)
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_inheritance_parent ON inheritance(parent);`);

    this.db.run(`
      -- File metadata
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        last_indexed INTEGER NOT NULL,
        mtime INTEGER,
        is_indexed INTEGER NOT NULL,
        symbols TEXT
      );
    `);

    // Ensure newer columns exist when upgrading older databases
    this.ensureColumnExists('files', 'mtime', 'INTEGER');
  }

  private ensureColumnExists(table: string, column: string, type: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`PRAGMA table_info(${table});`);
    const existingColumns: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { name: string };
      existingColumns.push(row.name);
    }
    stmt.free();

    if (!existingColumns.includes(column)) {
      this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
    }
  }

  private saveIfDirty(): void {
    if (this.dirty && this.db && !this.closed) {
      this.saveSync();
    }
  }

  private saveSync(force: boolean = false): void {
    if (!this.db || (this.closed && !force)) return;
    
    try {
      // Check if directory still exists before attempting to save
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        // Directory was deleted, don't attempt to save
        return;
      }
      
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      this.dirty = false;
    } catch (error) {
      // Only log if not a "directory doesn't exist" error
      if ((error as any).code !== 'ENOENT') {
        console.error('Failed to save database:', error);
      }
    }
  }

  private markDirty(): void {
    this.dirty = true;
  }

  /**
   * Optimize the database after bulk operations.
   * This should be called after large indexing operations.
   */
  async optimize(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    console.error('🔧 Optimizing SQLite database...');
    const start = Date.now();
    
    // Update statistics for query optimizer
    this.db.run('ANALYZE;');
    
    // Note: VACUUM is not very useful for sql.js since the DB is in memory
    // and will be saved to disk as a single file anyway
    // But we can still run it to reclaim space before save
    // this.db.run('VACUUM;'); // Commented out - can be slow on large DBs
    
    const elapsed = Date.now() - start;
    console.error(`✅ Database optimized in ${elapsed}ms`);
  }

  async exists(): Promise<boolean> {
    try {
      await fsPromises.access(this.dbPath);
      return true;
    } catch {
      return false;
    }
  }

  async saveSymbol(symbol: SymbolStub): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT OR REPLACE INTO symbols (fqn, name, kind, file, line, col, package, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        symbol.fqn,
        symbol.name,
        symbol.kind,
        symbol.file,
        symbol.line,
        symbol.column,
        symbol.packageName,
        JSON.stringify(symbol)
      ]
    );
    this.markDirty();
  }

  async saveSymbols(symbols: SymbolStub[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (symbols.length === 0) return;

    this.db.run('BEGIN TRANSACTION');
    try {
      for (const symbol of symbols) {
        this.db.run(
          `INSERT OR REPLACE INTO symbols (fqn, name, kind, file, line, col, package, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            symbol.fqn || '',
            symbol.name || '',
            symbol.kind || 'class',
            symbol.file || '',
            symbol.line ?? 0,
            symbol.column ?? 0,
            symbol.packageName || '',
            JSON.stringify(symbol)
          ]
        );
      }
      this.db.run('COMMIT');
      this.markDirty();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  async getSymbol(fqn: string): Promise<SymbolStub | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT data FROM symbols WHERE fqn = ?');
    stmt.bind([fqn]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as { data: string };
      stmt.free();
      return JSON.parse(row.data);
    }
    stmt.free();
    return undefined;
  }

  async findSymbols(nameOrFqn: string, options?: StorageQueryOptions): Promise<SymbolStub[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Try exact FQN match first
    const exact = await this.getSymbol(nameOrFqn);
    if (exact) return [exact];

    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const pattern = `%${nameOrFqn}%`;

    const stmt = this.db.prepare(`
      SELECT data FROM symbols
      WHERE name LIKE ? OR fqn LIKE ?
      ORDER BY 
        CASE 
          WHEN name = ? THEN 0
          WHEN fqn = ? THEN 1
          ELSE 2
        END,
        name
      LIMIT ? OFFSET ?
    `);
    stmt.bind([pattern, pattern, nameOrFqn, nameOrFqn, limit, offset]);

    const results: SymbolStub[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { data: string };
      results.push(JSON.parse(row.data));
    }
    stmt.free();

    return results;
  }

  async getAllSymbols(options?: StorageQueryOptions): Promise<SymbolStub[]> {
    if (!this.db) throw new Error('Database not initialized');

    const limit = options?.limit || 10000;
    const offset = options?.offset || 0;

    const stmt = this.db.prepare('SELECT data FROM symbols LIMIT ? OFFSET ?');
    stmt.bind([limit, offset]);

    const results: SymbolStub[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { data: string };
      results.push(JSON.parse(row.data));
    }
    stmt.free();

    return results;
  }

  async deleteSymbol(fqn: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run('DELETE FROM symbols WHERE fqn = ?', [fqn]);
    this.markDirty();
  }

  async saveReference(ref: Reference): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check for duplicate
    const check = this.db.prepare(`
      SELECT 1 FROM refs
      WHERE from_fqn = ? AND to_fqn = ? AND file = ? AND line = ? AND col = ? AND kind = ?
      LIMIT 1
    `);
    check.bind([ref.fromFqn, ref.toFqn, ref.file, ref.line, ref.column, ref.kind]);
    if (check.step()) {
      check.free();
      return; // Skip duplicate
    }
    check.free();

    this.db.run(
      `INSERT INTO refs (from_fqn, to_fqn, file, line, col, kind)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ref.fromFqn, ref.toFqn, ref.file, ref.line, ref.column, ref.kind]
    );
    this.markDirty();
  }

  async saveReferences(refs: Reference[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (refs.length === 0) return;

    this.db.run('BEGIN TRANSACTION');
    try {
      for (const ref of refs) {
        this.db.run(
          `INSERT OR IGNORE INTO refs (from_fqn, to_fqn, file, line, col, kind)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            ref.fromFqn || '',
            ref.toFqn || '',
            ref.file || '',
            ref.line ?? 0,
            ref.column ?? 0,
            ref.kind || 'unknown'
          ]
        );
      }
      this.db.run('COMMIT');
      this.markDirty();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  async findUsages(fqn: string): Promise<Reference[]> {
    if (!this.db) throw new Error('Database not initialized');

    const simpleName = fqn.split('.').pop() || fqn;

    const stmt = this.db.prepare(`
      SELECT from_fqn, to_fqn, file, line, col, kind
      FROM refs
      WHERE to_fqn = ? OR to_fqn = ? OR to_fqn LIKE ?
    `);
    stmt.bind([fqn, simpleName, `%.${simpleName}`]);

    const results: Reference[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        from_fqn: string;
        to_fqn: string;
        file: string;
        line: number;
        col: number;
        kind: string;
      };
      results.push({
        fromFqn: row.from_fqn,
        toFqn: row.to_fqn,
        file: row.file,
        line: row.line,
        column: row.col,
        kind: row.kind as any
      });
    }
    stmt.free();

    return results;
  }

  async findReferencesFromClass(classFqn: string): Promise<Reference[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Find references where fromFqn is exactly the class, or starts with class. (methods/fields)
    // or starts with class( (constructors)
    const stmt = this.db.prepare(`
      SELECT from_fqn, to_fqn, file, line, col, kind
      FROM refs
      WHERE from_fqn = ? OR from_fqn LIKE ? OR from_fqn LIKE ?
    `);
    stmt.bind([classFqn, `${classFqn}.%`, `${classFqn}(%`]);

    const results: Reference[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        from_fqn: string;
        to_fqn: string;
        file: string;
        line: number;
        col: number;
        kind: string;
      };
      results.push({
        fromFqn: row.from_fqn,
        toFqn: row.to_fqn,
        file: row.file,
        line: row.line,
        column: row.col,
        kind: row.kind as any
      });
    }
    stmt.free();

    return results;
  }

  async deleteReferencesByFile(file: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run('DELETE FROM refs WHERE file = ?', [file]);
    this.markDirty();
  }

  async getAllReferences(options?: StorageQueryOptions): Promise<Reference[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT from_fqn, to_fqn, file, line, col, kind FROM refs';
    const params: any[] = [];

    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }

    const stmt = this.db.prepare(sql);
    const results: Reference[] = [];
    
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        from_fqn: string;
        to_fqn: string;
        file: string;
        line: number;
        col: number;
        kind: string;
      };
      results.push({
        fromFqn: row.from_fqn,
        toFqn: row.to_fqn,
        file: row.file,
        line: row.line,
        column: row.col,
        kind: row.kind as any
      });
    }
    stmt.free();

    return results;
  }

  async getAllCallGraphEdges(options?: StorageQueryOptions): Promise<CallGraphEdge[]> {
    if (!this.db) throw new Error('Database not initialized');

    // We'll get forward edges (which represent all edges - forward and reverse are duplicates)
    let sql = 'SELECT caller, callee, locations FROM call_edges_forward';
    const params: any[] = [];

    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }

    const stmt = this.db.prepare(sql);
    const results: CallGraphEdge[] = [];
    
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        caller: string;
        callee: string;
        locations: string;
      };
      results.push({
        caller: row.caller,
        callee: row.callee,
        locations: JSON.parse(row.locations)
      });
    }
    stmt.free();

    return results;
  }

  async saveCallEdge(edge: CallGraphEdge, direction: 'forward' | 'reverse'): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const table = direction === 'forward' ? 'call_edges_forward' : 'call_edges_reverse';
    const key1 = direction === 'forward' ? 'caller' : 'callee';
    const key2 = direction === 'forward' ? 'callee' : 'caller';
    // Values must match the column order (key1, key2)
    const val1 = direction === 'forward' ? edge.caller : edge.callee;
    const val2 = direction === 'forward' ? edge.callee : edge.caller;

    this.db.run(
      `INSERT OR REPLACE INTO ${table} (${key1}, ${key2}, locations)
       VALUES (?, ?, ?)`,
      [val1, val2, JSON.stringify(edge.locations)]
    );
    this.markDirty();
  }

  async saveCallEdges(edges: CallGraphEdge[], direction: 'forward' | 'reverse'): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (edges.length === 0) return;

    const table = direction === 'forward' ? 'call_edges_forward' : 'call_edges_reverse';
    const key1 = direction === 'forward' ? 'caller' : 'callee';
    const key2 = direction === 'forward' ? 'callee' : 'caller';

    this.db.run('BEGIN TRANSACTION');
    try {
      for (const edge of edges) {
        // Values must match the column order (key1, key2)
        const val1 = direction === 'forward' ? edge.caller : edge.callee;
        const val2 = direction === 'forward' ? edge.callee : edge.caller;
        this.db.run(
          `INSERT OR REPLACE INTO ${table} (${key1}, ${key2}, locations)
           VALUES (?, ?, ?)`,
          [val1, val2, JSON.stringify(edge.locations)]
        );
      }
      this.db.run('COMMIT');
      this.markDirty();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  async getOutboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT caller, callee, locations FROM call_edges_forward
      WHERE caller = ?
    `);
    stmt.bind([fqn]);

    const results: CallGraphEdge[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { caller: string; callee: string; locations: string };
      results.push({
        caller: row.caller,
        callee: row.callee,
        locations: JSON.parse(row.locations)
      });
    }
    stmt.free();

    return results;
  }

  async getInboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Exact match
    const exactStmt = this.db.prepare(`
      SELECT caller, callee, locations FROM call_edges_reverse
      WHERE callee = ?
    `);
    exactStmt.bind([fqn]);

    const results: CallGraphEdge[] = [];
    const seen = new Set<string>();

    while (exactStmt.step()) {
      const row = exactStmt.getAsObject() as { caller: string; callee: string; locations: string };
      const key = `${row.caller}->${row.callee}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          caller: row.caller,
          callee: row.callee,
          locations: JSON.parse(row.locations)
        });
      }
    }
    exactStmt.free();

    // Fuzzy matching for unresolved references
    const parts = fqn.split('.');
    const methodName = parts[parts.length - 1].split('(')[0];
    const className = parts.length >= 2 ? parts[parts.length - 2] : '';

    const fuzzyStmt = this.db.prepare(`
      SELECT DISTINCT caller, callee, locations FROM call_edges_reverse
      WHERE callee LIKE ? OR callee = ? OR callee LIKE ?
      LIMIT 100
    `);
    fuzzyStmt.bind([`%.${methodName}%`, methodName, `%${className}%${methodName}%`]);

    while (fuzzyStmt.step()) {
      const row = fuzzyStmt.getAsObject() as { caller: string; callee: string; locations: string };
      const key = `${row.caller}->${row.callee}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          caller: row.caller,
          callee: row.callee,
          locations: JSON.parse(row.locations)
        });
      }
    }
    fuzzyStmt.free();

    return results;
  }

  async deleteCallEdgesByFile(file: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const escapedFile = file.replace(/'/g, "''");
    
    this.db.run(`
      DELETE FROM call_edges_forward
      WHERE caller IN (SELECT fqn FROM symbols WHERE file = '${escapedFile}')
         OR callee IN (SELECT fqn FROM symbols WHERE file = '${escapedFile}')
    `);

    this.db.run(`
      DELETE FROM call_edges_reverse
      WHERE caller IN (SELECT fqn FROM symbols WHERE file = '${escapedFile}')
         OR callee IN (SELECT fqn FROM symbols WHERE file = '${escapedFile}')
    `);
    this.markDirty();
  }

  async saveInheritance(child: string, parent: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(
      `INSERT OR IGNORE INTO inheritance (child, parent) VALUES (?, ?)`,
      [child, parent]
    );
    this.markDirty();
  }

  async saveInheritances(relationships: Array<{ child: string; parent: string }>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (relationships.length === 0) return;

    this.db.run('BEGIN TRANSACTION');
    try {
      for (const rel of relationships) {
        this.db.run(
          `INSERT OR IGNORE INTO inheritance (child, parent) VALUES (?, ?)`,
          [rel.child, rel.parent]
        );
      }
      this.db.run('COMMIT');
      this.markDirty();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  async getParents(fqn: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT parent FROM inheritance WHERE child = ?');
    stmt.bind([fqn]);

    const results: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { parent: string };
      results.push(row.parent);
    }
    stmt.free();

    return results;
  }

  async getChildren(fqn: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT child FROM inheritance WHERE parent = ?');
    stmt.bind([fqn]);

    const results: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { child: string };
      results.push(row.child);
    }
    stmt.free();

    return results;
  }

  async deleteInheritance(fqn: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run('DELETE FROM inheritance WHERE child = ?', [fqn]);
    this.db.run('DELETE FROM inheritance WHERE parent = ?', [fqn]);
    this.markDirty();
  }

  async saveFile(file: FileInfo): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `INSERT OR REPLACE INTO files (path, hash, last_indexed, mtime, is_indexed, symbols)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        file.path,
        file.hash,
        file.lastIndexed,
        typeof file.mtime === 'number' ? file.mtime : file.lastIndexed,
        1,
        JSON.stringify(file.symbols)
      ]
    );
    this.markDirty();
  }

  async getFile(filePath: string): Promise<FileInfo | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM files WHERE path = ?');
    stmt.bind([filePath]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as any;
      stmt.free();
      return {
        path: row.path,
        hash: row.hash,
        lastIndexed: row.last_indexed,
        mtime: typeof row.mtime === 'number' ? row.mtime : row.last_indexed,
        symbols: JSON.parse(row.symbols || '[]')
      };
    }
    stmt.free();
    return undefined;
  }

  async getAllFiles(): Promise<FileInfo[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM files');

    const results: FileInfo[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push({
        path: row.path,
        hash: row.hash,
        lastIndexed: row.last_indexed,
        mtime: typeof row.mtime === 'number' ? row.mtime : row.last_indexed,
        symbols: JSON.parse(row.symbols || '[]')
      });
    }
    stmt.free();

    return results;
  }

  async deleteFile(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('BEGIN TRANSACTION');
    try {
      // Get symbol FQNs before deleting
      const symbolStmt = this.db.prepare('SELECT fqn FROM symbols WHERE file = ?');
      symbolStmt.bind([filePath]);
      const symbolFqns: string[] = [];
      while (symbolStmt.step()) {
        const row = symbolStmt.getAsObject() as { fqn: string };
        symbolFqns.push(row.fqn);
      }
      symbolStmt.free();

      // Delete file record
      this.db.run('DELETE FROM files WHERE path = ?', [filePath]);

      // Delete symbols
      this.db.run('DELETE FROM symbols WHERE file = ?', [filePath]);

      // Delete references
      this.db.run('DELETE FROM refs WHERE file = ?', [filePath]);

      // Delete call edges and inheritance for each symbol
      for (const fqn of symbolFqns) {
        this.db.run('DELETE FROM call_edges_forward WHERE caller = ? OR callee = ?', [fqn, fqn]);
        this.db.run('DELETE FROM call_edges_reverse WHERE caller = ? OR callee = ?', [fqn, fqn]);
        this.db.run('DELETE FROM inheritance WHERE child = ? OR parent = ?', [fqn, fqn]);
      }

      this.db.run('COMMIT');
      this.markDirty();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  async getStats(): Promise<IndexStats> {
    if (!this.db) throw new Error('Database not initialized');

    const getCount = (table: string, condition?: string): number => {
      const query = condition 
        ? `SELECT COUNT(*) as count FROM ${table} WHERE ${condition}`
        : `SELECT COUNT(*) as count FROM ${table}`;
      const stmt = this.db!.prepare(query);
      stmt.step();
      const result = stmt.getAsObject() as { count: number };
      stmt.free();
      return result.count;
    };

    return {
      symbols: getCount('symbols'),
      indexedFiles: getCount('files', 'is_indexed = 1'),
      allFiles: getCount('files'),
      references: getCount('refs'),
      callGraphEdges: getCount('call_edges_forward'),
      inheritanceRelations: getCount('inheritance')
    };
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM symbols');
    this.db.run('DELETE FROM refs');
    this.db.run('DELETE FROM call_edges_forward');
    this.db.run('DELETE FROM call_edges_reverse');
    this.db.run('DELETE FROM inheritance');
    this.db.run('DELETE FROM files');
    this.markDirty();
  }

  async flush(): Promise<void> {
    if (this.dirty) {
      this.saveSync();
    }
  }

  async close(): Promise<void> {
    // Mark as closed to prevent further operations
    this.closed = true;
    
    // Clear auto-save interval
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    
    // Remove process exit handlers
    if (this.exitHandler) {
      process.removeListener('exit', this.exitHandler);
      this.exitHandler = null;
    }
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }
    if (this.sigtermHandler) {
      process.removeListener('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = null;
    }

    if (this.db) {
      // Final save before closing (only if directory still exists)
      const dir = path.dirname(this.dbPath);
      if (fs.existsSync(dir)) {
        this.saveSync(true);
      }
      this.db.close();
      this.db = null;
    }
  }

  async beginTransaction(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.inTransaction) {
      this.db.run('BEGIN TRANSACTION');
      this.inTransaction = true;
    }
  }

  async commitTransaction(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (this.inTransaction) {
      this.db.run('COMMIT');
      this.inTransaction = false;
      this.markDirty();
    }
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (this.inTransaction) {
      this.db.run('ROLLBACK');
      this.inTransaction = false;
    }
  }
}
