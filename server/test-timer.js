#!/usr/bin/env node

// Test the MCP server with a simple find_symbol request
const request = {
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "find_symbol",
    "arguments": {
      "name": "String"
    }
  }
};

console.log("📤 Sending request to MCP server:");
console.log(JSON.stringify(request, null, 2));
console.log("\n⏳ Waiting for response...\n");

process.stdout.write(JSON.stringify(request) + "\n");

// Read response from stdin
let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  try {
    const response = JSON.parse(buffer);
    console.log("📥 Response from MCP server:");
    console.log(JSON.stringify(response, null, 2));
    process.exit(0);
  } catch (e) {
    // Wait for more data
  }
});

process.stdin.on("end", () => {
  if (buffer.trim()) {
    try {
      const response = JSON.parse(buffer);
      console.log("📥 Response from MCP server:");
      console.log(JSON.stringify(response, null, 2));
    } catch (e) {
      console.error("Failed to parse response:", e);
    }
  }
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error("❌ Timeout: No response from server");
  process.exit(1);
}, 10000);
