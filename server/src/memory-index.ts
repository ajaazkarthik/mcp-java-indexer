import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SymbolStub {
  fqn: string; // Fully Qualified Name
  name: string;
  kind: 'class' | 'interface' | 'enum' | 'method' | 'field' | 'constructor';
  file: string;
  line: number;
  column: number;
  packageName: string;
  modifiers: string[];
  signature?: string; // For methods: return type + params
  extends?: string; // Backward compatibility
  extendsClass?: string; // Java indexer uses this
  implements?: string[]; // Backward compatibility
  implementsInterfaces?: string[]; // Java indexer uses this
  declaringClass?: string; // For methods/fields
}

export interface Reference {
  fromFqn: string;
  toFqn: string;
  file: string;
  line: number;
  column: number;
  kind: 'method_call' | 'field_access' | 'instantiation' | 'inheritance' | 'type_reference';
}

export interface FileInfo {
  path: string;
  hash: string;
  lastIndexed: number;
  symbols: string[]; // FQNs defined in this file
}

export interface CallGraphEdge {
  caller: string;
  callee: string;
  locations: Array<{ file: string; line: number; column: number }>;
}

export class MemoryIndex {
  // Core indices (in-memory)
  private symbols: Map<string, SymbolStub> = new Map(); // FQN -> SymbolStub
  private files: Map<string, FileInfo> = new Map(); // file path -> FileInfo
  private indexedFiles: Set<string> = new Set(); // Only files we explicitly indexed (not dependencies)
  private references: Reference[] = []; // All references
  private referencesByFile: Map<string, Reference[]> = new Map(); // file -> references (for efficient cleanup)
  private callGraph: Map<string, CallGraphEdge[]> = new Map(); // caller FQN -> edges
  private reverseCallGraph: Map<string, CallGraphEdge[]> = new Map(); // callee FQN -> edges
  private inheritance: Map<string, string[]> = new Map(); // child -> parents
  private reverseInheritance: Map<string, string[]> = new Map(); // parent -> children

  private indexDir: string = '';

  constructor() {}

  // Initialize index directory
  setIndexDir(dir: string): void {
    this.indexDir = path.join(dir, '.mcp-index');
  }

  getIndexDir(): string {
    return this.indexDir;
  }

  // Add symbol
  addSymbol(stub: SymbolStub): void {
    this.symbols.set(stub.fqn, stub);

    // Track inheritance ONLY for class/interface/enum (not methods/fields/constructors)
    // This prevents massive overhead with large projects
    if (stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum') {
      // Check both old and new property names for backward compatibility
      const extendsClass = stub.extends || stub.extendsClass;
      if (extendsClass) {
        this.addInheritance(stub.fqn, extendsClass);
      }
      const implementsInterfaces = stub.implements || stub.implementsInterfaces;
      if (implementsInterfaces) {
        for (const iface of implementsInterfaces) {
          this.addInheritance(stub.fqn, iface);
        }
      }
    }
  }

  // Get symbol by FQN
  getSymbol(fqn: string): SymbolStub | undefined {
    return this.symbols.get(fqn);
  }

  // Get all symbols (for semantic search and code explanation)
  getAllSymbols(): Map<string, SymbolStub> {
    return this.symbols;
  }

  // Find symbols by name (partial match)
  findSymbols(nameOrFqn: string): SymbolStub[] {
    const results: SymbolStub[] = [];
    
    // Exact FQN match
    const exact = this.symbols.get(nameOrFqn);
    if (exact) {
      results.push(exact);
      return results;
    }

    // Check if it's a qualified field access (e.g., "ClassName.fieldName")
    if (nameOrFqn.includes('.')) {
      const parts = nameOrFqn.split('.');
      const fieldName = parts[parts.length - 1];
      const className = parts.slice(0, -1).join('.');
      
      // Try to find the field in the class or its parents
      const fieldInHierarchy = this.findFieldInHierarchy(className, fieldName);
      if (fieldInHierarchy) {
        results.push(fieldInHierarchy);
        return results;
      }
    }

    // Partial name match
    const lowerQuery = nameOrFqn.toLowerCase();
    for (const [fqn, stub] of this.symbols) {
      if (stub.name.toLowerCase().includes(lowerQuery) || 
          fqn.toLowerCase().includes(lowerQuery)) {
        results.push(stub);
      }
    }

    return results;
  }

