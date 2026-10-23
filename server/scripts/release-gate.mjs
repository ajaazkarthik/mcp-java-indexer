import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = (p) => readFileSync(join(root, p), 'utf8');
const storage = source('src/storage/sqlite-storage.ts');
const persistence = source('src/persistence.ts');
const query = source('src/query-service.ts');
const index = source('src/index.ts');
const search = source('src/tools/search_text.ts');
const semantic = source('src/tools/semantic_search.ts');
const migration = source('src/tools/scan_migration_candidates.ts');
const explore = source('src/tools/explore_codebase.ts');
const readme = source('../README.md');
const checks = [
 ['1 SQLite query service', query.includes('class QueryService extends MemoryIndex') &&
    query.includes('SELECT data FROM symbols') &&
    query.includes('.iterate()')],
 ['1 no full hydration', !/private async loadFromStorage[\s\S]*?getAllSymbols\(\)/.test(persistence) &&
    persistence.includes('setPersistedStats')],
 ['2 incremental persistence', persistence.includes('saveFileIncremental(') &&
    !/private async saveToStorage[\s\S]*?this\.storage\.clear\(\)/.test(persistence)],
 ['3 exact symbol lookup', storage.includes('idx_symbols_name_kind') &&
    storage.includes('WHERE name = ? LIMIT 50')],
 ['4 references indexed', storage.includes('idx_refs_to_name') &&
    storage.includes('idx_refs_to_covering') &&
    storage.includes('ref_simple_name(to_fqn) = ? COLLATE NOCASE')],
 ['5 streaming scans', storage.includes('stmt.iterate()') &&
    semantic.includes('setImmediate(resolve)') &&
    migration.includes('setImmediate(resolve)') &&
    explore.includes('setImmediate(resolve)')],
 ['6 abort propagation', index.includes('extra.signal') &&
    index.includes('indexValidator.ensureFresh(memoryIndex, indexerClient, persistence, signal)') &&
    search.includes('signal?.aborted')],
 ['7 SQLite pragmas/maintenance', storage.includes('mmap_size = 4294967296') &&
    storage.includes('busy_timeout = 5000') &&
    storage.includes('wal_checkpoint(PASSIVE)')],
 ['8 native storage documentation', readme.includes('INDEX_VALIDATOR_DISABLED=true') &&
    !readme.includes('SQLite via WebAssembly') &&
    !readme.includes('sql.js](https://github.com/sql-js')],
 ['18 tools registered', (index.match(/\n    \w+Tool,?/g) || []).length === 18 &&
    index.includes("case 'test_coverage':")]
];
let failures=0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) failures++;
}
assert.equal(failures, 0, failures + ' release gate checks failed');
