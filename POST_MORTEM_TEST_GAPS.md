# Task 6: Post-Mortem – Why Tests Missed the Storage/Validation Gaps

## Summary

Multiple bugs related to storage, mtime persistence, and reference queries shipped because the existing test suite was oriented toward **happy-path smoke tests** rather than integration-style contracts that verify cross-layer behaviour.

---

## Bugs That Slipped Through

| Bug | Root Cause | Why Tests Missed It |
|-----|-----------|---------------------|
| mtime not persisted after indexing | `Persistence.save()` wasn't writing `mtime` field from file metadata | No test that saved index → reloaded → checked `needsReindex()` returns false for unchanged files |
| `findUsages` returning 0 results | Simple-name vs FQN mismatch between Java parser and TypeScript lookup | Tests inserted synthetic data with matching FQNs; live indexing produced different shapes |
| Call-graph inbound showing 0 callers | `reverseCallGraph` not populated in storage mode | Tests verified forward edges but not reverse |
| Incremental reindex always re-parsing | Hash/mtime comparison short-circuited by missing stored mtime | No round-trip test that touches file, waits, then asserts only that file re-parses |

---

## Root Causes of Test Gaps

1. **No save/load round-trip assertions**  
   Tests created in-memory data and queried immediately. No test ever serialized to disk, cleared memory, reloaded, and re-queried.

2. **Synthetic data hid FQN mismatches**  
   Hand-crafted test symbols used well-formed FQNs. The Java parser sometimes emitted simple names, which only surfaced with real code.

3. **Storage mode never tested E2E**  
   `test-e2e-storage.js` sets `ENABLE_STORAGE=1` but mostly tests tool dispatch, not data round-trips through SQLite/sql.js.

4. **Mocked time / filesystem**  
   Tests that touched mtime used mocks, so actual file-system stat behaviour wasn't exercised.

---

## Recommended Regression Tests

### RT-1: Persistence Round-Trip

```typescript
test('persistence round-trip preserves mtime', async () => {
  const memoryIndex = new MemoryIndex();
  memoryIndex.setIndexDir(testDir);

  // Add file with mtime
  const hash = 'abc123';
  const mtime = Date.now() - 60_000;
  memoryIndex.addFile('/project/Foo.java', hash, ['com.Foo'], true, mtime);

  // Persist
  const persistence = new Persistence(memoryIndex.getIndexDir());
  await persistence.save(memoryIndex);

  // Clear & reload
  memoryIndex.clear();
  await persistence.load(memoryIndex);

  // Unchanged file should NOT need reindex
  // (requires mocking fs.stat to return same mtime)
  expect(await memoryIndex.needsReindex('/project/Foo.java')).toBe(false);
});
```

### RT-2: Reference FQN Contract

```typescript
test('references stored with full FQN', async () => {
  // Index real project via indexerClient
  await indexerClient.indexFiles([testFile], sourceRoots);

  // Query using full FQN
  const refs = memoryIndex.findUsages('com.test.User');
  expect(refs.length).toBeGreaterThan(0);

  // Each ref.toFqn should start with package prefix
  for (const ref of refs) {
    expect(ref.toFqn).toMatch(/^com\.test\./);
  }
});
```

### RT-3: Reverse Call-Graph Populated

```typescript
test('reverse call graph has entries for known callees', () => {
  // After indexing a project with known call: Main.main() -> UserService.createUser()
  const inbound = memoryIndex.getInboundCalls('com.test.UserService.createUser(String)');
  expect(inbound.length).toBeGreaterThan(0);
  expect(inbound.some(e => e.caller.includes('Main.main'))).toBe(true);
});
```

### RT-4: Incremental Reindex Skips Unchanged

```typescript
test('incremental reindex skips unchanged files', async () => {
  // Index project once
  await handleIndexProject({ rootDir, forceFullIndex: true }, memoryIndex, indexerClient, setWatcher);

  // Capture current stats
  const before = memoryIndex.getStats();

  // Run again without force
  await handleIndexProject({ rootDir, forceFullIndex: false }, memoryIndex, indexerClient, setWatcher);

  // Should not have re-parsed anything (processedFiles = 0 in response)
  // Assert via console spy or response parsing
});
```

---

## Action Items

1. **Add `server/tests/` folder** with Jest / Vitest setup targeting TypeScript source.
2. **Implement RT-1 through RT-4** as baseline regression coverage.
3. **CI integration** — run tests on every PR to prevent future slippage.
4. **Mocking strategy** — create helper to stub `fs.stat` and system clock for deterministic mtime tests.

---

## Conclusion

The existing tests were **necessary but not sufficient**. They validated tool dispatch and basic queries but not the multi-layer contracts (Java → persistence → TypeScript lookup). Adding the four regression tests above will close the most critical gaps and prevent recurrence of the shipped bugs.

#mcp-java-indexer #testing #post-mortem