  // Find a field in a class or its parent hierarchy
  private findFieldInHierarchy(className: string, fieldName: string): SymbolStub | undefined {
    // First, resolve className to FQN if it's a simple name
    const classSymbolResolved = this.findClassByName(className);
    if (!classSymbolResolved) {
      return undefined; // Class not found
    }
    
    // Use BFS to traverse both class hierarchy (extends) and interface hierarchy (implements)
    const queue: string[] = [classSymbolResolved.fqn];
    const visited = new Set<string>();
    
    while (queue.length > 0) {
      const currentClass = queue.shift()!;
      if (visited.has(currentClass)) continue;
      visited.add(currentClass);
      
      // Look for the field in the current class/interface
      const fieldFqn = currentClass + '.' + fieldName;
      const field = this.symbols.get(fieldFqn);
      if (field && field.kind === 'field') {
        return field;
      }
      
      // Get the class/interface symbol to traverse its hierarchy
      // Use findClassByName to handle nested class name mismatches
      const classSymbol = this.findClassByName(currentClass);
      if (classSymbol) {
        // Check both old and new property names for backward compatibility
        const parentClass = classSymbol.extends || classSymbol.extendsClass;
        if (parentClass) {
          queue.push(parentClass);
        }
        
        // Also check implemented interfaces
        const implementsInterfaces = classSymbol.implements || classSymbol.implementsInterfaces;
        if (implementsInterfaces) {
          for (const iface of implementsInterfaces) {
            queue.push(iface);
          }
        }
      }
    }
    
    // Also try searching by partial package-qualified names
    for (const [fqn, stub] of this.symbols) {
      if (stub.kind === 'field' && 
          stub.name === fieldName && 
          (fqn.endsWith('.' + className + '.' + fieldName) || 
           fqn === className + '.' + fieldName)) {
        // Found in a matching class, now check if it's in the hierarchy
        if (stub.declaringClass) {
          const declaring = this.findClassByName(stub.declaringClass);
          if (declaring && this.isInHierarchy(className, declaring.fqn)) {
            return stub;
          }
        }
      }
    }
    
    return undefined;
  }

  // Find a class by simple or qualified name
  private findClassByName(name: string): SymbolStub | undefined {
    // Try exact match first
    const exact = this.symbols.get(name);
    if (exact && (exact.kind === 'class' || exact.kind === 'interface' || exact.kind === 'enum')) {
      return exact;
    }
    
    // For nested classes, JavaParser might index them without the outer class prefix
    // Try removing the inner class part (e.g., com.example.OuterClass.Inner -> com.example.Inner)
    if (name.includes('.')) {
      const parts = name.split('.');
      if (parts.length >= 3) {
        // Try without the second-to-last part (potential outer class)
        const withoutOuter = [...parts.slice(0, -2), parts[parts.length - 1]].join('.');
        const fallback = this.symbols.get(withoutOuter);
        if (fallback && (fallback.kind === 'class' || fallback.kind === 'interface' || fallback.kind === 'enum')) {
          return fallback;
        }
      }
    }
    
    // Try to find by simple name
    for (const [fqn, stub] of this.symbols) {
      if ((stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum') && 
          (stub.name === name || fqn.endsWith('.' + name))) {
        return stub;
      }
    }
    
    return undefined;
  }

  // Check if targetClass is in the hierarchy of baseClass
  private isInHierarchy(baseClass: string, targetClass: string): boolean {
    if (baseClass === targetClass) return true;
    
    const parents = this.getAllParents(baseClass);
    return parents.includes(targetClass);
  }

  // Get all parents recursively
  private getAllParents(className: string): string[] {
    const parents: string[] = [];
    const visited = new Set<string>();
    const queue = [className];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      
      const classSymbol = this.symbols.get(current);
      if (classSymbol) {
        // Check both old and new property names for backward compatibility
        const extendsClass = classSymbol.extends || classSymbol.extendsClass;
        if (extendsClass) {
          parents.push(extendsClass);
          queue.push(extendsClass);
        }
        const implementsInterfaces = classSymbol.implements || classSymbol.implementsInterfaces;
        if (implementsInterfaces) {
          for (const iface of implementsInterfaces) {
            parents.push(iface);
            queue.push(iface);
          }
        }
      }
    }
    
    return parents;
  }

