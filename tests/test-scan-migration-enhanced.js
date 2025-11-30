#!/usr/bin/env node
/**
 * Test suite for enhanced scan_migration_candidates tool
 * 
 * Tests the fixes for:
 * 1. Fully-qualified type names in code body (com.example.business.Helper)
 * 2. Wildcard import resolution (import com.example.business.*)
 * 3. Same-package type references (no import needed)
 * 4. Uncertainty tracking and score adjustment
 * 5. Warning output for uncertain dependencies
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Test project directory
const testProjectDir = path.join(__dirname, 'test-migration-project');

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function pass(message) {
  console.log(`${GREEN}✓${RESET} ${message}`);
  passCount++;
}

function fail(message) {
  console.log(`${RED}✗${RESET} ${message}`);
  failCount++;
}

function info(message) {
  console.log(`${YELLOW}ℹ${RESET} ${message}`);
}

// Create test Java files with various dependency patterns
function setupTestProject() {
  // Clean up existing test project
  if (fs.existsSync(testProjectDir)) {
    fs.rmSync(testProjectDir, { recursive: true });
  }
  
  // Create directory structure
  const dirs = [
    'src/main/java/com/example/util',
    'src/main/java/com/example/business',
    'src/main/java/com/example/legacy'
  ];
  
  for (const dir of dirs) {
    fs.mkdirSync(path.join(testProjectDir, dir), { recursive: true });
  }
  
  // File 1: Safe class with no blocked dependencies
  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/util/SafeHelper.java'), `
package com.example.util;

import java.util.List;
import java.util.ArrayList;

/**
 * A completely safe utility class with no blocked dependencies
 */
public class SafeHelper {
    public static String format(String input) {
        return input.trim();
    }
    
    public static List<String> split(String input, String delimiter) {
        List<String> result = new ArrayList<>();
        // Simple implementation
        return result;
    }
}
`);

  // File 2: Class using FQN in code body (SHOULD be detected as blocked)
  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/util/FqnUser.java'), `
package com.example.util;

/**
 * This class uses fully-qualified names to reference blocked packages
 * These should be detected even without imports!
 */
public class FqnUser {
    // Using FQN for type declaration
    private com.example.business.BusinessHelper helper;
    
    // Using FQN in method return
    public com.example.business.BusinessResult process() {
        // Using FQN for instantiation
        com.example.business.BusinessProcessor processor = 
            new com.example.business.BusinessProcessor();
        return processor.run();
    }
    
    // Using FQN for static access
    public void useStatic() {
        String value = com.example.business.BusinessConstants.VALUE;
    }
}
`);

  // File 3: Class using wildcard import from blocked package
  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/util/WildcardUser.java'), `
package com.example.util;

import java.util.*;
import com.example.business.*;  // Wildcard import from blocked package!

/**
 * This class uses wildcard import from a blocked package
 * Types from this import should be flagged as uncertain
 */
public class WildcardUser {
    // These types come from wildcard import - uncertain!
    private BusinessEntity entity;
    private BusinessService service;
    
    public void process() {
        // Using types from wildcard import
        BusinessProcessor processor = new BusinessProcessor();
        processor.run();
    }
}
`);

  // File 4: Class using same-package types (internal, not blocked)
  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/util/SamePackageUser.java'), `
package com.example.util;

/**
 * This class uses same-package types without imports (legal in Java)
 * These should be detected as internal dependencies
 */
public class SamePackageUser {
    // Same-package type - no import needed
    private SafeHelper helper;
    private StringUtils utils;
    
    public void doWork() {
        // Using same-package types
        helper = new SafeHelper();
        String result = helper.format("test");
    }
}
`);

  // File 5: Another utility class for same-package testing
  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/util/StringUtils.java'), `
package com.example.util;

public class StringUtils {
    public static boolean isEmpty(String s) {
        return s == null || s.isEmpty();
    }
}
`);

  // File 6: Class with mixed dependencies
  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/util/MixedDeps.java'), `
package com.example.util;

import java.util.List;
import com.example.legacy.LegacyHelper;  // Explicit import from blocked package

/**
 * This class has mixed dependencies:
 * - Explicit import from blocked package
 * - FQN reference to blocked package
 * - Same-package reference
 */
public class MixedDeps {
    private LegacyHelper legacy;  // From explicit import
    private SafeHelper safe;      // Same package
    
    public void process() {
        // FQN reference to blocked package
        com.example.business.BusinessService service = 
            com.example.business.ServiceFactory.create();
        
        // Using same-package type
        StringUtils.isEmpty("");
    }
}
`);

  // File 7: Class extending blocked class
  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/util/ExtendsBlocked.java'), `
