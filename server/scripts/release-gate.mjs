// Execute behavioral benchmarks on the same QueryService instance MCP tools use.
// No source-text checks: every assertion exercises a query, plan, timer or heap.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bench=fileURLToPath(new URL('./bench.test.mjs', import.meta.url));
const result=spawnSync(process.execPath,['--expose-gc','--test',bench],{
  stdio:'inherit',env:process.env
});
if(result.error) throw result.error;
if(result.status!==0) process.exit(result.status||1);