  // Add reference with deduplication to prevent memory bloat
  addReference(ref: Reference): void {
    // CRITICAL: Deduplicate to prevent OOM from duplicate references
    // Check if this exact reference already exists in the file's references
    const fileRefs = this.referencesByFile.get(ref.file);
    if (fileRefs) {
      const isDuplicate = fileRefs.some(existing => 
        existing.fromFqn === ref.fromFqn &&
        existing.toFqn === ref.toFqn &&
        existing.line === ref.line &&
        existing.column === ref.column &&
        existing.kind === ref.kind
      );
      if (isDuplicate) {
        return; // Skip duplicate
      }
    }
    
    this.references.push(ref);
    
    // Track by file for efficient cleanup
    if (!this.referencesByFile.has(ref.file)) {
      this.referencesByFile.set(ref.file, []);
    }
    this.referencesByFile.get(ref.file)!.push(ref);

    // Build call graph for method calls and instantiations (constructor calls)
    if (ref.kind === 'method_call' || ref.kind === 'instantiation') {
      this.addCallGraphEdge(ref.fromFqn, ref.toFqn, ref.file, ref.line, ref.column);
    }
  }

  // Find all usages of a symbol
  findUsages(fqn: string): Reference[] {
    // Get the simple name from the FQN for matching unqualified references
    const simpleName = fqn.split('.').pop() || fqn;
    
    // Match on:
    // 1. Exact FQN match: ref.toFqn === fqn
    // 2. Prefix match for class members: ref.toFqn.startsWith(fqn + '.')
    // 3. Simple name match (for unqualified references): ref.toFqn === simpleName
    // 4. Simple name in qualified context: ref.toFqn.endsWith('.' + simpleName)
    return this.references.filter(ref => 
      ref.toFqn === fqn || 
      ref.toFqn.startsWith(fqn + '.') ||
      ref.toFqn === simpleName ||
      (simpleName !== fqn && ref.toFqn.endsWith('.' + simpleName))
    );
  }

  // Add call graph edge
  private addCallGraphEdge(caller: string, callee: string, file: string, line: number, column: number): void {
    // Forward edge
    if (!this.callGraph.has(caller)) {
      this.callGraph.set(caller, []);
    }
    
    let edge = this.callGraph.get(caller)!.find(e => e.callee === callee);
    if (!edge) {
      edge = { caller, callee, locations: [] };
      this.callGraph.get(caller)!.push(edge);
    }
    edge.locations.push({ file, line, column });

    // Reverse edge
    if (!this.reverseCallGraph.has(callee)) {
      this.reverseCallGraph.set(callee, []);
    }
    
    let revEdge = this.reverseCallGraph.get(callee)!.find(e => e.caller === caller);
    if (!revEdge) {
      revEdge = { caller, callee, locations: [] };
      this.reverseCallGraph.get(callee)!.push(revEdge);
    }
    revEdge.locations.push({ file, line, column });
  }

  // Get outbound calls (what this method calls)
  getOutboundCalls(fqn: string): CallGraphEdge[] {
    return this.callGraph.get(fqn) || [];
  }