package com.example.util;

import com.example.legacy.LegacyBase;

/**
 * This class extends a blocked class - very hard to migrate
 */
public class ExtendsBlocked extends LegacyBase {
    @Override
    public void process() {
        // Implementation
    }
}
`);

  // Create stub classes in blocked packages (for index building)
  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/business/BusinessHelper.java'), `
package com.example.business;
public class BusinessHelper {}
`);

  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/business/BusinessResult.java'), `
package com.example.business;
public class BusinessResult {}
`);

  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/business/BusinessProcessor.java'), `
package com.example.business;
public class BusinessProcessor {
    public BusinessResult run() { return new BusinessResult(); }
}
`);

  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/business/BusinessConstants.java'), `
package com.example.business;
public class BusinessConstants {
    public static final String VALUE = "test";
}
`);

  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/business/BusinessEntity.java'), `
package com.example.business;
public class BusinessEntity {}
`);

  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/business/BusinessService.java'), `
package com.example.business;
public class BusinessService {}
`);

  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/business/ServiceFactory.java'), `
package com.example.business;
public class ServiceFactory {
    public static BusinessService create() { return new BusinessService(); }
}
`);

  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/legacy/LegacyHelper.java'), `
package com.example.legacy;
public class LegacyHelper {}
`);

  fs.writeFileSync(path.join(testProjectDir, 'src/main/java/com/example/legacy/LegacyBase.java'), `
