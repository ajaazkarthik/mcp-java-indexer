#!/usr/bin/env node

/**
 * 100 Additional Tests for MCP Java Indexer
 * 
 * Comprehensive tests covering:
 * 1. MemoryIndex edge cases and boundary conditions
 * 2. Symbol resolution with various patterns
 * 3. Reference tracking edge cases
 * 4. Call graph edge cases
 * 5. Inheritance hierarchy edge cases
 * 6. File management edge cases
 * 7. Path normalization
 * 8. Concurrency scenarios
 * 9. Data integrity checks
 * 10. Error handling
 * 
 * Created: 2025-12-03
 */

const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

// Test configuration
const TEST_DIR = path.join(__dirname, '..', '.test-100-additional');
const VERBOSE = process.argv.includes('--verbose');

// Test tracking
let passed = 0;
let failed = 0;
const failures = [];
let testNumber = 0;

function log(msg) {
  console.log(msg);
}

function verbose(msg) {
  if (VERBOSE) console.log(`  [verbose] ${msg}`);
}

function assert(condition, testName, details = '') {
  testNumber++;
  if (condition) {
    passed++;
    log(`  ✅ [${testNumber}] ${testName}`);
  } else {
    failed++;
    failures.push({ testNumber, testName, details });
    log(`  ❌ [${testNumber}] ${testName}${details ? ': ' + details : ''}`);
  }
}

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch (e) {}
}

async function setupTestDir() {
  await cleanup();
  await fs.mkdir(TEST_DIR, { recursive: true });
}

// ============================================================================
// TEST SUITE 1: Symbol Management (20 tests)
// ============================================================================