  // Get inbound calls (who calls this method)
  getInboundCalls(fqn: string): CallGraphEdge[] {
    const exact = this.reverseCallGraph.get(fqn) || [];
    
    // Also check for partial matches (e.g., "repository.save" -> "com.example.UserRepository.save(User)")
    // This handles cases where Java indexer couldn't resolve full FQN
    
    // Extract components from the full FQN
    const parts = fqn.split('.');
    const methodName = parts[parts.length - 1]; // e.g., "save(User)" or just "save"
    const baseMethodName = methodName.split('(')[0]; // Remove parameters: "save(User)" -> "save"
    const className = parts[parts.length - 2]; // e.g., "UserRepository" or "User" (for constructors)
    
    // Check if this is a constructor (className === baseMethodName)
    const isConstructor = className === baseMethodName;
    
    const fuzzyMatches: CallGraphEdge[] = [];
    const seenCallers = new Set<string>(); // Deduplicate
    
    for (const [callee, edges] of this.reverseCallGraph.entries()) {
      if (callee === fqn) continue; // Skip exact match (already handled)
      
      let isMatch = false;
      const calleeLower = callee.toLowerCase();
      const baseMethodLower = baseMethodName.toLowerCase();
      const classNameLower = className?.toLowerCase() || '';
      
      // Pattern 1: Simple method name match: "save", "log"
      if (callee === baseMethodName || callee === methodName) {
        isMatch = true;
      }
      
      // Pattern 2: field.method format: "repository.save", "logger.log"
      else if (callee.includes('.')) {
        const calleeParts = callee.split('.');
        const calleeMethod = calleeParts[calleeParts.length - 1];
        const calleeMethodBase = calleeMethod.split('(')[0];
        
        // Match if method name matches
        if (calleeMethodBase.toLowerCase() === baseMethodLower) {
          isMatch = true;
        }
      }
      
      // Pattern 3: Partial class name match: "UserRepository.save"
      else if (classNameLower && calleeLower.includes(classNameLower) && calleeLower.includes(baseMethodLower)) {
        isMatch = true;
      }
      
      // Pattern 4: Constructor instantiation: "User" matches "com.example.demo.User.User(...)"
      // Instantiation references store just the simple class name (e.g., "User")
      else if (isConstructor && callee === className) {
        isMatch = true;
      }
      
      if (isMatch) {
        for (const edge of edges) {
          const key = `${edge.caller}->${edge.callee}`;
          if (!seenCallers.has(key)) {
            seenCallers.add(key);
            fuzzyMatches.push(edge);
          }
        }
      }
    }
    
    return [...exact, ...fuzzyMatches];
  }

  // Add inheritance relationship
  private addInheritance(child: string, parent: string): void {
    if (!this.inheritance.has(child)) {
      this.inheritance.set(child, []);
    }
    if (!this.inheritance.get(child)!.includes(parent)) {
      this.inheritance.get(child)!.push(parent);
    }

    if (!this.reverseInheritance.has(parent)) {
      this.reverseInheritance.set(parent, []);
    }
    if (!this.reverseInheritance.get(parent)!.includes(child)) {
      this.reverseInheritance.get(parent)!.push(child);
    }
  }

  // Get all parents (extends/implements)
  getParents(fqn: string): string[] {
    return this.inheritance.get(fqn) || [];
  }

  // Get all children (subclasses/implementations)
  getChildren(fqn: string): string[] {
    return this.reverseInheritance.get(fqn) || [];
  }

  // File management
  addFile(filePath: string, hash: string, symbols: string[], isIndexedFile: boolean = true): void {
    this.files.set(filePath, {
      path: filePath,
      hash,
      lastIndexed: Date.now(),
      symbols
    });
    if (isIndexedFile) {
      this.indexedFiles.add(filePath);
    }
  }

  getFile(filePath: string): FileInfo | undefined {
    return this.files.get(filePath);
  }

  getAllFiles(): FileInfo[] {
    return Array.from(this.files.values());
  }

