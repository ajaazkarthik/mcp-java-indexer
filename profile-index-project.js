#!/usr/bin/env node
// Utility script to run the MCP server's index_project tool with profiling enabled and persist metrics.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    rootDir: null,
    metricsOutputPath: null,
    forceFullIndex: false,
    profile: true,
    sourceRoots: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--root':
      case '-r':
        result.rootDir = args[++i];
        break;
      case '--metrics':
      case '-m':
        result.metricsOutputPath = args[++i];
        break;
      case '--force':
        result.forceFullIndex = true;
        break;
      case '--no-profile':
        result.profile = false;
        break;
      case '--sourceRoots':
        result.sourceRoots = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  if (!result.rootDir) {
    console.error('Error: --root <path> is required');
    printHelp();
    process.exit(1);
  }

  result.rootDir = path.resolve(result.rootDir);

  if (result.metricsOutputPath) {
    result.metricsOutputPath = path.resolve(result.metricsOutputPath);
  } else {
    const filename = `index-metrics-${Date.now()}.json`;
    result.metricsOutputPath = path.resolve(result.rootDir, filename);
  }

  if (result.sourceRoots) {
    result.sourceRoots = result.sourceRoots.split(',').map(entry => entry.trim()).filter(Boolean);
  }

  return result;
}

function printHelp() {
  console.log(`Usage: node profile-index-project.js --root <path> [options]

Options:
  --root, -r <path>        Absolute or relative path to Java project root (required)
  --metrics, -m <path>     Where to write metrics JSON (defaults inside root)
  --force                  Force a full index instead of incremental
  --no-profile             Disable profiling logs (profiling is on by default)
  --sourceRoots <list>     Comma-separated list of source roots relative to root
  --help, -h               Show this help message
`);
}

async function run() {
  const { rootDir, metricsOutputPath, forceFullIndex, profile, sourceRoots } = parseArgs();

  const serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
  if (!fs.existsSync(serverPath)) {
    console.error('Error: server/dist/index.js not found. Run "npm run build" in the server directory first.');
    process.exit(1);
  }

  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const rlOut = readline.createInterface({
    input: server.stdout,
    crlfDelay: Infinity
  });

  const rlErr = readline.createInterface({
    input: server.stderr,
    crlfDelay: Infinity
  });

  let requestSent = false;

  rlOut.on('line', line => {
    try {
      const response = JSON.parse(line);
      if (response.error) {
        console.error('Tool error:', response.error);
        server.kill();
        process.exit(1);
      }
      if (response.result) {
        const payload = response.result.content?.[0]?.text ?? '';
        console.log('\n=== Tool Output ===');
        console.log(payload);
        console.log('=== End Output ===\n');
        console.log(`Metrics written to ${metricsOutputPath}`);
        server.kill();
        process.exit(0);
      }
    } catch (err) {
      // Ignore non-JSON lines on stdout
    }
  });

  rlErr.on('line', line => {
    const trimmed = line.trim();
    console.error(trimmed);
    if (!requestSent && trimmed.includes('running on stdio')) {
      requestSent = true;
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootDir,
            forceFullIndex,
            profile,
            metricsOutputPath,
            ...(sourceRoots ? { sourceRoots } : {})
          }
        }
      };
      server.stdin.write(JSON.stringify(request) + '\n');
    }
  });

  server.on('exit', code => {
    if (!requestSent && code !== 0) {
      console.error(`Indexer server exited before processing request (code ${code}).`);
      process.exit(code ?? 1);
    }
  });
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