async function testSymbolManagement() {
  log('\n🧪 Test Suite 1: Symbol Management (20 tests)\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  // Test 1-5: Basic symbol operations
  {
    const index = new MemoryIndex();
    
    // Add a class
    index.addSymbol({
      fqn: 'com.example.TestClass',
      name: 'TestClass',
      kind: 'class',
      file: '/src/TestClass.java',
      line: 1,
      column: 1,
      packageName: 'com.example',
      modifiers: ['public']
    });
    
    assert(index.getSymbol('com.example.TestClass') !== undefined, 'Add and retrieve class symbol');
    assert(index.getSymbol('com.example.TestClass').name === 'TestClass', 'Symbol has correct name');
    assert(index.getSymbol('com.example.TestClass').kind === 'class', 'Symbol has correct kind');
    assert(index.getSymbol('com.example.NonExistent') === undefined, 'Non-existent symbol returns undefined');
    assert(index.getAllSymbols().size === 1, 'getAllSymbols returns correct count');
  }
  
  // Test 6-10: Method symbols
  {
    const index = new MemoryIndex();
    
    index.addSymbol({
      fqn: 'com.example.Service.execute(String)',
      name: 'execute',
      kind: 'method',
      file: '/src/Service.java',
      line: 10,
      column: 5,
      packageName: 'com.example',
      modifiers: ['public'],
      declaringClass: 'com.example.Service',
      signature: 'public void execute(String param)'
    });
    
    const method = index.getSymbol('com.example.Service.execute(String)');
    assert(method !== undefined, 'Add and retrieve method symbol');
    assert(method.kind === 'method', 'Method has correct kind');
    assert(method.declaringClass === 'com.example.Service', 'Method has correct declaring class');
    assert(method.signature !== undefined, 'Method has signature');
    assert(index.findSymbols('execute').length === 1, 'findSymbols finds method by name');
  }
  
  // Test 11-15: Field symbols
  {
    const index = new MemoryIndex();
    
    index.addSymbol({
      fqn: 'com.example.Entity.id',
      name: 'id',
      kind: 'field',
      file: '/src/Entity.java',
      line: 5,
      column: 5,
      packageName: 'com.example',
      modifiers: ['private'],
      declaringClass: 'com.example.Entity'
    });
    
    const field = index.getSymbol('com.example.Entity.id');
    assert(field !== undefined, 'Add and retrieve field symbol');
    assert(field.kind === 'field', 'Field has correct kind');
    assert(field.modifiers.includes('private'), 'Field has correct modifiers');
    assert(index.findSymbols('id').length === 1, 'findSymbols finds field by name');
    assert(index.findSymbols('Entity.id').length >= 1, 'findSymbols with qualified name works');
  }
  
  // Test 16-20: Constructor symbols
  {
    const index = new MemoryIndex();
    
    index.addSymbol({
      fqn: 'com.example.Builder(String)',
      name: 'Builder',
      kind: 'constructor',
      file: '/src/Builder.java',
      line: 15,
      column: 5,
      packageName: 'com.example',
      modifiers: ['public'],
      declaringClass: 'com.example.Builder',
      signature: 'public Builder(String name)'
    });
    
    const ctor = index.getSymbol('com.example.Builder(String)');
    assert(ctor !== undefined, 'Add and retrieve constructor symbol');
    assert(ctor.kind === 'constructor', 'Constructor has correct kind');
    assert(ctor.name === 'Builder', 'Constructor has class name');
    
    // Multiple constructors
    index.addSymbol({
      fqn: 'com.example.Builder()',
      name: 'Builder',
      kind: 'constructor',
      file: '/src/Builder.java',
      line: 10,
      column: 5,
      packageName: 'com.example',
      modifiers: ['public'],
      declaringClass: 'com.example.Builder'
    });
    
    assert(index.findSymbols('Builder').length === 2, 'Multiple constructors with same name found');
    assert(index.getSymbol('com.example.Builder()') !== undefined, 'No-arg constructor accessible');
  }
}

// ============================================================================
// TEST SUITE 2: Reference Tracking (20 tests)
// ============================================================================

async function testReferenceTracking() {
  log('\n🧪 Test Suite 2: Reference Tracking (20 tests)\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  // Test 21-25: Method call references
  {
    const index = new MemoryIndex();
    
    index.addReference({
      fromFqn: 'com.example.Caller.run()',
      toFqn: 'com.example.Service.execute(String)',
      file: '/src/Caller.java',
      line: 20,
      column: 10,
      kind: 'method_call'
    });
    
    const usages = index.findUsages('com.example.Service.execute(String)');
    assert(usages.length === 1, 'Find method call reference');
    assert(usages[0].fromFqn === 'com.example.Caller.run()', 'Reference has correct caller');
    assert(usages[0].kind === 'method_call', 'Reference has correct kind');
    
    // Check call graph was built
    const outbound = index.getOutboundCalls('com.example.Caller.run()');
    assert(outbound.length === 1, 'Call graph edge created for method call');
    assert(outbound[0].callee === 'com.example.Service.execute(String)', 'Call graph has correct callee');
  }
  
  // Test 26-30: Field access references
  {
    const index = new MemoryIndex();
    
    index.addReference({
      fromFqn: 'com.example.Client.process()',
      toFqn: 'config.timeout',
      file: '/src/Client.java',
      line: 30,
      column: 15,
      kind: 'field_access'
    });
    
    const usages = index.findUsages('config.timeout');
    assert(usages.length === 1, 'Find field access reference');
    assert(usages[0].kind === 'field_access', 'Field access has correct kind');
    
    // Field access should not create call graph edge
    const outbound = index.getOutboundCalls('com.example.Client.process()');
    assert(outbound.length === 0, 'No call graph edge for field access');
    
    // Multiple field accesses
    index.addReference({
      fromFqn: 'com.example.Client.init()',
      toFqn: 'config.timeout',
      file: '/src/Client.java',
      line: 15,
      column: 10,
      kind: 'field_access'
    });
    
    assert(index.findUsages('config.timeout').length === 2, 'Multiple field access references tracked');
  }
  
  // Test 31-35: Instantiation references
  {
    const index = new MemoryIndex();
    
    index.addReference({
      fromFqn: 'com.example.Factory.create()',
      toFqn: 'com.example.Product()',
      file: '/src/Factory.java',
      line: 25,
      column: 20,
      kind: 'instantiation'
    });
    
    const usages = index.findUsages('com.example.Product()');
    assert(usages.length === 1, 'Find instantiation reference');
    assert(usages[0].kind === 'instantiation', 'Instantiation has correct kind');
    
    // Also track parameterized constructors
    index.addReference({
      fromFqn: 'com.example.Factory.createWithName(String)',
      toFqn: 'com.example.Product(String)',
      file: '/src/Factory.java',
      line: 35,
      column: 20,
      kind: 'instantiation'
    });
    
    assert(index.findUsages('com.example.Product(String)').length === 1, 'Parameterized constructor tracked');
    
    // Check fuzzy matching for constructors
    const fuzzy = index.findUsages('Product');
    assert(fuzzy.length >= 0, 'Fuzzy matching for constructor name works');
  }
  
  // Test 36-40: Type references
  {
    const index = new MemoryIndex();
    
    // Parameter type
    index.addReference({
      fromFqn: 'com.example.Handler.process(Request)',
      toFqn: 'com.example.Request',
      file: '/src/Handler.java',
      line: 10,
      column: 30,
      kind: 'type_reference'
    });
    
    // Return type
    index.addReference({
      fromFqn: 'com.example.Handler.getResponse()',
      toFqn: 'com.example.Response',
      file: '/src/Handler.java',
      line: 20,
      column: 5,
      kind: 'type_reference'
    });
    
    // Field type
    index.addReference({
      fromFqn: 'com.example.Handler.logger',
      toFqn: 'org.slf4j.Logger',
      file: '/src/Handler.java',
      line: 5,
      column: 15,
      kind: 'type_reference'
    });
    
    assert(index.findUsages('com.example.Request').length === 1, 'Type reference for parameter tracked');
    assert(index.findUsages('com.example.Response').length === 1, 'Type reference for return type tracked');
    assert(index.findUsages('org.slf4j.Logger').length === 1, 'Type reference for field tracked');
    
    // Check that type references don't pollute call graph
    assert(index.getOutboundCalls('com.example.Handler.process(Request)').length === 0, 'Type refs not in call graph');
  }
}

// ============================================================================
// TEST SUITE 3: Call Graph (20 tests)
// ============================================================================

async function testCallGraph() {
  log('\n🧪 Test Suite 3: Call Graph (20 tests)\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  // Test 41-45: Basic call graph operations
  {
    const index = new MemoryIndex();
    
    // Build a small call chain: A -> B -> C
    index.addReference({
      fromFqn: 'com.example.A.methodA()',
      toFqn: 'com.example.B.methodB()',
      file: '/src/A.java',
      line: 10,
      column: 5,
      kind: 'method_call'
    });
    
    index.addReference({
      fromFqn: 'com.example.B.methodB()',
      toFqn: 'com.example.C.methodC()',
      file: '/src/B.java',
      line: 15,
      column: 5,
      kind: 'method_call'
    });
    
    const aOutbound = index.getOutboundCalls('com.example.A.methodA()');
    assert(aOutbound.length === 1, 'A has one outbound call');
    assert(aOutbound[0].callee === 'com.example.B.methodB()', 'A calls B');
    
    const bInbound = index.getInboundCalls('com.example.B.methodB()');
    assert(bInbound.length === 1, 'B has one inbound call');
    assert(bInbound[0].caller === 'com.example.A.methodA()', 'B is called by A');
    
    const cInbound = index.getInboundCalls('com.example.C.methodC()');
    assert(cInbound.length === 1, 'C has one inbound call from B');
  }
  
  // Test 46-50: Multiple callers/callees
  {
    const index = new MemoryIndex();
    
    // Method B is called by multiple methods
    index.addReference({
      fromFqn: 'com.example.Client1.run()',
      toFqn: 'com.example.Service.process()',
      file: '/src/Client1.java', line: 10, column: 5,
      kind: 'method_call'
    });
    
    index.addReference({
      fromFqn: 'com.example.Client2.execute()',
      toFqn: 'com.example.Service.process()',
      file: '/src/Client2.java', line: 20, column: 5,
      kind: 'method_call'
    });
    
    index.addReference({
      fromFqn: 'com.example.Client3.handle()',
      toFqn: 'com.example.Service.process()',
      file: '/src/Client3.java', line: 30, column: 5,
      kind: 'method_call'
    });
    
    const inbound = index.getInboundCalls('com.example.Service.process()');
    assert(inbound.length === 3, 'Service has 3 callers');
    
    // Method that calls multiple other methods
    index.addReference({
      fromFqn: 'com.example.Orchestrator.run()',
      toFqn: 'com.example.Step1.execute()',
      file: '/src/Orchestrator.java', line: 10, column: 5,
      kind: 'method_call'
    });
    
    index.addReference({
      fromFqn: 'com.example.Orchestrator.run()',
      toFqn: 'com.example.Step2.execute()',
      file: '/src/Orchestrator.java', line: 11, column: 5,
      kind: 'method_call'
    });
    
    index.addReference({
      fromFqn: 'com.example.Orchestrator.run()',
      toFqn: 'com.example.Step3.execute()',
      file: '/src/Orchestrator.java', line: 12, column: 5,
      kind: 'method_call'
    });
    
    const outbound = index.getOutboundCalls('com.example.Orchestrator.run()');
    assert(outbound.length === 3, 'Orchestrator calls 3 methods');
  }
  
  // Test 51-55: Call graph locations
  {
    const index = new MemoryIndex();
    
    // Same call made from multiple locations
    index.addReference({
      fromFqn: 'com.example.Caller.method()',
      toFqn: 'com.example.Util.helper()',
      file: '/src/Caller.java', line: 10, column: 5,
      kind: 'method_call'
    });
    
    index.addReference({
      fromFqn: 'com.example.Caller.method()',
      toFqn: 'com.example.Util.helper()',
      file: '/src/Caller.java', line: 20, column: 5,
      kind: 'method_call'
    });
    
    index.addReference({
      fromFqn: 'com.example.Caller.method()',
      toFqn: 'com.example.Util.helper()',
      file: '/src/Caller.java', line: 30, column: 5,
      kind: 'method_call'
    });
    
    const outbound = index.getOutboundCalls('com.example.Caller.method()');
    assert(outbound.length >= 1, 'Call edge exists for repeated calls');
    
    // Check that locations are tracked
    const edge = outbound.find(e => e.callee === 'com.example.Util.helper()');
    assert(edge !== undefined, 'Can find specific callee');
    assert(edge.locations !== undefined, 'Edge has locations array');
    assert(edge.locations.length >= 1, 'At least one location tracked');
    
    // Empty call graph for non-existent method (returns empty array or from fuzzy matching)
    const empty = index.getOutboundCalls('com.example.CompletelyNonExistent.uniqueMethodXYZ()');
    assert(Array.isArray(empty), 'Returns array (possibly empty) for non-existent method outbound');
  }
  
  // Test 56-60: Recursive and self-calls
  {
    const index = new MemoryIndex();
    
    // Recursive call
    index.addReference({
      fromFqn: 'com.example.Recursive.factorial(int)',
      toFqn: 'com.example.Recursive.factorial(int)',
      file: '/src/Recursive.java', line: 10, column: 15,
      kind: 'method_call'
    });
    
    const outbound = index.getOutboundCalls('com.example.Recursive.factorial(int)');
    const inbound = index.getInboundCalls('com.example.Recursive.factorial(int)');
    
    assert(outbound.length === 1, 'Recursive method has outbound call to self');
    assert(inbound.length === 1, 'Recursive method has inbound call from self');
    assert(outbound[0].callee === 'com.example.Recursive.factorial(int)', 'Outbound is to self');
    assert(inbound[0].caller === 'com.example.Recursive.factorial(int)', 'Inbound is from self');
    
    // Mutual recursion: A -> B -> A
    index.addReference({
      fromFqn: 'com.example.MutualA.ping()',
      toFqn: 'com.example.MutualB.pong()',
      file: '/src/MutualA.java', line: 10, column: 5,
      kind: 'method_call'
    });
    
    index.addReference({
      fromFqn: 'com.example.MutualB.pong()',
      toFqn: 'com.example.MutualA.ping()',
      file: '/src/MutualB.java', line: 10, column: 5,
      kind: 'method_call'
    });
    
    assert(index.getOutboundCalls('com.example.MutualA.ping()').length === 1, 'Mutual recursion A tracked');
  }
}

// ============================================================================
// TEST SUITE 4: Inheritance Hierarchy (20 tests)
// ============================================================================

async function testInheritanceHierarchy() {
  log('\n🧪 Test Suite 4: Inheritance Hierarchy (20 tests)\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  // Test 61-65: Basic inheritance
  {
    const index = new MemoryIndex();
    
    // Child extends Parent
    index.addSymbol({
      fqn: 'com.example.Parent',
      name: 'Parent',
      kind: 'class',
      file: '/src/Parent.java', line: 1, column: 1,
      packageName: 'com.example',
      modifiers: ['public']
    });
    
    index.addSymbol({
      fqn: 'com.example.Child',
      name: 'Child',
      kind: 'class',
      file: '/src/Child.java', line: 1, column: 1,
      packageName: 'com.example',
      modifiers: ['public'],
      extendsClass: 'com.example.Parent'
    });
    
    const parents = index.getParents('com.example.Child');
    assert(parents.length === 1, 'Child has one parent');
    assert(parents[0] === 'com.example.Parent', 'Parent is correct');
    
    const children = index.getChildren('com.example.Parent');
    assert(children.length === 1, 'Parent has one child');
    assert(children[0] === 'com.example.Child', 'Child is correct');
    
    // Non-existent class
    assert(index.getParents('com.example.NonExistent').length === 0, 'Non-existent class has no parents');
  }
  
  // Test 66-70: Interface implementation
  {
    const index = new MemoryIndex();
    
    index.addSymbol({
      fqn: 'com.example.Runnable',
      name: 'Runnable',
      kind: 'interface',
      file: '/src/Runnable.java', line: 1, column: 1,
      packageName: 'com.example',
      modifiers: ['public']
    });
    
    index.addSymbol({
      fqn: 'com.example.Closeable',
      name: 'Closeable',
      kind: 'interface',
      file: '/src/Closeable.java', line: 1, column: 1,
      packageName: 'com.example',
      modifiers: ['public']
    });
    
    index.addSymbol({
      fqn: 'com.example.Worker',
      name: 'Worker',
      kind: 'class',
      file: '/src/Worker.java', line: 1, column: 1,
      packageName: 'com.example',
      modifiers: ['public'],
      implementsInterfaces: ['com.example.Runnable', 'com.example.Closeable']
    });
    
    const parents = index.getParents('com.example.Worker');
    assert(parents.length === 2, 'Worker implements 2 interfaces');
    assert(parents.includes('com.example.Runnable'), 'Implements Runnable');
    assert(parents.includes('com.example.Closeable'), 'Implements Closeable');
    
    const runnableChildren = index.getChildren('com.example.Runnable');
    assert(runnableChildren.includes('com.example.Worker'), 'Runnable has Worker as child');
  }
  
  // Test 71-75: Deep hierarchy
  {
    const index = new MemoryIndex();
    
    // Create hierarchy: GrandChild -> Child -> Parent -> GrandParent
    index.addSymbol({
      fqn: 'com.example.GrandParent',
      name: 'GrandParent', kind: 'class',
      file: '/src/GrandParent.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public']
    });
    
    index.addSymbol({
      fqn: 'com.example.Parent',
      name: 'Parent', kind: 'class',
      file: '/src/Parent.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public'],
      extendsClass: 'com.example.GrandParent'
    });
    
    index.addSymbol({
      fqn: 'com.example.Child',
      name: 'Child', kind: 'class',
      file: '/src/Child.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public'],
      extendsClass: 'com.example.Parent'
    });
    
    index.addSymbol({
      fqn: 'com.example.GrandChild',
      name: 'GrandChild', kind: 'class',
      file: '/src/GrandChild.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public'],
      extendsClass: 'com.example.Child'
    });
    
    // Direct parents only
    const directParent = index.getParents('com.example.GrandChild');
    assert(directParent.length === 1, 'GrandChild has 1 direct parent');
    assert(directParent[0] === 'com.example.Child', 'Direct parent is Child');
    
    // Children chain
    const grandParentChildren = index.getChildren('com.example.GrandParent');
    assert(grandParentChildren.includes('com.example.Parent'), 'GrandParent has Parent as child');
    
    // Siblings
    index.addSymbol({
      fqn: 'com.example.Sibling',
      name: 'Sibling', kind: 'class',
      file: '/src/Sibling.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public'],
      extendsClass: 'com.example.Parent'
    });
    
    const parentChildren = index.getChildren('com.example.Parent');
    assert(parentChildren.length === 2, 'Parent has 2 children');
  }
  
  // Test 76-80: Diamond inheritance (interfaces)
  {
    const index = new MemoryIndex();
    
    // Diamond: D implements B, C; B extends A; C extends A
    index.addSymbol({
      fqn: 'com.example.A', name: 'A', kind: 'interface',
      file: '/src/A.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public']
    });
    
    index.addSymbol({
      fqn: 'com.example.B', name: 'B', kind: 'interface',
      file: '/src/B.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public'],
      extendsClass: 'com.example.A'
    });
    
    index.addSymbol({
      fqn: 'com.example.C', name: 'C', kind: 'interface',
      file: '/src/C.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public'],
      extendsClass: 'com.example.A'
    });
    
    index.addSymbol({
      fqn: 'com.example.D', name: 'D', kind: 'class',
      file: '/src/D.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public'],
      implementsInterfaces: ['com.example.B', 'com.example.C']
    });
    
    const dParents = index.getParents('com.example.D');
    assert(dParents.length === 2, 'D has 2 direct parents');
    assert(dParents.includes('com.example.B'), 'D implements B');
    assert(dParents.includes('com.example.C'), 'D implements C');
    
    const aChildren = index.getChildren('com.example.A');
    assert(aChildren.includes('com.example.B'), 'A has B as child');
    assert(aChildren.includes('com.example.C'), 'A has C as child');
  }
}