  // Remove file and its symbols
  removeFile(filePath: string): void {
    const fileInfo = this.files.get(filePath);
    if (!fileInfo) return;

    // Remove symbols
    for (const fqn of fileInfo.symbols) {
      this.symbols.delete(fqn);
      this.callGraph.delete(fqn);
      this.reverseCallGraph.delete(fqn);
      this.inheritance.delete(fqn);
      this.reverseInheritance.delete(fqn);
    }

    // Efficiently remove references using file index
    const fileRefs = this.referencesByFile.get(filePath);
    if (fileRefs) {
      // Remove from main references array
      this.references = this.references.filter(ref => ref.file !== filePath);
      this.referencesByFile.delete(filePath);
    }
    
    // Clean up call graph edges for this file
    this.cleanupCallGraphForFile(filePath);

    this.files.delete(filePath);
    this.indexedFiles.delete(filePath);
  }
  
  // Clean up call graph edges for a file
  private cleanupCallGraphForFile(filePath: string): void {
    // Remove edges with locations in this file
    for (const [caller, edges] of this.callGraph.entries()) {
      const filteredEdges = edges.map(edge => ({
        ...edge,
        locations: edge.locations.filter(loc => loc.file !== filePath)
      })).filter(edge => edge.locations.length > 0);
      
      if (filteredEdges.length === 0) {
        this.callGraph.delete(caller);
      } else if (filteredEdges.length !== edges.length) {
        this.callGraph.set(caller, filteredEdges);
      }
    }
    
    for (const [callee, edges] of this.reverseCallGraph.entries()) {
      const filteredEdges = edges.map(edge => ({
        ...edge,
        locations: edge.locations.filter(loc => loc.file !== filePath)
      })).filter(edge => edge.locations.length > 0);
      
      if (filteredEdges.length === 0) {
        this.reverseCallGraph.delete(callee);
      } else if (filteredEdges.length !== edges.length) {
        this.reverseCallGraph.set(callee, filteredEdges);
      }
    }
  }

  // Calculate file hash
  static async calculateFileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // Check if file needs reindexing
  async needsReindex(filePath: string): Promise<boolean> {
    const fileInfo = this.files.get(filePath);
    if (!fileInfo) return true;

    try {
      const currentHash = await MemoryIndex.calculateFileHash(filePath);
      return currentHash !== fileInfo.hash;
    } catch {
      return true;
    }
  }

  // Get statistics
  getStats() {
    return {
      symbols: this.symbols.size,
      indexedFiles: this.indexedFiles.size,
      allFiles: this.files.size,
      references: this.references.length,
      callGraphEdges: Array.from(this.callGraph.values()).reduce((sum, edges) => sum + edges.length, 0),
      inheritanceRelations: this.inheritance.size
    };
  }

  // Clear all data
  clear(): void {
    this.symbols.clear();
    this.files.clear();
    this.indexedFiles.clear();
    this.references = [];
    this.referencesByFile.clear();
    this.callGraph.clear();
    this.reverseCallGraph.clear();
    this.inheritance.clear();
    this.reverseInheritance.clear();
  }
  
