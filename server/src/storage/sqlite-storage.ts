/**
 * SQLite-based storage implementation using better-sqlite3
 * Provides efficient on-disk storage with minimal memory usage
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { IIndexStorage, IndexStats, StorageQueryOptions } from './index-storage.js';
import { SymbolStub, Reference, CallGraphEdge, FileInfo } from '../memory-index.js';
import Database from 'better-sqlite3';

export class SqliteStorage implements IIndexStorage {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private inTransaction = false;

  constructor(indexDir: string) {
    this.dbPath = path.join(indexDir, 'index.db');
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL'); // Faster writes, safe enough
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');

    // Create tables
    this.createTables();
    
    console.error('✅ SQLite storage initialized at', this.dbPath);
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      -- Symbols table
      CREATE TABLE IF NOT EXISTS symbols (
        fqn TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER,
        col INTEGER,
        package TEXT,
        data TEXT NOT NULL  -- JSON-encoded SymbolStub
      );
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
      CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);

      -- References table (using refs to avoid reserved word)
      CREATE TABLE IF NOT EXISTS refs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_fqn TEXT NOT NULL,
        to_fqn TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER,
        col INTEGER,
        kind TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_refs_to ON refs(to_fqn);
      CREATE INDEX IF NOT EXISTS idx_refs_from ON refs(from_fqn);
      CREATE INDEX IF NOT EXISTS idx_refs_file ON refs(file);

      -- Call graph edges (forward: caller -> callee)
      CREATE TABLE IF NOT EXISTS call_edges_forward (
        caller TEXT NOT NULL,
        callee TEXT NOT NULL,
        locations TEXT NOT NULL,  -- JSON array
        PRIMARY KEY (caller, callee)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_fwd_callee ON call_edges_forward(callee);

      -- Call graph edges (reverse: callee -> caller)
      CREATE TABLE IF NOT EXISTS call_edges_reverse (
        callee TEXT NOT NULL,
        caller TEXT NOT NULL,
        locations TEXT NOT NULL,  -- JSON array
        PRIMARY KEY (callee, caller)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_rev_caller ON call_edges_reverse(caller);

      -- Inheritance (child -> parent)
      CREATE TABLE IF NOT EXISTS inheritance (
        child TEXT NOT NULL,
        parent TEXT NOT NULL,
        PRIMARY KEY (child, parent)
      );
      CREATE INDEX IF NOT EXISTS idx_inheritance_parent ON inheritance(parent);

      -- File metadata
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        last_indexed INTEGER NOT NULL,
        is_indexed INTEGER NOT NULL,  -- BOOLEAN as INTEGER
        symbols TEXT  -- JSON array of FQNs
      );
    `);
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.dbPath);
      return true;
    } catch {
      return false;
    }
  }

  async saveSymbol(symbol: SymbolStub): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO symbols (fqn, name, kind, file, line, col, package, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      symbol.fqn,
      symbol.name,
      symbol.kind,
      symbol.file,
      symbol.line,
      symbol.column,
      symbol.packageName,
      JSON.stringify(symbol)
    );
  }

  async saveSymbols(symbols: SymbolStub[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO symbols (fqn, name, kind, file, line, col, package, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const saveTransaction = this.db.transaction((syms: SymbolStub[]) => {
      for (const symbol of syms) {
        stmt.run(
          symbol.fqn,
          symbol.name,
          symbol.kind,
          symbol.file,
          symbol.line,
          symbol.column,
          symbol.packageName,
          JSON.stringify(symbol)
        );
      }
    });

    saveTransaction(symbols);
  }

  async getSymbol(fqn: string): Promise<SymbolStub | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT data FROM symbols WHERE fqn = ?');
    const row = stmt.get(fqn) as { data: string } | undefined;

    return row ? JSON.parse(row.data) : undefined;
  }

  async findSymbols(nameOrFqn: string, options?: StorageQueryOptions): Promise<SymbolStub[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Try exact FQN match first
    const exact = await this.getSymbol(nameOrFqn);
    if (exact) return [exact];

    // Partial match
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

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

    const pattern = `%${nameOrFqn}%`;
    const rows = stmt.all(pattern, pattern, nameOrFqn, nameOrFqn, limit, offset) as Array<{ data: string }>;

    return rows.map(row => JSON.parse(row.data));
  }

  async getAllSymbols(options?: StorageQueryOptions): Promise<SymbolStub[]> {
    if (!this.db) throw new Error('Database not initialized');

    const limit = options?.limit || 10000;
    const offset = options?.offset || 0;

    const stmt = this.db.prepare(`
      SELECT data FROM symbols
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as Array<{ data: string }>;
    return rows.map(row => JSON.parse(row.data));
  }

  async deleteSymbol(fqn: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM symbols WHERE fqn = ?');
    stmt.run(fqn);
  }

  async saveReference(ref: Reference): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check for duplicate
    const checkStmt = this.db.prepare(`
      SELECT 1 FROM refs
      WHERE from_fqn = ? AND to_fqn = ? AND file = ? AND line = ? AND col = ? AND kind = ?
      LIMIT 1
    `);

    const exists = checkStmt.get(ref.fromFqn, ref.toFqn, ref.file, ref.line, ref.column, ref.kind);
    if (exists) return; // Skip duplicate

    const stmt = this.db.prepare(`
      INSERT INTO refs (from_fqn, to_fqn, file, line, col, kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(ref.fromFqn, ref.toFqn, ref.file, ref.line, ref.column, ref.kind);
  }

  async saveReferences(refs: Reference[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (refs.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO refs (from_fqn, to_fqn, file, line, col, kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const saveTransaction = this.db.transaction((references: Reference[]) => {
      for (const ref of references) {
        stmt.run(ref.fromFqn, ref.toFqn, ref.file, ref.line, ref.column, ref.kind);
      }
    });

    saveTransaction(refs);
  }

  async findUsages(fqn: string): Promise<Reference[]> {
    if (!this.db) throw new Error('Database not initialized');

    const simpleName = fqn.split('.').pop() || fqn;

    const stmt = this.db.prepare(`
      SELECT from_fqn, to_fqn, file, line, col, kind
      FROM refs
      WHERE to_fqn = ? OR to_fqn = ? OR to_fqn LIKE ?
    `);

    const rows = stmt.all(fqn, simpleName, `%.${simpleName}`) as Array<{
      from_fqn: string;
      to_fqn: string;
      file: string;
      line: number;
      col: number;
      kind: string;
    }>;

    return rows.map(row => ({
      fromFqn: row.from_fqn,
      toFqn: row.to_fqn,
      file: row.file,
      line: row.line,
      column: row.col,
      kind: row.kind as any
    }));
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

    const rows = stmt.all(classFqn, `${classFqn}.%`, `${classFqn}(%`) as Array<{
      from_fqn: string;
      to_fqn: string;
      file: string;
      line: number;
      col: number;
      kind: string;
    }>;

    return rows.map(row => ({
      fromFqn: row.from_fqn,
      toFqn: row.to_fqn,
      file: row.file,
      line: row.line,
      column: row.col,
      kind: row.kind as any
    }));
  }

  async deleteReferencesByFile(file: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM refs WHERE file = ?');
    stmt.run(file);
  }

  async getAllReferences(options?: StorageQueryOptions): Promise<Reference[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT from_fqn, to_fqn, file, line, col, kind FROM refs';
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as Array<{
      from_fqn: string;
      to_fqn: string;
      file: string;
      line: number;
      col: number;
      kind: string;
    }>;

    return rows.map(row => ({
      fromFqn: row.from_fqn,
      toFqn: row.to_fqn,
      file: row.file,
      line: row.line,
      column: row.col,
      kind: row.kind as any
    }));
  }

  async getAllCallGraphEdges(options?: StorageQueryOptions): Promise<CallGraphEdge[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT caller, callee, locations FROM call_edges_forward';
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as Array<{
      caller: string;
      callee: string;
      locations: string;
    }>;

    return rows.map(row => ({
      caller: row.caller,
      callee: row.callee,
      locations: JSON.parse(row.locations)
    }));
  }

  async saveCallEdge(edge: CallGraphEdge, direction: 'forward' | 'reverse'): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const table = direction === 'forward' ? 'call_edges_forward' : 'call_edges_reverse';
    const key1 = direction === 'forward' ? 'caller' : 'callee';
    const key2 = direction === 'forward' ? 'callee' : 'caller';

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${table} (${key1}, ${key2}, locations)
      VALUES (?, ?, ?)
    `);

    stmt.run(edge.caller, edge.callee, JSON.stringify(edge.locations));
  }

  async saveCallEdges(edges: CallGraphEdge[], direction: 'forward' | 'reverse'): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const table = direction === 'forward' ? 'call_edges_forward' : 'call_edges_reverse';
    const key1 = direction === 'forward' ? 'caller' : 'callee';
    const key2 = direction === 'forward' ? 'callee' : 'caller';

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${table} (${key1}, ${key2}, locations)
      VALUES (?, ?, ?)
    `);

    const saveTransaction = this.db.transaction((edgeList: CallGraphEdge[]) => {
      for (const edge of edgeList) {
        stmt.run(edge.caller, edge.callee, JSON.stringify(edge.locations));
      }
    });

    saveTransaction(edges);
  }

  async getOutboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT caller, callee, locations FROM call_edges_forward
      WHERE caller = ?
    `);

    const rows = stmt.all(fqn) as Array<{ caller: string; callee: string; locations: string }>;

    return rows.map(row => ({
      caller: row.caller,
      callee: row.callee,
      locations: JSON.parse(row.locations)
    }));
  }

  async getInboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Exact match
    const exactStmt = this.db.prepare(`
      SELECT caller, callee, locations FROM call_edges_reverse
      WHERE callee = ?
    `);

    const exact = exactStmt.all(fqn) as Array<{ caller: string; callee: string; locations: string }>;
    
    // Fuzzy matching for unresolved references
    const parts = fqn.split('.');
    const methodName = parts[parts.length - 1].split('(')[0];
    const className = parts[parts.length - 2];

    const fuzzyStmt = this.db.prepare(`
      SELECT DISTINCT caller, callee, locations FROM call_edges_reverse
      WHERE callee LIKE ? OR callee = ? OR callee LIKE ?
      LIMIT 100
    `);

    const fuzzy = fuzzyStmt.all(`%.${methodName}%`, methodName, `%${className}%${methodName}%`) as Array<{
      caller: string;
      callee: string;
      locations: string;
    }>;

    // Combine and deduplicate
    const seen = new Set<string>();
    const results: CallGraphEdge[] = [];

    for (const row of [...exact, ...fuzzy]) {
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

    return results;
  }

  async deleteCallEdgesByFile(file: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Delete from forward table
    this.db.exec(`
      DELETE FROM call_edges_forward
      WHERE caller IN (SELECT fqn FROM symbols WHERE file = '${file.replace(/'/g, "''")}')
         OR callee IN (SELECT fqn FROM symbols WHERE file = '${file.replace(/'/g, "''")}')
    `);

    // Delete from reverse table
    this.db.exec(`
      DELETE FROM call_edges_reverse
      WHERE caller IN (SELECT fqn FROM symbols WHERE file = '${file.replace(/'/g, "''")}')
         OR callee IN (SELECT fqn FROM symbols WHERE file = '${file.replace(/'/g, "''")}')
    `);
  }

  async saveInheritance(child: string, parent: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO inheritance (child, parent)
      VALUES (?, ?)
    `);

    stmt.run(child, parent);
  }

  async saveInheritances(relationships: Array<{ child: string; parent: string }>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO inheritance (child, parent)
      VALUES (?, ?)
    `);

    const saveTransaction = this.db.transaction((rels: Array<{ child: string; parent: string }>) => {
      for (const rel of rels) {
        stmt.run(rel.child, rel.parent);
      }
    });

    saveTransaction(relationships);
  }

  async getParents(fqn: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT parent FROM inheritance WHERE child = ?');
    const rows = stmt.all(fqn) as Array<{ parent: string }>;

    return rows.map(row => row.parent);
  }

  async getChildren(fqn: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT child FROM inheritance WHERE parent = ?');
    const rows = stmt.all(fqn) as Array<{ child: string }>;

    return rows.map(row => row.child);
  }

  async deleteInheritance(fqn: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt1 = this.db.prepare('DELETE FROM inheritance WHERE child = ?');
    const stmt2 = this.db.prepare('DELETE FROM inheritance WHERE parent = ?');

    stmt1.run(fqn);
    stmt2.run(fqn);
  }

  async saveFile(file: FileInfo): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO files (path, hash, last_indexed, is_indexed, symbols)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      file.path,
      file.hash,
      file.lastIndexed,
      1, // TRUE
      JSON.stringify(file.symbols)
    );
  }

  async getFile(filePath: string): Promise<FileInfo | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM files WHERE path = ?');
    const row = stmt.get(filePath) as any;

    if (!row) return undefined;

    return {
      path: row.path,
      hash: row.hash,
      lastIndexed: row.last_indexed,
      symbols: JSON.parse(row.symbols || '[]')
    };
  }

  async getAllFiles(): Promise<FileInfo[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM files');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      path: row.path,
      hash: row.hash,
      lastIndexed: row.last_indexed,
      symbols: JSON.parse(row.symbols || '[]')
    }));
  }

  async deleteFile(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction((path: string) => {
      // Delete file record
      this.db!.prepare('DELETE FROM files WHERE path = ?').run(path);

      // Delete symbols
      this.db!.prepare('DELETE FROM symbols WHERE file = ?').run(path);

      // Delete references
      this.db!.prepare('DELETE FROM refs WHERE file = ?').run(path);

      // Delete call edges (harder - need to find symbols in file first)
      const symbolFqns = this.db!.prepare('SELECT fqn FROM symbols WHERE file = ?').all(path) as Array<{ fqn: string }>;
      
      for (const { fqn } of symbolFqns) {
        this.db!.prepare('DELETE FROM call_edges_forward WHERE caller = ? OR callee = ?').run(fqn, fqn);
        this.db!.prepare('DELETE FROM call_edges_reverse WHERE caller = ? OR callee = ?').run(fqn, fqn);
        this.db!.prepare('DELETE FROM inheritance WHERE child = ? OR parent = ?').run(fqn, fqn);
      }
    });

    transaction(filePath);
  }

  async getStats(): Promise<IndexStats> {
    if (!this.db) throw new Error('Database not initialized');

    const symbols = this.db.prepare('SELECT COUNT(*) as count FROM symbols').get() as { count: number };
    const files = this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    const indexedFiles = this.db.prepare('SELECT COUNT(*) as count FROM files WHERE is_indexed = 1').get() as { count: number };
    const references = this.db.prepare('SELECT COUNT(*) as count FROM refs').get() as { count: number };
    const callEdges = this.db.prepare('SELECT COUNT(*) as count FROM call_edges_forward').get() as { count: number };
    const inheritance = this.db.prepare('SELECT COUNT(*) as count FROM inheritance').get() as { count: number };

    return {
      symbols: symbols.count,
      indexedFiles: indexedFiles.count,
      allFiles: files.count,
      references: references.count,
      callGraphEdges: callEdges.count,
      inheritanceRelations: inheritance.count
    };
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      DELETE FROM symbols;
      DELETE FROM refs;
      DELETE FROM call_edges_forward;
      DELETE FROM call_edges_reverse;
      DELETE FROM inheritance;
      DELETE FROM files;
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async beginTransaction(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.inTransaction) {
      this.db.prepare('BEGIN TRANSACTION').run();
      this.inTransaction = true;
    }
  }

  async commitTransaction(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (this.inTransaction) {
      this.db.prepare('COMMIT').run();
      this.inTransaction = false;
    }
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (this.inTransaction) {
      this.db.prepare('ROLLBACK').run();
      this.inTransaction = false;
    }
  }
}