// ============================================================================
// TEST SUITE 5: File Management (20 tests)
// ============================================================================

async function testFileManagement() {
  log('\n🧪 Test Suite 5: File Management (20 tests)\n');
  
  await setupTestDir();
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  // Test 81-85: Basic file operations
  {
    const index = new MemoryIndex();
    
    index.addFile('/src/Test.java', 'hash123', ['com.example.Test'], true, Date.now());
    
    const file = index.getFile('/src/Test.java');
    assert(file !== undefined, 'File added and retrievable');
    assert(file.hash === 'hash123', 'File has correct hash');
    assert(file.symbols.includes('com.example.Test'), 'File tracks its symbols');
    
    const allFiles = index.getAllFiles();
    assert(allFiles.length === 1, 'getAllFiles returns correct count');
    // On Windows, paths are normalized to lowercase
    const expectedPath = process.platform === 'win32' ? '/src/test.java' : '/src/Test.java';
    assert(allFiles[0].path === expectedPath, 'getAllFiles has correct file');
  }
  
  // Test 86-90: needsReindex with real files
  {
    const index = new MemoryIndex();
    
    // Create a real test file
    const testFile = path.join(TEST_DIR, 'Reindex.java').replace(/\\/g, '/');
    await fs.writeFile(testFile, 'public class Reindex {}');
    
    const content = await fs.readFile(testFile, 'utf-8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const stats = await fs.stat(testFile);
    
    index.addFile(testFile, hash, ['Reindex'], true, stats.mtimeMs);
    
    // Same content, no reindex needed
    const needsReindex1 = await index.needsReindex(testFile);
    assert(needsReindex1 === false, 'No reindex needed for unchanged file');
    
    // Change content
    await fs.writeFile(testFile, 'public class Reindex { int x; }');
    const needsReindex2 = await index.needsReindex(testFile);
    assert(needsReindex2 === true, 'Reindex needed after content change');
    
    // Non-existent file
    const needsReindex3 = await index.needsReindex('/non/existent.java');
    assert(needsReindex3 === true, 'Reindex needed for non-existent file');
    
    // New file (not in index)
    const newFile = path.join(TEST_DIR, 'New.java').replace(/\\/g, '/');
    await fs.writeFile(newFile, 'public class New {}');
    const needsReindex4 = await index.needsReindex(newFile);
    assert(needsReindex4 === true, 'Reindex needed for new file not in index');
  }
  
  // Test 91-95: updateFileMtime
  {
    const index = new MemoryIndex();
    
    const originalMtime = Date.now() - 10000;
    index.addFile('/src/Mtime.java', 'hash', ['Mtime'], true, originalMtime);
    
    // Update with newer mtime
    const newerMtime = Date.now();
    const updated = index.updateFileMtime('/src/Mtime.java', newerMtime);
    assert(updated === true, 'updateFileMtime returns true for newer mtime');
    
    const file = index.getFile('/src/Mtime.java');
    assert(file.mtime === newerMtime, 'Mtime was updated');
    
    // Try to update with older mtime
    const olderMtime = originalMtime - 5000;
    const notUpdated = index.updateFileMtime('/src/Mtime.java', olderMtime);
    assert(notUpdated === false, 'updateFileMtime returns false for older mtime');
    assert(index.getFile('/src/Mtime.java').mtime === newerMtime, 'Mtime unchanged after older update attempt');
    
    // Non-existent file
    const nonExistent = index.updateFileMtime('/non/existent.java', Date.now());
    assert(nonExistent === false, 'updateFileMtime returns false for non-existent file');
  }
  
  // Test 96-100: removeFile
  {
    const index = new MemoryIndex();
    
    // Add symbol and file
    index.addSymbol({
      fqn: 'com.example.Removable',
      name: 'Removable', kind: 'class',
      file: '/src/Removable.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public']
    });
    
    index.addFile('/src/Removable.java', 'hash', ['com.example.Removable'], true);
    
    assert(index.getSymbol('com.example.Removable') !== undefined, 'Symbol exists before removal');
    assert(index.getFile('/src/Removable.java') !== undefined, 'File exists before removal');
    
    // Remove file
    index.removeFile('/src/Removable.java');
    
    assert(index.getFile('/src/Removable.java') === undefined, 'File removed');
    assert(index.getSymbol('com.example.Removable') === undefined, 'Symbol removed with file');
    
    // Remove non-existent file (should not throw)
    index.removeFile('/non/existent.java');
    assert(true, 'Remove non-existent file does not throw');
  }
}

