/**
 * Read-only, SQLite-backed replacement for MemoryIndex used by MCP query tools.
 * The only metadata we retain at startup is the indexed file list; symbols,
 * references and call edges remain on disk until a query requests them.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { MemoryIndex, SymbolStub, Reference, CallGraphEdge, FileInfo } from './memory-index.js';

type SymbolRow = { fqn: string; data: string };
type RefRow = { id: number; from_fqn: string; to_fqn: string; file: string; line: number; col: number; kind: Reference['kind'] };
type EdgeRow = { caller: string; callee: string; locations: string };
type FileRow = { path: string; hash: string; last_indexed: number; mtime: number | null; symbols: string };

class DiskSymbolMap extends Map<string, SymbolStub> {
  constructor(private readonly db: Database.Database) { super(); }
  override get size(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM symbols').get() as {n:number}).n;
  }
  override get(fqn: string): SymbolStub | undefined {
    const row = this.db.prepare('SELECT data FROM symbols WHERE fqn = ?')
      .get(fqn) as {data:string} | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  override has(fqn: string): boolean { return this.get(fqn) !== undefined; }
  override *entries(): MapIterator<[string, SymbolStub]> {
    for (const row of this.db.prepare('SELECT fqn, data FROM symbols').iterate() as IterableIterator<SymbolRow>)
      yield [row.fqn, JSON.parse(row.data)];
  }
  override *values(): MapIterator<SymbolStub> {
    for (const row of this.db.prepare('SELECT data FROM symbols').iterate() as IterableIterator<{data:string}>)
      yield JSON.parse(row.data);
  }
  override *keys(): MapIterator<string> {
    for (const row of this.db.prepare('SELECT fqn FROM symbols').iterate() as IterableIterator<{fqn:string}>)
      yield row.fqn;
  }
  override [Symbol.iterator](): MapIterator<[string,SymbolStub]> { return this.entries(); }
  override forEach(callbackfn: (value: SymbolStub, key: string, map: Map<string,SymbolStub>) => void, thisArg?: any): void {
    for (const [key,value] of this.entries()) callbackfn.call(thisArg,value,key,this);
  }
}

export class QueryService extends MemoryIndex {
  private readonly db: Database.Database;
  private readonly diskSymbols: DiskSymbolMap;

  constructor(projectRoot: string) {
    super();
    this.setIndexDir(projectRoot);
    this.db = new Database(path.join(this.getIndexDir(), 'index.db'), {
      readonly: true, fileMustExist: true
    });
    this.diskSymbols = new DiskSymbolMap(this.db);
  }

  close(): void { if (this.db.open) this.db.close(); }
  override getSymbol(fqn: string): SymbolStub | undefined { return this.diskSymbols.get(fqn); }
  override getAllSymbols(): Map<string,SymbolStub> { return this.diskSymbols; }
  override getMembers(classFqn: string): SymbolStub[] {
    const rows = this.db.prepare(`
      SELECT data FROM symbols
      WHERE (fqn >= ? AND fqn < ?)
         OR json_extract(data, '$.declaringClass') = ?
    `).all(classFqn+'.', classFqn+'.\\uffff'.replace('\\uffff','\uffff'), classFqn) as Array<{data:string}>;
    return rows.map(row => JSON.parse(row.data));
  }

  override findClassesByName(name: string): SymbolStub[] {
    const rows = this.db.prepare(`
      SELECT data FROM symbols WHERE name = ?
      AND kind IN ('class','interface','enum','record') LIMIT 50
    `).all(name) as Array<{data:string}>;
    return rows.map(row => JSON.parse(row.data));
  }


  override findSymbols(query: string): SymbolStub[] {
    const exact = this.getSymbol(query);
    if (exact) return [exact];
    if (!query.includes('.')) {
      const named = this.db.prepare('SELECT data FROM symbols WHERE name = ? LIMIT 50')
        .all(query) as Array<{data:string}>;
      if (named.length) return named.map(r => JSON.parse(r.data));
    }
    const pattern = '%' + query + '%';
    const rows = this.db.prepare(
      'SELECT data FROM symbols WHERE name LIKE ? OR fqn LIKE ? ORDER BY name LIMIT 200'
    ).all(pattern,pattern) as Array<{data:string}>;
    return rows.map(r => JSON.parse(r.data));
  }

  private mapRef(row: RefRow): Reference {
    return { fromFqn: row.from_fqn, toFqn: row.to_fqn, file: row.file,
      line: row.line, column: row.col, kind: row.kind };
  }
  override findUsages(fqn: string): Reference[] {
    const select = 'SELECT id, from_fqn, to_fqn, file, line, col, kind FROM refs';
    const exact = this.db.prepare(select+' WHERE to_fqn = ?').all(fqn) as RefRow[];
    const simple = fqn.split('.').pop() || fqn;
    const fuzzy = this.db.prepare(select+` WHERE replace(to_fqn, rtrim(to_fqn, replace(to_fqn, '.', '')), '') = ? COLLATE NOCASE`)
      .all(simple) as RefRow[];
    const merged = new Map<number,Reference>();
    for (const row of [...exact,...fuzzy]) merged.set(row.id,this.mapRef(row));
    return [...merged.values()];
  }
  override findReferencesFromClass(fqn: string): Reference[] {
    const rows = this.db.prepare(`SELECT id, from_fqn, to_fqn, file, line, col, kind
      FROM refs WHERE from_fqn = ?
        OR (from_fqn >= ? AND from_fqn < ?)
        OR (from_fqn >= ? AND from_fqn < ?)`)
      .all(fqn, fqn+'.', fqn+'.\\uffff'.replace('\\uffff','\uffff'),
        fqn+'(', fqn+'(\\uffff'.replace('\\uffff','\uffff')) as RefRow[];
    return rows.map(r=>this.mapRef(r));
  }

  private edges(rows: EdgeRow[]): CallGraphEdge[] {
    return rows.map(row=>({caller:row.caller, callee:row.callee,
      locations:JSON.parse(row.locations)}));
  }
  override getOutboundCalls(fqn: string): CallGraphEdge[] {
    const exact = this.db.prepare(
      'SELECT caller, callee, locations FROM call_edges_forward WHERE caller = ?'
    ).all(fqn) as EdgeRow[];
    if (exact.length) return this.edges(exact);
    // Exact query miss only: use the expression index, never a leading LIKE.
    const name = fqn.split('.').pop() || fqn;
    return this.edges(this.db.prepare(
      `SELECT caller, callee, locations FROM call_edges_forward
         WHERE replace(caller, rtrim(caller, replace(caller, '.', '')), '') = ? COLLATE NOCASE LIMIT 100`
    ).all(name) as EdgeRow[]);
  }
  override getInboundCalls(fqn: string): CallGraphEdge[] {
    const exact = this.db.prepare(
      'SELECT caller, callee, locations FROM call_edges_forward WHERE callee = ?'
    ).all(fqn) as EdgeRow[];
    if (exact.length) return this.edges(exact);
    const name = fqn.split('.').pop() || fqn;
    return this.edges(this.db.prepare(
      `SELECT caller, callee, locations FROM call_edges_forward
         WHERE replace(callee, rtrim(callee, replace(callee, '.', '')), '') = ? COLLATE NOCASE LIMIT 100`
    ).all(name) as EdgeRow[]);
  }
  override getParents(fqn: string): string[] {
    return (this.db.prepare('SELECT parent FROM inheritance WHERE child = ?')
      .all(fqn) as Array<{parent:string}>).map(row=>row.parent);
  }
  override getChildren(fqn: string): string[] {
    return (this.db.prepare('SELECT child FROM inheritance WHERE parent = ?')
      .all(fqn) as Array<{child:string}>).map(row=>row.child);
  }

  private asFile(row: FileRow): FileInfo {
    return {path:row.path,hash:row.hash,lastIndexed:row.last_indexed,
      mtime:row.mtime ?? row.last_indexed,symbols:JSON.parse(row.symbols||'[]')};
  }
  override getFile(file: string): FileInfo | undefined {
    const row=this.db.prepare('SELECT * FROM files WHERE path = ?').get(file) as FileRow|undefined;
    return row?this.asFile(row):undefined;
  }
  override getAllFiles(): FileInfo[] {
    const results: FileInfo[]=[];
    for (const row of this.db.prepare('SELECT * FROM files').iterate() as IterableIterator<FileRow>)
      results.push(this.asFile(row));
    return results;
  }
  override getIndexedFiles(): string[] {
    return (this.db.prepare('SELECT path FROM files WHERE is_indexed = 1').all() as Array<{path:string}>)
      .map(row=>row.path);
  }
  override getStats() {
    const n=(table:string)=> (this.db.prepare('SELECT COUNT(*) AS n FROM '+table).get() as {n:number}).n;
    return {symbols:n('symbols'),files:n('files'),indexedFiles:n('files'),
      allFiles:n('files'),references:n('refs'),callGraphEdges:n('call_edges_forward'),
      inheritanceRelations:n('inheritance')};
  }
  override getSymbolSummary(): {byKind:Record<string,number>;packages:string[];topClasses:string[]} {
    const kinds=this.db.prepare('SELECT kind, COUNT(*) AS count FROM symbols GROUP BY kind')
      .all() as Array<{kind:string;count:number}>;
    return {
      byKind:Object.fromEntries(kinds.map(row=>[row.kind,row.count])),
      packages:(this.db.prepare('SELECT DISTINCT package FROM symbols WHERE package IS NOT NULL LIMIT 50')
        .all() as Array<{package:string}>).map(row=>row.package),
      topClasses:(this.db.prepare(
        "SELECT fqn FROM symbols WHERE kind = 'class' AND json_extract(data, '$.declaringClass') IS NULL LIMIT 50"
      ).all() as Array<{fqn:string}>).map(row=>row.fqn)
    };
  }
}