  // Aggressive cleanup to prevent memory bloat and OOM
  performMaintenanceCleanup(): void {
    const beforeMem = process.memoryUsage().heapUsed / 1024 / 1024;
    
    // Remove orphaned references (where fromFqn or toFqn no longer exist)
    const validFqns = new Set(this.symbols.keys());
    const beforeCount = this.references.length;
    
    this.references = this.references.filter(ref => 
      validFqns.has(ref.fromFqn) && validFqns.has(ref.toFqn)
    );
    
    // Rebuild referencesByFile
    this.referencesByFile.clear();
    for (const ref of this.references) {
      if (!this.referencesByFile.has(ref.file)) {
        this.referencesByFile.set(ref.file, []);
      }
      this.referencesByFile.get(ref.file)!.push(ref);
    }
    
    // Clean up empty call graph entries
    for (const [fqn, edges] of this.callGraph.entries()) {
      if (edges.length === 0) {
        this.callGraph.delete(fqn);
      }
    }
    for (const [fqn, edges] of this.reverseCallGraph.entries()) {
      if (edges.length === 0) {
        this.reverseCallGraph.delete(fqn);
      }
    }
    
    // Trim call graph edges with duplicate locations
    for (const [caller, edges] of this.callGraph.entries()) {
      for (const edge of edges) {
        // Deduplicate locations
        const uniqueLocations = new Map<string, typeof edge.locations[0]>();
        for (const loc of edge.locations) {
          const key = `${loc.file}:${loc.line}:${loc.column}`;
          uniqueLocations.set(key, loc);
        }
        edge.locations = Array.from(uniqueLocations.values());
      }
    }
    for (const [callee, edges] of this.reverseCallGraph.entries()) {
      for (const edge of edges) {
        const uniqueLocations = new Map<string, typeof edge.locations[0]>();
        for (const loc of edge.locations) {
          const key = `${loc.file}:${loc.line}:${loc.column}`;
          uniqueLocations.set(key, loc);
        }
        edge.locations = Array.from(uniqueLocations.values());
      }
    }
    
    const afterCount = this.references.length;
    const removed = beforeCount - afterCount;
    
    // Double GC for aggressive cleanup
    if (global.gc) {
      global.gc();
      global.gc();
    }
    
    const afterMem = process.memoryUsage().heapUsed / 1024 / 1024;
    const memFreed = beforeMem - afterMem;
    
    if (removed > 0 || memFreed > 0) {
      console.error(`🧹 Cleanup: removed ${removed} orphaned refs, freed ${memFreed.toFixed(1)}MB`);
    }
  }

  // Serialization for persistence
  toJSON() {
    return {
      symbols: Array.from(this.symbols.entries()),
      files: Array.from(this.files.entries()),
      indexedFiles: Array.from(this.indexedFiles),
      references: this.references,
      referencesByFile: Array.from(this.referencesByFile.entries()),
      callGraph: Array.from(this.callGraph.entries()),
      reverseCallGraph: Array.from(this.reverseCallGraph.entries()),
      inheritance: Array.from(this.inheritance.entries()),
      reverseInheritance: Array.from(this.reverseInheritance.entries())
    };
  }

  fromJSON(data: any): void {
    this.clear();
    
    this.symbols = new Map(data.symbols);
    this.files = new Map(data.files);
    this.indexedFiles = new Set(data.indexedFiles || []);
    this.references = data.references || [];
    this.referencesByFile = new Map(data.referencesByFile || []);
    this.callGraph = new Map(data.callGraph || []);
    this.reverseCallGraph = new Map(data.reverseCallGraph || []);
    this.inheritance = new Map(data.inheritance || []);
    this.reverseInheritance = new Map(data.reverseInheritance || []);
    
    // Rebuild referencesByFile if missing
    if (this.referencesByFile.size === 0 && this.references.length > 0) {
      for (const ref of this.references) {
        if (!this.referencesByFile.has(ref.file)) {
          this.referencesByFile.set(ref.file, []);
        }
        this.referencesByFile.get(ref.file)!.push(ref);
      }
    }
    
    // Rebuild inheritance maps from symbols if they're empty
    if (this.inheritance.size === 0 && this.symbols.size > 0) {
      for (const [fqn, stub] of this.symbols) {
        // Only rebuild for class/interface/enum (not methods/fields/constructors)
        if (stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum') {
          const extendsClass = stub.extends || stub.extendsClass;
          if (extendsClass) {
            this.addInheritance(fqn, extendsClass);
          }
          const implementsInterfaces = stub.implements || stub.implementsInterfaces;
          if (implementsInterfaces) {
            for (const iface of implementsInterfaces) {
              this.addInheritance(fqn, iface);
            }
          }
        }
      }
    }
  }
}