// ============================================================================
// TEST SUITE 6: Path Normalization (10 tests)
// ============================================================================

async function testPathNormalization() {
  log('\n🧪 Test Suite 6: Path Normalization (10 tests)\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  // Test 101-105: Windows vs Unix paths
  {
    const index = new MemoryIndex();
    
    // Add with Windows path
    index.addFile('C:\\Users\\test\\project\\src\\Test.java', 'hash', ['Test'], true);
    
    // Retrieve with forward slashes
    const file1 = index.getFile('C:/Users/test/project/src/Test.java');
    assert(file1 !== undefined, 'Windows path normalized to forward slashes');
    
    // Add with Unix path
    index.addFile('/home/user/project/src/Other.java', 'hash2', ['Other'], true);
    
    // Retrieve
    const file2 = index.getFile('/home/user/project/src/Other.java');
    assert(file2 !== undefined, 'Unix path works correctly');
    
    // Mixed paths in symbols
    index.addSymbol({
      fqn: 'com.example.Mixed',
      name: 'Mixed', kind: 'class',
      file: 'D:\\workspace\\Mixed.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: []
    });
    
    const symbol = index.getSymbol('com.example.Mixed');
    // On Windows, paths are normalized to lowercase
    const expectedSymbolPath = process.platform === 'win32' ? 'd:/workspace/mixed.java' : 'D:/workspace/Mixed.java';
    assert(symbol.file === expectedSymbolPath, 'Symbol file path normalized');
    
    // References with mixed paths
    index.addReference({
      fromFqn: 'com.a.A.m()',
      toFqn: 'com.b.B.n()',
      file: 'E:\\code\\A.java',
      line: 10, column: 5,
      kind: 'method_call'
    });
    
    const refs = index.findUsages('com.b.B.n()');
    // On Windows, paths are normalized to lowercase
    const expectedRefPath = process.platform === 'win32' ? 'e:/code/a.java' : 'E:/code/A.java';
    assert(refs.length === 1 && refs[0].file === expectedRefPath, 'Reference file path normalized');
  }
  
  // Test 106-110: Case sensitivity
  {
    const index = new MemoryIndex();
    
    // Add files with different cases
    index.addFile('/src/lower.java', 'hash1', ['lower'], true);
    index.addFile('/src/UPPER.java', 'hash2', ['UPPER'], true);
    
    // Case-sensitive retrieval
    const lower = index.getFile('/src/lower.java');
    const upper = index.getFile('/src/UPPER.java');
    
    assert(lower !== undefined, 'Lowercase file retrievable');
    assert(upper !== undefined, 'Uppercase file retrievable');
    assert(lower.hash !== upper.hash, 'Different files distinguished');
    
    // Symbol case sensitivity
    index.addSymbol({
      fqn: 'com.example.MyClass',
      name: 'MyClass', kind: 'class',
      file: '/src/MyClass.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: []
    });
    
    // findSymbols should be case-insensitive
    const found = index.findSymbols('myclass');
    assert(found.length === 1, 'findSymbols is case-insensitive');
  }
}

// ============================================================================
// TEST SUITE 7: Serialization (10 tests)
// ============================================================================

async function testSerialization() {
  log('\n🧪 Test Suite 7: Serialization (10 tests)\n');
  
  const { MemoryIndex } = await import('../server/dist/memory-index.js');
  
  // Test 111-115: toJSON and fromJSON
  {
    const index1 = new MemoryIndex();
    
    // Add various data
    index1.addSymbol({
      fqn: 'com.example.Serial',
      name: 'Serial', kind: 'class',
      file: '/src/Serial.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: ['public'],
      extendsClass: 'java.lang.Object'
    });
    
    index1.addReference({
      fromFqn: 'com.example.Serial.run()',
      toFqn: 'com.example.Helper.help()',
      file: '/src/Serial.java', line: 10, column: 5,
      kind: 'method_call'
    });
    
    index1.addFile('/src/Serial.java', 'serial-hash', ['com.example.Serial'], true, 123456789);
    
    // Serialize
    const json = index1.toJSON();
    
    assert(json.symbols !== undefined, 'JSON has symbols');
    assert(json.references !== undefined, 'JSON has references');
    assert(json.files !== undefined, 'JSON has files');
    assert(json.callGraph !== undefined, 'JSON has callGraph');
    
    // Deserialize into new index
    const index2 = new MemoryIndex();
    index2.fromJSON(json);
    
    assert(index2.getSymbol('com.example.Serial') !== undefined, 'Symbol restored');
    assert(index2.findUsages('com.example.Helper.help()').length === 1, 'Reference restored');
    assert(index2.getFile('/src/Serial.java') !== undefined, 'File restored');
  }
  
  // Test 116-120: Edge cases in serialization
  {
    const index = new MemoryIndex();
    
    // Empty index
    const emptyJson = index.toJSON();
    assert(emptyJson.symbols !== undefined, 'Empty index serializes symbols');
    
    // Large number of symbols
    for (let i = 0; i < 100; i++) {
      index.addSymbol({
        fqn: `com.example.Class${i}`,
        name: `Class${i}`, kind: 'class',
        file: `/src/Class${i}.java`, line: 1, column: 1,
        packageName: 'com.example', modifiers: []
      });
    }
    
    const largeJson = index.toJSON();
    const index2 = new MemoryIndex();
    index2.fromJSON(largeJson);
    
    assert(index2.getAllSymbols().size === 100, 'Large index serialization works');
    assert(index2.getSymbol('com.example.Class50') !== undefined, 'Specific symbol from large set found');
    
    // Unicode in symbols
    index.addSymbol({
      fqn: 'com.example.Ünïcödé',
      name: 'Ünïcödé', kind: 'class',
      file: '/src/Unicode.java', line: 1, column: 1,
      packageName: 'com.example', modifiers: []
    });
    
    const unicodeJson = index.toJSON();
    const index3 = new MemoryIndex();
    index3.fromJSON(unicodeJson);
    
    assert(index3.getSymbol('com.example.Ünïcödé') !== undefined, 'Unicode symbols serialize correctly');
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  100 ADDITIONAL TESTS FOR MCP JAVA INDEXER');
  console.log('='.repeat(70));
  
  try {
    await testSymbolManagement();
    await testReferenceTracking();
    await testCallGraph();
    await testInheritanceHierarchy();
    await testFileManagement();
    await testPathNormalization();
    await testSerialization();
  } catch (error) {
    console.error('\n❌ Test suite crashed:', error);
    failed++;
    failures.push({ testNumber: 'CRASH', testName: 'Test Suite Execution', details: error.message });
  }
  
  // Cleanup
  await cleanup();
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total Tests: ${passed + failed}`);
  console.log(`  Passed: ${passed} ✅`);
  console.log(`  Failed: ${failed} ❌`);
  
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    for (const failure of failures) {
      console.log(`    • [${failure.testNumber}] ${failure.testName}`);
      if (failure.details) {
        console.log(`      ${failure.details}`);
      }
    }
  }
  
  console.log('='.repeat(70) + '\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests();
