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

  async initialize(options?: { deferMigration?: boolean }): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL'); // Faster writes, safe enough
    this.db.pragma('cache_size = -131072'); // 128 MiB cache
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 4294967296'); // 4 GiB mmap (virtual address space)
    this.db.pragma('busy_timeout = 5000');

    // Schema upgrades are explicit: do not build large reference indexes in
    // CREATE TABLE bootstrap before the migration version is checked.
    const existing = Boolean(this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='symbols'"
    ).get());
    this.createTables();
    const estimatedIndexes = this.estimateMigrationIndexCount();
    if (!options?.deferMigration) {
      console.error(`Schema migration check: ${estimatedIndexes} indexes to build or verify`);
      this.migrateSchema(existing);
    }
    
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
      -- (name, kind) also serves name-only queries; avoid a redundant name index.
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
      CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);

      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);

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
        mtime INTEGER,
        is_indexed INTEGER NOT NULL,  -- BOOLEAN as INTEGER
        symbols TEXT  -- JSON array of FQNs
      );
    `);

    this.ensureColumnExists('files', 'mtime', 'INTEGER');
  }

  estimateMigrationIndexCount(): number {
    if (!this.db) throw new Error('Database not initialized');
    const current = this.db.prepare('SELECT version FROM schema_version LIMIT 1')
      .get() as {version:number}|undefined;
    if (current?.version === 3) return 0;
    const targets = ['idx_symbols_name_kind','idx_refs_to_name','idx_refs_to_covering',
      'idx_symbols_declaring','idx_edges_fwd_caller_name','idx_edges_fwd_callee_name'];
    const existing = new Set((this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index'"
    ).all() as Array<{name:string}>).map(row=>row.name));
    return targets.filter(name=>!existing.has(name)).length;
  }

  /** Upgrade existing indexes without holding an all-index DDL transaction.
   * Each CREATE is atomic on its own; if interrupted, the next open retries.
   */
  public migrateSchema(existing = true): void {
    if (!this.db) throw new Error('Database not initialized');
    const stored = this.db.prepare('SELECT version FROM schema_version LIMIT 1')
      .get() as {version:number}|undefined;
    if (stored?.version === 3) return;
    if (existing) {
      console.error('Migrating index to schema 3: building reference indexes, may take several minutes on large databases');
    }
    // Only drop obsolete or legacy-expression indexes; preserve already rebuilt
    // indexes after an interrupted migration.
    const named = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_refs_to_name'")
      .get() as {sql:string}|undefined;
    const oldFunctionIndex = named?.sql?.includes('ref_simple_name(') ?? false;
    this.db.transaction(() => {
      this.db!.exec(`
        DROP INDEX IF EXISTS idx_symbols_name;
        DROP INDEX IF EXISTS idx_refs_to;
        DROP INDEX IF EXISTS idx_edges_rev_caller;
        DROP TABLE IF EXISTS call_edges_reverse;
      `);
      if (oldFunctionIndex) this.db!.exec('DROP INDEX IF EXISTS idx_refs_to_name');
    })();

    const statements = [
      ["idx_symbols_name_kind", "CREATE INDEX IF NOT EXISTS idx_symbols_name_kind ON symbols(name, kind)"],
      ["idx_refs_to_name", "CREATE INDEX IF NOT EXISTS idx_refs_to_name ON refs(replace(to_fqn, rtrim(to_fqn, replace(to_fqn, '.', '')), '') COLLATE NOCASE, to_fqn)"],
      ["idx_refs_to_covering", "CREATE INDEX IF NOT EXISTS idx_refs_to_covering ON refs(to_fqn, id, from_fqn, file, line, col, kind)"],
      ["idx_symbols_declaring", "CREATE INDEX IF NOT EXISTS idx_symbols_declaring ON symbols(json_extract(data, '$.declaringClass'))"],
      ["idx_edges_fwd_caller_name", "CREATE INDEX IF NOT EXISTS idx_edges_fwd_caller_name ON call_edges_forward(replace(caller, rtrim(caller, replace(caller, '.', '')), '') COLLATE NOCASE)"],
      ["idx_edges_fwd_callee_name", "CREATE INDEX IF NOT EXISTS idx_edges_fwd_callee_name ON call_edges_forward(replace(callee, rtrim(callee, replace(callee, '.', '')), '') COLLATE NOCASE)"]
    ] as const;
    for (const [name, sql] of statements) {
      // Deliberately before each atomic standalone DDL; interruption leaves
      // schema_version below 3 so a subsequent open resumes safely.
      console.error(`building index ${name}`);
      this.db.exec(sql);
    }
    this.db.transaction(() => {
      this.db!.prepare('DELETE FROM schema_version').run();
      this.db!.prepare('INSERT INTO schema_version(version) VALUES (3)').run();
    })();
  }

  private ensureColumnExists(table: string, column: string, type: string): void {
    if (!this.db) return;
    const pragma = this.db.prepare(`PRAGMA table_info(${table})`);
    const columns = pragma.all() as Array<{ name: string }>;
    const exists = columns.some(col => col.name === column);
    if (!exists) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
    }
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

    // Exact simple-name path: use the (name, kind) b-tree before any LIKE scan.
    // Bound results so a common name never creates an unbounded allocation.
    if (!nameOrFqn.includes('.')) {
      const exactNames = this.db.prepare(
        'SELECT data FROM symbols WHERE name = ? LIMIT 50'
      ).all(nameOrFqn) as Array<{ data: string }>;
      if (exactNames.length > 0) {
        return exactNames.map(row => JSON.parse(row.data) as SymbolStub);
      }
    }

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

    // No limit by default - load all symbols
    // Only apply LIMIT clause if explicitly requested
    if (options?.limit) {
      const offset = options?.offset || 0;
      const stmt = this.db.prepare(`SELECT data FROM symbols LIMIT ? OFFSET ?`);
      const rows = stmt.all(options.limit, offset) as Array<{ data: string }>;
      return rows.map(row => JSON.parse(row.data));
    } else {
      // No limit - fetch all symbols
      const stmt = this.db.prepare(`SELECT data FROM symbols`);
      const result: SymbolStub[] = [];
      for (const row of stmt.iterate() as IterableIterator<{data:string}>)
        result.push(JSON.parse(row.data));
      return result;
    }
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

  // FIX: Batch size for processing large reference sets to prevent memory pressure
  private static readonly REFERENCE_BATCH_SIZE = 50000; // 50K refs per batch

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

    // FIX: Process in batches to prevent memory pressure with 631K+ references
    const batchSize = SqliteStorage.REFERENCE_BATCH_SIZE;
    if (refs.length > batchSize) {
      console.error(`💾 Saving ${refs.length} references in ${Math.ceil(refs.length / batchSize)} batches...`);
      for (let i = 0; i < refs.length; i += batchSize) {
        const batch = refs.slice(i, Math.min(i + batchSize, refs.length));
        saveTransaction(batch);
        if ((i / batchSize + 1) % 5 === 0 || i + batchSize >= refs.length) {
          console.error(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(refs.length / batchSize)} saved (${i + batch.length}/${refs.length})`);
        }
      }
    } else {
      saveTransaction(refs);
    }
  }

  private usageLimitReached = false;
  wasUsageSearchTruncated(): boolean { return this.usageLimitReached; }

  async findUsages(fqn: string): Promise<Reference[]> {
    if (!this.db) throw new Error('Database not initialized');

    const simpleName = fqn.split('.').pop() || fqn;
    type UsageRow = {
      id: number; from_fqn: string; to_fqn: string;
      file: string; line: number; col: number; kind: string;
    };
    const select = 'SELECT id, from_fqn, to_fqn, file, line, col, kind FROM refs';
    // Split exact and simple-name lookups so both clauses have a predictable
    // indexed plan (including a cold cache). Deduplicate overlapping rows by id.
    const exact = this.db.prepare(select + ' WHERE to_fqn = ?')
      .all(fqn) as UsageRow[];
    const byName = this.db.prepare(
      select + ` WHERE replace(to_fqn, rtrim(to_fqn, replace(to_fqn, '.', '')), '') = ? COLLATE NOCASE LIMIT 5000`
    ).all(simpleName) as UsageRow[];
    this.usageLimitReached = byName.length >= 5000;
    const seen = new Set<number>();
    const results: Reference[] = [];
    for (const row of [...exact, ...byName]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      results.push({
        fromFqn: row.from_fqn,
        toFqn: row.to_fqn,
        file: row.file,
        line: row.line,
        column: row.col,
        kind: row.kind as Reference['kind']
      });
    }
    return results;
  }

  async findReferencesFromClass(classFqn: string): Promise<Reference[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Find references where fromFqn is exactly the class, or starts with class. (methods/fields)
    // or starts with class( (constructors)
    const stmt = this.db.prepare(`
      SELECT from_fqn, to_fqn, file, line, col, kind
      FROM refs
      WHERE from_fqn = ?
        OR (from_fqn >= ? AND from_fqn < ?)
        OR (from_fqn >= ? AND from_fqn < ?)
    `);

    const rows = stmt.all(classFqn, classFqn+'.', classFqn+'.\\uffff'.replace('\\uffff','\uffff'),
      classFqn+'(', classFqn+'(\\uffff'.replace('\\uffff','\uffff')) as Array<{
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
    const result: Reference[] = [];
    for (const row of stmt.iterate() as IterableIterator<{
      from_fqn: string; to_fqn: string; file: string;
      line: number; col: number; kind: string;
    }>) result.push({
      fromFqn: row.from_fqn,
      toFqn: row.to_fqn,
      file: row.file,
      line: row.line,
      column: row.col,
      kind: row.kind as any
    });
    return result;
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
    const result: CallGraphEdge[] = [];
    for (const row of stmt.iterate() as IterableIterator<{
      caller: string; callee: string; locations: string;
    }>) result.push({
      caller: row.caller,
      callee: row.callee,
      locations: JSON.parse(row.locations)
    });
    return result;
  }

  async saveCallEdge(edge: CallGraphEdge, direction: 'forward' | 'reverse'): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    // The legacy reverse write is a compatibility no-op; inbound reads use
    // call_edges_forward via idx_edges_fwd_callee.
    if (direction === 'reverse') return;
    this.db.prepare('INSERT OR REPLACE INTO call_edges_forward(caller,callee,locations) VALUES (?,?,?)')
      .run(edge.caller,edge.callee,JSON.stringify(edge.locations));
  }

  async saveCallEdges(edges: CallGraphEdge[], direction: 'forward' | 'reverse'): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (direction === 'reverse' || !edges.length) return;
    const insert=this.db.prepare(
      'INSERT OR REPLACE INTO call_edges_forward(caller,callee,locations) VALUES (?,?,?)'
    );
    this.db.transaction(() => {
      for (const edge of edges)
        insert.run(edge.caller,edge.callee,JSON.stringify(edge.locations));
    })();
  }

  async getOutboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    if (!this.db) throw new Error('Database not initialized');
    type Row={caller:string;callee:string;locations:string};
    let rows=this.db.prepare('SELECT caller,callee,locations FROM call_edges_forward WHERE caller = ?')
      .all(fqn) as Row[];
    if (!rows.length) {
      const name=fqn.split('.').pop() || fqn;
      rows=this.db.prepare(`SELECT caller,callee,locations FROM call_edges_forward
          WHERE replace(caller, rtrim(caller, replace(caller, '.', '')), '') = ? COLLATE NOCASE LIMIT 100`).all(name) as Row[];
    }
    return rows.map(row=>({caller:row.caller,callee:row.callee,locations:JSON.parse(row.locations)}));
  }

  async getInboundCalls(fqn: string): Promise<CallGraphEdge[]> {
    if (!this.db) throw new Error('Database not initialized');
    type Row={caller:string;callee:string;locations:string};
    let rows=this.db.prepare('SELECT caller,callee,locations FROM call_edges_forward WHERE callee = ?')
      .all(fqn) as Row[];
    if (!rows.length) {
      const name=fqn.split('.').pop() || fqn;
      rows=this.db.prepare(`SELECT caller,callee,locations FROM call_edges_forward
          WHERE replace(callee, rtrim(callee, replace(callee, '.', '')), '') = ? COLLATE NOCASE LIMIT 100`).all(name) as Row[];
    }
    return rows.map(row=>({caller:row.caller,callee:row.callee,locations:JSON.parse(row.locations)}));
  }

  async deleteCallEdgesByFile(file: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Delete from forward table
    this.db.exec(`
      DELETE FROM call_edges_forward
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
      INSERT OR REPLACE INTO files (path, hash, last_indexed, mtime, is_indexed, symbols)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      file.path,
      file.hash,
      file.lastIndexed,
      typeof file.mtime === 'number' ? file.mtime : file.lastIndexed,
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
      mtime: typeof row.mtime === 'number' ? row.mtime : row.last_indexed,
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
      mtime: typeof row.mtime === 'number' ? row.mtime : row.last_indexed,
      symbols: JSON.parse(row.symbols || '[]')
    }));
  }

  async deleteFile(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.transaction((file: string) => {
      // Read ownership BEFORE deleting symbols. Only remove edges emitted by
      // callers in this file; inbound edges from other files must remain.
      const fqns = this.db!.prepare('SELECT fqn FROM symbols WHERE file = ?')
        .all(file) as Array<{ fqn: string }>;
      const delForward = this.db!.prepare('DELETE FROM call_edges_forward WHERE caller = ?');
      const delInheritance = this.db!.prepare('DELETE FROM inheritance WHERE child = ?');
      for (const { fqn } of fqns) {
        delForward.run(fqn);
        delInheritance.run(fqn);
      }
      this.db!.prepare('DELETE FROM files WHERE path = ?').run(file);
      this.db!.prepare('DELETE FROM symbols WHERE file = ?').run(file);
      this.db!.prepare('DELETE FROM refs WHERE file = ?').run(file);
    })(filePath);
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
      DELETE FROM inheritance;
      DELETE FROM files;
    `);
  }

  async flush(): Promise<void> {
    // better-sqlite3 is synchronous, writes are immediate - no flush needed
  }

  // Run only on the 30-minute maintenance timer; never during a one-file refresh.
  async runMaintenance(): Promise<void> {
    if (!this.db) return;
    this.db.pragma('optimize');
    this.db.pragma('wal_checkpoint(PASSIVE)');
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
