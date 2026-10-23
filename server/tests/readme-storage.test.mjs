import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('README does not advertise deprecated JSON storage fallback', async()=>{
 const doc=await readFile(new URL('../../README.md',import.meta.url),'utf8');
 assert.doesNotMatch(doc,/JSON (?:persistence|fallback)|File-based \(Fallback\)|indices \(fallback\)/i);
 assert.match(doc,/better-sqlite3/);
});