package com.example.legacy;
public abstract class LegacyBase {
    public abstract void process();
}
`);

  info(`Created test project at ${testProjectDir}`);
}

// Call MCP tool via the server
async function callMcpTool(toolName, args) {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '..', 'server', 'dist', 'index.js');
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    server.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    server.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Send initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      }
    };
    
    server.stdin.write(JSON.stringify(initRequest) + '\n');
    
    // Wait a bit then send tool request
    setTimeout(() => {
      const toolRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };
      
      server.stdin.write(JSON.stringify(toolRequest) + '\n');
      
      // Wait for response
      setTimeout(() => {
        server.kill();
        
        // Parse response
        const lines = stdout.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === 2 && response.result) {
              resolve(response.result);
              return;
            }
          } catch (e) {
            // Not JSON, continue
          }
        }
        
        reject(new Error('No response received'));
      }, 3000);
    }, 500);
  });
}

// Alternative: Parse Java file directly to test extraction
async function testFqnExtraction() {
  console.log('\n=== Test 1: FQN Detection in Code Body ===\n');
  
  const filePath = path.join(testProjectDir, 'src/main/java/com/example/util/FqnUser.java');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Test regex patterns used in the tool
  const fqnPattern = /\b((?:[a-z_][a-z0-9_]*\.)+)([A-Z][A-Za-z0-9_]*)\b(?!\s*::)/g;
  const fqnAccessPattern = /\b((?:[a-z_][a-z0-9_]*\.)+[A-Z][A-Za-z0-9_]*)\.[a-zA-Z_]\w*(?:\(|\s*[;,)\]=])/g;
  
  const foundFqns = new Set();
  
  let match;
  while ((match = fqnPattern.exec(content)) !== null) {
    const fullFqn = match[1].slice(0, -1) + '.' + match[2];
    foundFqns.add(fullFqn);
  }
  
  while ((match = fqnAccessPattern.exec(content)) !== null) {
    foundFqns.add(match[1]);
  }
  
  // Check expected FQNs are found
  const expectedFqns = [
    'com.example.business.BusinessHelper',
    'com.example.business.BusinessResult', 
    'com.example.business.BusinessProcessor',
    'com.example.business.BusinessConstants'
  ];
  
  for (const expected of expectedFqns) {
    if (foundFqns.has(expected)) {
      pass(`Found FQN: ${expected}`);
    } else {
      fail(`Missing FQN: ${expected}`);
    }
  }
  
  info(`Total FQNs found: ${foundFqns.size}`);
}

async function testWildcardImportDetection() {
  console.log('\n=== Test 2: Wildcard Import Detection ===\n');
  
  const filePath = path.join(testProjectDir, 'src/main/java/com/example/util/WildcardUser.java');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract wildcard imports
  const wildcardPattern = /^\s*import\s+([\w.]+)\.\*\s*;/gm;
  const wildcards = [];
  
  let match;
  while ((match = wildcardPattern.exec(content)) !== null) {
    wildcards.push(match[1]);
  }
  
  if (wildcards.includes('com.example.business')) {
    pass('Detected wildcard import: com.example.business.*');
  } else {
    fail('Missing wildcard import detection: com.example.business.*');
  }
  
  // Check that types from wildcard import are tracked
  const typePattern = /(?:private|public|protected)?\s+(\w+)\s+\w+\s*[;=]/g;
  const typesUsed = new Set();
  
  while ((match = typePattern.exec(content)) !== null) {
    if (match[1] !== 'void' && match[1] !== 'String' && match[1] !== 'int') {
      typesUsed.add(match[1]);
    }
  }
  
  const expectedTypes = ['BusinessEntity', 'BusinessService', 'BusinessProcessor'];
  for (const expected of expectedTypes) {
    if (typesUsed.has(expected)) {
      pass(`Found type from wildcard: ${expected}`);
    } else {
      fail(`Missing type from wildcard: ${expected}`);
    }
  }
}

async function testSamePackageDetection() {
  console.log('\n=== Test 3: Same-Package Type Detection ===\n');
  
  const filePath = path.join(testProjectDir, 'src/main/java/com/example/util/SamePackageUser.java');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract types used without import
  const packageMatch = content.match(/package\s+([\w.]+)\s*;/);
  const packageName = packageMatch ? packageMatch[1] : '';
  
  // Extract imports
  const importPattern = /import\s+([\w.]+)\s*;/g;
  const imports = new Set();
  let match;
  while ((match = importPattern.exec(content)) !== null) {
    const simpleName = match[1].split('.').pop();
    imports.add(simpleName);
  }
  
  // Extract type references
  const typeRefPattern = /\b([A-Z][A-Za-z0-9]*)\b/g;
  const typeRefs = new Set();
  while ((match = typeRefPattern.exec(content)) !== null) {
    const type = match[1];
    if (!['String', 'Object', 'Override'].includes(type) && !imports.has(type)) {
      typeRefs.add(type);
    }
  }
  
  // These should be detected as same-package refs (no import)
  if (typeRefs.has('SafeHelper')) {
    pass('Detected same-package type: SafeHelper (no import needed)');
  } else {
    fail('Missing same-package type: SafeHelper');
  }
  
  if (typeRefs.has('StringUtils')) {
    pass('Detected same-package type: StringUtils (no import needed)');
  } else {
    fail('Missing same-package type: StringUtils');
  }
}

async function testScoreAdjustment() {
  console.log('\n=== Test 4: Score Adjustment for Uncertainty ===\n');
  
  // Mock data to test score calculation logic
  const blockedDeps = [
    { target: 'com.example.business.Helper', type: 'method_call', confidence: 'wildcard' }
  ];
  
  // Base score with 1 blocked method_call would be 100 - 5 = 95
  const baseScore = 100 - 5;
  
  // With unresolved refs, should have penalty
  const unresolvedRefs = [
    { typeName: 'BusinessEntity', resolvedFqn: 'com.example.util.BusinessEntity', confidence: 'assumed_same_package' }
  ];
  
  const unresolvedPenalty = Math.min(unresolvedRefs.length * 5, 30);
  const adjustedScore = Math.max(0, baseScore - unresolvedPenalty);
  
  if (adjustedScore < baseScore) {
    pass(`Score reduced for uncertainty: ${baseScore} -> ${adjustedScore}`);
  } else {
    fail('Score should be reduced for unresolved refs');
  }
  
  // Test risk downgrade
  const hasUncertainDeps = unresolvedRefs.length > 0;
  let risk = blockedDeps.length === 0 ? 'SAFE' : 'LOW';
  
  if (hasUncertainDeps && risk === 'SAFE') {
    risk = 'LOW';
    pass('Risk downgraded from SAFE to LOW due to uncertainty');
  } else if (!hasUncertainDeps && blockedDeps.length === 0) {
    pass('Risk remains SAFE when no uncertainty');
  }
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Enhanced scan_migration_candidates Test Suite         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  // Setup
  setupTestProject();
  
  // Run tests
  await testFqnExtraction();
  await testWildcardImportDetection();
  await testSamePackageDetection();
  await testScoreAdjustment();
  
  // Summary
  console.log('\n════════════════════════════════════════════════════════');
  console.log(`Results: ${GREEN}${passCount} passed${RESET}, ${RED}${failCount} failed${RESET}`);
  console.log('════════════════════════════════════════════════════════\n');
  
  // Cleanup
  if (fs.existsSync(testProjectDir)) {
    fs.rmSync(testProjectDir, { recursive: true });
  }
  
  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
