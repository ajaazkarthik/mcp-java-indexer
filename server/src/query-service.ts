/**
 * Read-only, SQLite-backed replacement for MemoryIndex used by MCP query tools.
 * The only metadata we retain at startup is the indexed file list; symbols,
 * references and call edges remain on disk until a query requests them.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import {simpleNameSql, simpleNameOf} from './storage/sql-expressions.js';
import { MemoryIndex, SymbolStub, Reference, CallGraphEdge, FileInfo } from './memory-index.js';

type SymbolRow = { fqn: string; data: string };
type RefRow = { id: number; from_fqn: string; to_fqn: string; file: string; line: number; col: number; kind: Reference['kind'] };
type EdgeRow = { caller: string; callee: string; locations: string };
type FileRow = { path: string; hash: string; last_indexed: number; mtime: number | null; symbols: string };


const SIMPLE_REF = simpleNameSql('to_fqn');
const SIMPLE_CALLER = simpleNameSql('caller');
const SIMPLE_CALLEE = simpleNameSql('callee');

class DiskSymbolMap extends Map<string, SymbolStub> {
  private cachedSize: number | undefined;
  private readonly statements: Record<string, Database.Statement>;

  constructor(private readonly db: Database.Database) {
    super();
    this.statements = {
      count: db.prepare('SELECT COUNT(*) AS n FROM symbols'),
      get: db.prepare('SELECT data FROM symbols WHERE fqn = ?'),
      has: db.prepare('SELECT 1 FROM symbols WHERE fqn = ?'),
      entries: db.prepare('SELECT fqn, data FROM symbols'),
      values: db.prepare('SELECT data FROM symbols'),
      keys: db.prepare('SELECT fqn FROM symbols')
    };
  }
  invalidate(): void { this.cachedSize = undefined; }
  override get size(): number {
    if (this.cachedSize === undefined)
      this.cachedSize = (this.statements.count.get() as {n:number}).n;
    return this.cachedSize;
  }
  override get(fqn: string): SymbolStub | undefined {
    const row = this.statements.get.get(fqn) as {data:string} | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  override has(fqn: string): boolean {
    return Boolean(this.statements.has.get(fqn));
  }
  override *entries(): MapIterator<[string, SymbolStub]> {
    for (const row of this.statements.entries.iterate() as IterableIterator<SymbolRow>)
      yield [row.fqn, JSON.parse(row.data)];
  }
  override *values(): MapIterator<SymbolStub> {
    for (const row of this.statements.values.iterate() as IterableIterator<{data:string}>)
      yield JSON.parse(row.data);
  }
  override *keys(): MapIterator<string> {
    for (const row of this.statements.keys.iterate() as IterableIterator<{fqn:string}>)
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
  private readonly _stmts: Record<string, Database.Statement>;
  private statementObserver?: (statementName: string) => void;
  private usageLimitReached = false;
  override wasUsageSearchTruncated(): boolean { return this.usageLimitReached; }

  constructor(projectRoot: string) {
    super();
    this.setIndexDir(projectRoot);
    this.db = new Database(path.join(this.getIndexDir(), 'index.db'), {
      readonly: true, fileMustExist: true
    });
    this.diskSymbols = new DiskSymbolMap(this.db);
    const selectRefs = 'SELECT id, from_fqn, to_fqn, file, line, col, kind FROM refs';
    const selectEdges = 'SELECT caller, callee, locations FROM call_edges_forward';
    this._stmts = {
      members: this.db.prepare("SELECT data FROM symbols WHERE (fqn >= ? AND fqn < ?) OR json_extract(data,'$.declaringClass') = ?"),
      namedClasses: this.db.prepare("SELECT data FROM symbols WHERE name = ? AND kind IN ('class','interface','enum','record') LIMIT 50"),
      exactNames: this.db.prepare('SELECT data FROM symbols WHERE name = ? LIMIT 50'),
      partialSymbols: this.db.prepare('SELECT data FROM symbols WHERE name LIKE ? OR fqn LIKE ? ORDER BY name LIMIT 200'),
      refsExact: this.db.prepare(selectRefs + ' WHERE to_fqn = ?'),
      refsSimple: this.db.prepare(selectRefs + ' WHERE ' + SIMPLE_REF + ' = ? COLLATE NOCASE LIMIT 5000'),
      refsFrom: this.db.prepare(selectRefs + ' WHERE from_fqn = ? OR (from_fqn >= ? AND from_fqn < ?) OR (from_fqn >= ? AND from_fqn < ?)'),
      outboundExact: this.db.prepare(selectEdges + ' WHERE caller = ?'),
      outboundSimple: this.db.prepare(selectEdges + ' WHERE ' + SIMPLE_CALLER + ' = ? COLLATE NOCASE LIMIT 100'),
      inboundExact: this.db.prepare(selectEdges + ' WHERE callee = ?'),
      inboundSimple: this.db.prepare(selectEdges + ' WHERE ' + SIMPLE_CALLEE + ' = ? COLLATE NOCASE LIMIT 100'),
      parents: this.db.prepare('SELECT parent FROM inheritance WHERE child = ?'),
      children: this.db.prepare('SELECT child FROM inheritance WHERE parent = ?'),
      file: this.db.prepare('SELECT * FROM files WHERE path = ?'),
      allFiles: this.db.prepare('SELECT * FROM files'),
      indexedFiles: this.db.prepare('SELECT path FROM files WHERE is_indexed = 1'),
      symbolsCount: this.db.prepare('SELECT COUNT(*) AS n FROM symbols'),
      allFilesCount: this.db.prepare('SELECT COUNT(*) AS n FROM files'),
      indexedFilesCount: this.db.prepare('SELECT COUNT(*) AS n FROM files WHERE is_indexed = 1'),
      refsCount: this.db.prepare('SELECT COUNT(*) AS n FROM refs'),
      edgesCount: this.db.prepare('SELECT COUNT(*) AS n FROM call_edges_forward'),
      inheritanceCount: this.db.prepare('SELECT COUNT(*) AS n FROM inheritance'),
      kindSummary: this.db.prepare('SELECT kind, COUNT(*) AS count FROM symbols GROUP BY kind'),
      packages: this.db.prepare('SELECT DISTINCT package FROM symbols WHERE package IS NOT NULL LIMIT 50'),
      topClasses: this.db.prepare("SELECT fqn FROM symbols WHERE kind = 'class' AND json_extract(data, '$.declaringClass') IS NULL LIMIT 50")
    };
  }

  /** Diagnostic observer for tests; not exposed as an MCP tool. */
  setStatementObserver(observer?: (name: string) => void): void {
    this.statementObserver = observer;
  }
  private all<T>(name: string, ...params: Array<string|number>): T[] {
    this.statementObserver?.(name);
    return this._stmts[name].all(...params) as T[];
  }
  private one<T>(name: string, ...params: Array<string|number>): T | undefined {
    this.statementObserver?.(name);
    return this._stmts[name].get(...params) as T | undefined;
  }
  /** EXPLAIN uses a separately prepared diagnostic statement, never on the normal hot path. */
  explainQueryPlan(sql: string, ...params: Array<string|number>): string {
    return (this.db.prepare('EXPLAIN QUERY PLAN '+sql)
      .all(...params) as Array<{detail:string}>).map(row=>row.detail).join(' ');
  }
  close(): void {
    this.diskSymbols.invalidate();
    this.statementObserver = undefined;
    if (this.db.open) this.db.close();
  }

  override getSymbol(fqn: string): SymbolStub | undefined { return this.diskSymbols.get(fqn); }
  override getAllSymbols(): Map<string,SymbolStub> { return this.diskSymbols; }

  override getMembers(classFqn: string): SymbolStub[] {
    return this.all<{data:string}>('members',classFqn+'.',classFqn+'.'+String.fromCharCode(0xffff),classFqn)
      .map(row=>JSON.parse(row.data));
  }
  override findClassesByName(name: string): SymbolStub[] {
    return this.all<{data:string}>('namedClasses',name).map(row=>JSON.parse(row.data));
  }
  override findSymbols(query: string): SymbolStub[] {
    const exact=this.getSymbol(query);
    if (exact) return [exact];
    if (!query.includes('.')) {
      const named=this.all<{data:string}>('exactNames',query);
      if (named.length) return named.map(row=>JSON.parse(row.data));
    }
    const pattern='%'+query+'%';
    return this.all<{data:string}>('partialSymbols',pattern,pattern)
      .map(row=>JSON.parse(row.data));
  }
  private mapRef(row: RefRow): Reference {
    return {fromFqn:row.from_fqn,toFqn:row.to_fqn,file:row.file,
      line:row.line,column:row.col,kind:row.kind};
  }
  override findUsages(fqn: string): Reference[] {
    const exact=this.all<RefRow>('refsExact',fqn);
    const simple=simpleNameOf(fqn);
    const fuzzy=this.all<RefRow>('refsSimple',simple);
    this.usageLimitReached = fuzzy.length >= 5000;
    const merged=new Map<number,Reference>();
    for(const row of [...exact,...fuzzy]) merged.set(row.id,this.mapRef(row));
    return [...merged.values()];
  }
  override findReferencesFromClass(fqn: string): Reference[] {
    const max=String.fromCharCode(0xffff);
    return this.all<RefRow>('refsFrom',fqn,fqn+'.',fqn+'.'+max,fqn+'(',fqn+'('+max)
      .map(row=>this.mapRef(row));
  }
  private edges(rows: EdgeRow[]): CallGraphEdge[] {
    return rows.map(row=>({caller:row.caller,callee:row.callee,
      locations:JSON.parse(row.locations)}));
  }
  override getOutboundCalls(fqn: string): CallGraphEdge[] {
    const exact=this.all<EdgeRow>('outboundExact',fqn);
    if(exact.length) return this.edges(exact);
    const name=simpleNameOf(fqn);
    return this.edges(this.all<EdgeRow>('outboundSimple',name));
  }
  override getInboundCalls(fqn: string): CallGraphEdge[] {
    const exact=this.all<EdgeRow>('inboundExact',fqn);
    if(exact.length) return this.edges(exact);
    const name=simpleNameOf(fqn);
    return this.edges(this.all<EdgeRow>('inboundSimple',name));
  }
  override getParents(fqn: string): string[] {
    return this.all<{parent:string}>('parents',fqn).map(row=>row.parent);
  }
  override getChildren(fqn: string): string[] {
    return this.all<{child:string}>('children',fqn).map(row=>row.child);
  }
  private asFile(row: FileRow): FileInfo {
    return {path:row.path,hash:row.hash,lastIndexed:row.last_indexed,
      mtime:row.mtime??row.last_indexed,symbols:JSON.parse(row.symbols||'[]')};
  }
  override getFile(file: string): FileInfo | undefined {
    const row=this.one<FileRow>('file',file);
    return row?this.asFile(row):undefined;
  }
  override getAllFiles(): FileInfo[] {
    const results: FileInfo[]=[];
    this.statementObserver?.('allFiles');
    for(const row of this._stmts.allFiles.iterate() as IterableIterator<FileRow>)
      results.push(this.asFile(row));
    return results;
  }
  override getIndexedFiles(): string[] {
    return this.all<{path:string}>('indexedFiles').map(row=>row.path);
  }
  override getStats() {
    const n=(key:string)=>this.one<{n:number}>(key)!.n;
    return {symbols:n('symbolsCount'),files:n('indexedFilesCount'),
      indexedFiles:n('indexedFilesCount'),allFiles:n('allFilesCount'),
      references:n('refsCount'),callGraphEdges:n('edgesCount'),
      inheritanceRelations:n('inheritanceCount')};
  }
  override getSymbolSummary(): {byKind:Record<string,number>;packages:string[];topClasses:string[]} {
    return {
      byKind:Object.fromEntries(this.all<{kind:string;count:number}>('kindSummary')
        .map(row=>[row.kind,row.count])),
      packages:this.all<{package:string}>('packages').map(row=>row.package),
      topClasses:this.all<{fqn:string}>('topClasses').map(row=>row.fqn)
    };
  }
}
