import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

// Normalize file paths to use forward slashes for consistent comparison
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export interface SymbolStub {
  fqn: string; // Fully Qualified Name
  name: string;
  kind: 'class' | 'interface' | 'enum' | 'record' | 'method' | 'field' | 'constructor';
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
  mtime?: number; // File modification time for fast staleness check
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
  private projectRootDir: string = ''; // The project root that was indexed

  constructor() {}

  // Initialize index directory
  setIndexDir(dir: string): void {
    const normalizedDir = normalizePath(dir);
    this.indexDir = normalizePath(path.join(dir, '.mcp-index'));
    this.projectRootDir = normalizedDir;
  }

  getIndexDir(): string {
    return this.indexDir;
  }

  getProjectRootDir(): string {
    return this.projectRootDir;
  }

  // Check if the current index matches the expected project root
  isForProject(rootDir: string): boolean {
    if (!this.projectRootDir) return false;
    return normalizePath(rootDir) === this.projectRootDir;
  }

  // Add symbol
  addSymbol(stub: SymbolStub): void {
    // Normalize file path in symbol
    const normalizedStub = { ...stub, file: normalizePath(stub.file) };
    this.symbols.set(normalizedStub.fqn, normalizedStub);

    // Track inheritance ONLY for class/interface/enum (not methods/fields/constructors)
    // This prevents massive overhead with large projects
    if (normalizedStub.kind === 'class' || normalizedStub.kind === 'interface' || normalizedStub.kind === 'enum') {
      // Check both old and new property names for backward compatibility
      const extendsClass = normalizedStub.extends || normalizedStub.extendsClass;
      if (extendsClass) {
        this.addInheritance(normalizedStub.fqn, extendsClass);
      }
      const implementsInterfaces = normalizedStub.implements || normalizedStub.implementsInterfaces;
      if (implementsInterfaces) {
        for (const iface of implementsInterfaces) {
          this.addInheritance(normalizedStub.fqn, iface);
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

  // Add reference
  addReference(ref: Reference): void {
    // Normalize file path
    const normalizedRef = { ...ref, file: normalizePath(ref.file) };
    this.references.push(normalizedRef);
    
    // Track by file for efficient cleanup
    if (!this.referencesByFile.has(normalizedRef.file)) {
      this.referencesByFile.set(normalizedRef.file, []);
    }
    this.referencesByFile.get(normalizedRef.file)!.push(normalizedRef);

    // Build call graph for method calls
    if (ref.kind === 'method_call') {
      this.addCallGraphEdge(ref.fromFqn, ref.toFqn, normalizedRef.file, ref.line, ref.column);
    }
  }

  // Find all usages of a symbol - uses fuzzy matching for better results
  // IMPORTANT: References are stored with variable names (e.g., "session.close") not class FQNs
  // So we need flexible matching: user queries "Session.close()" but ref has "session.close"
  findUsages(fqn: string): Reference[] {
    // First try exact match
    const exactMatches = this.references.filter(ref => ref.toFqn === fqn);
    if (exactMatches.length > 0) {
      return exactMatches;
    }
    
    // Extract method/field name for fuzzy matching
    // FQN format: com.example.ClassName.methodName(params) or com.example.ClassName.fieldName
    const lastDot = fqn.lastIndexOf('.');
    const parenIndex = fqn.indexOf('(');
    
    let simpleName: string;
    let className: string | null = null;
    
    if (parenIndex > 0) {
      // Method: extract name and params
      const methodWithParams = fqn.substring(lastDot + 1);
      simpleName = methodWithParams; // e.g., getSessionFactory()
      
      // Also extract just the method name for partial matching
      const methodName = fqn.substring(lastDot + 1, parenIndex);
      const methodNameLower = methodName.toLowerCase();
      
      // Try to match: className.methodName pattern in toFqn
      if (lastDot > 0) {
        const beforeMethod = fqn.substring(0, lastDot);
        const classNameIndex = beforeMethod.lastIndexOf('.');
        className = classNameIndex > 0 ? beforeMethod.substring(classNameIndex + 1) : beforeMethod;
      }
      const classNameLower = className?.toLowerCase() || null;
      
      // Fuzzy match: find references where toFqn ends with .methodName( or matches className.methodName
      // Key insight: references use variable names (lowercase) but queries use class names (PascalCase)
      return this.references.filter(ref => {
        const toFqn = ref.toFqn;
        const toFqnLower = toFqn.toLowerCase();
        
        // 1. Exact method name match at end (most common case)
        // Matches: "session.close", "utils.getSessionFactory", etc.
        if (toFqn.endsWith('.' + methodName) || toFqn.endsWith('.' + methodName + '()')) {
          return true;
        }
        
        // 2. Case-insensitive className.methodName match
        // Matches: "session.close" when querying "Session.close"
        // This is the KEY fix for the inconsistency issue
        if (classNameLower && toFqnLower.includes(classNameLower + '.' + methodNameLower)) {
          return true;
        }
        
        // 3. Just the method name (unqualified calls within same class)
        if (toFqn === methodName || toFqn.endsWith('.' + methodName)) {
          return true;
        }
        
        // 4. Variable name might be similar to class name (e.g., "hibernateUtils" vs "HibernateUtils")
        // Check if any word boundary match exists
        if (classNameLower) {
          const dotIndex = toFqnLower.lastIndexOf('.');
          if (dotIndex > 0) {
            const scopePart = toFqnLower.substring(0, dotIndex);
            const methodPart = toFqnLower.substring(dotIndex + 1);
            // Match if: method matches AND scope contains the class name (case-insensitive)
            if (methodPart === methodNameLower && scopePart.includes(classNameLower)) {
              return true;
            }
            // Or if scope ends with a similar suffix (e.g., "utils" vs "HibernateUtils")
            if (methodPart === methodNameLower && 
                (scopePart.endsWith(classNameLower) || classNameLower.endsWith(scopePart))) {
              return true;
            }
          }
        }
        
        return false;
      });
    } else if (lastDot > 0) {
      // Field or class reference
      simpleName = fqn.substring(lastDot + 1);
      const simpleNameLower = simpleName.toLowerCase();
      const beforeField = fqn.substring(0, lastDot);
      const classNameIndex = beforeField.lastIndexOf('.');
      className = classNameIndex > 0 ? beforeField.substring(classNameIndex + 1) : beforeField;
      const classNameLower = className?.toLowerCase() || null;
      
      // Fuzzy match for fields and classes
      return this.references.filter(ref => {
        const toFqn = ref.toFqn;
        const toFqnLower = toFqn.toLowerCase();
        
        // Match patterns like: varName.fieldName, ClassName.fieldName
        if (toFqn.endsWith('.' + simpleName)) {
          return true;
        }
        // Case-insensitive match for className.fieldName
        if (classNameLower && toFqnLower.includes(classNameLower + '.' + simpleNameLower)) {
          return true;
        }
        // Match by simple name for class references (instantiation, inheritance)
        if (toFqn === simpleName || toFqn.endsWith('.' + simpleName)) {
          return true;
        }
        // Case-insensitive match for simple names
        if (toFqnLower === simpleNameLower || toFqnLower.endsWith('.' + simpleNameLower)) {
          return true;
        }
        return false;
      });
    }
    
    // Fallback: match by simple name anywhere in toFqn (case-insensitive)
    const fqnLower = fqn.toLowerCase();
    return this.references.filter(ref => {
      const toFqnLower = ref.toFqn.toLowerCase();
      return toFqnLower.includes(fqnLower) || toFqnLower.endsWith('.' + fqnLower);
    });
  }

  // Find all references FROM a class (what this class uses)
  // This catches same-package dependencies that don't need explicit imports
  findReferencesFromClass(classFqn: string): Reference[] {
    // Find references where fromFqn starts with the class FQN
    // This includes references from all methods, constructors, and fields of the class
    return this.references.filter(ref => {
      // Match if fromFqn is exactly the class, or starts with class. (methods/fields)
      return ref.fromFqn === classFqn || 
             ref.fromFqn.startsWith(classFqn + '.') ||
             ref.fromFqn.startsWith(classFqn + '('); // constructors
    });
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
    // Try exact match first
    const exact = this.callGraph.get(fqn);
    if (exact && exact.length > 0) {
      return exact;
    }
    
    // Fuzzy match: find calls from methods with matching name
    const results: CallGraphEdge[] = [];
    const lastDot = fqn.lastIndexOf('.');
    const parenIndex = fqn.indexOf('(');
    
    if (lastDot > 0) {
      // Extract method name for matching
      const methodName = parenIndex > 0 ? fqn.substring(lastDot + 1, parenIndex) : fqn.substring(lastDot + 1);
      
      for (const [caller, edges] of this.callGraph.entries()) {
        // Match callers that end with the method signature or method name
        if (caller.endsWith('.' + methodName + '(') || caller.includes('.' + methodName + '(')) {
          const callerParen = caller.indexOf('(');
          if (callerParen > 0) {
            const callerMethod = caller.substring(caller.lastIndexOf('.', callerParen) + 1, callerParen);
            if (callerMethod === methodName) {
              results.push(...edges);
            }
          }
        }
      }
    }
    
    return results;
  }

  // Get inbound calls (who calls this method) - uses fuzzy matching
  getInboundCalls(fqn: string): CallGraphEdge[] {
    // Try exact match first
    const exact = this.reverseCallGraph.get(fqn);
    if (exact && exact.length > 0) {
      return exact;
    }
    
    // Fuzzy match: find calls to methods with matching name
    const results: CallGraphEdge[] = [];
    const lastDot = fqn.lastIndexOf('.');
    const parenIndex = fqn.indexOf('(');
    
    let methodName: string;
    let className: string | null = null;
    
    if (parenIndex > 0) {
      methodName = fqn.substring(lastDot + 1, parenIndex);
    } else if (lastDot > 0) {
      methodName = fqn.substring(lastDot + 1);
    } else {
      methodName = fqn;
    }
    
    // Extract class name for better matching
    if (lastDot > 0) {
      const beforeMethod = fqn.substring(0, lastDot);
      const classNameIndex = beforeMethod.lastIndexOf('.');
      className = classNameIndex > 0 ? beforeMethod.substring(classNameIndex + 1) : beforeMethod;
    }
    
    // Search through all reverse call graph entries for fuzzy matches
    for (const [callee, edges] of this.reverseCallGraph.entries()) {
      // Match patterns: varName.methodName, ClassName.methodName, etc.
      const calleeLastDot = callee.lastIndexOf('.');
      const calleeMethod = calleeLastDot > 0 ? callee.substring(calleeLastDot + 1) : callee;
      
      if (calleeMethod === methodName) {
        // If class name is known, prefer matches that include it
        if (className && callee.includes(className)) {
          results.push(...edges);
        } else if (!className) {
          results.push(...edges);
        } else {
          // Still include even without className match (different variable names)
          results.push(...edges);
        }
      }
    }
    
    // Deduplicate results
    const seen = new Set<string>();
    return results.filter(edge => {
      const key = `${edge.caller}:${edge.callee}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
  addFile(filePath: string, hash: string, symbols: string[], isIndexedFile: boolean = true, mtime?: number): void {
    const normalizedPath = normalizePath(filePath);
    this.files.set(normalizedPath, {
      path: normalizedPath,
      hash,
      lastIndexed: Date.now(),
      mtime: mtime || Date.now(),
      symbols
    });
    if (isIndexedFile) {
      this.indexedFiles.add(normalizedPath);
    }
  }

  getFile(filePath: string): FileInfo | undefined {
    return this.files.get(normalizePath(filePath));
  }

  // Update file mtime without reindexing (for syncing mtime after git operations)
  updateFileMtime(filePath: string, mtime: number): boolean {
    const normalizedPath = normalizePath(filePath);
    const fileInfo = this.files.get(normalizedPath);
    if (fileInfo && mtime > (fileInfo.mtime || 0)) {
      fileInfo.mtime = mtime;
      return true;
    }
    return false;
  }

  getAllFiles(): FileInfo[] {
    return Array.from(this.files.values());
  }

  // Remove file and its symbols
  removeFile(filePath: string): void {
    const normalizedPath = normalizePath(filePath);
    const fileInfo = this.files.get(normalizedPath);
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
    const fileRefs = this.referencesByFile.get(normalizedPath);
    if (fileRefs) {
      // Remove from main references array
      this.references = this.references.filter(ref => normalizePath(ref.file) !== normalizedPath);
      this.referencesByFile.delete(normalizedPath);
    }
    
    // Clean up call graph edges for this file
    this.cleanupCallGraphForFile(normalizedPath);

    this.files.delete(normalizedPath);
    this.indexedFiles.delete(normalizedPath);
  }
  
  // Clean up call graph edges for a file
  private cleanupCallGraphForFile(filePath: string): void {
    const normalizedPath = normalizePath(filePath);
    // Remove edges with locations in this file
    for (const [caller, edges] of this.callGraph.entries()) {
      const filteredEdges = edges.map(edge => ({
        ...edge,
        locations: edge.locations.filter(loc => normalizePath(loc.file) !== normalizedPath)
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
        locations: edge.locations.filter(loc => normalizePath(loc.file) !== normalizedPath)
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
    const normalizedPath = normalizePath(filePath);
    const fileInfo = this.files.get(normalizedPath);
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
      files: this.indexedFiles.size,
      indexedFiles: this.indexedFiles.size,
      allFiles: this.files.size,
      references: this.references.length,
      callGraphEdges: Array.from(this.callGraph.values()).reduce((sum, edges) => sum + edges.length, 0),
      inheritanceRelations: this.inheritance.size
    };
  }

  // Get summary of symbols by kind (for resources API)
  getSymbolSummary(): { byKind: Record<string, number>; packages: string[]; topClasses: string[] } {
    const byKind = new Map<string, number>();
    const packages = new Set<string>();
    const topClasses: string[] = [];
    
    for (const [fqn, stub] of this.symbols) {
      // Use Map to avoid reserved property names like 'constructor'
      byKind.set(stub.kind, (byKind.get(stub.kind) || 0) + 1);
      if (stub.packageName) {
        packages.add(stub.packageName);
      }
      // Track top-level classes (not inner classes)
      if (stub.kind === 'class' && !stub.declaringClass && topClasses.length < 50) {
        topClasses.push(fqn);
      }
    }
    
    // Convert Map to plain object for JSON serialization
    const byKindObj: Record<string, number> = {};
    for (const [kind, count] of byKind) {
      byKindObj[kind] = count;
    }
    
    return {
      byKind: byKindObj,
      packages: Array.from(packages).slice(0, 50),
      topClasses
    };
  }

  // Get list of indexed files (for resources API)
  getIndexedFiles(): string[] {
    return Array.from(this.indexedFiles);
  }

  // Clear all data
  clear(): void {
    this.symbols.clear();
    this.files.clear();
    this.indexedFiles.clear();
    this.projectRootDir = '';
    this.references = [];
    this.referencesByFile.clear();
    this.callGraph.clear();
    this.reverseCallGraph.clear();
    this.inheritance.clear();
    this.reverseInheritance.clear();
  }
  
  // Periodic cleanup to prevent memory bloat
  performMaintenanceCleanup(): void {
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
    
    const afterCount = this.references.length;
    if (beforeCount !== afterCount) {
      console.error(`Maintenance cleanup: removed ${beforeCount - afterCount} orphaned references`);
    }
    
    // Trigger garbage collection if available
    if (global.gc) {
      global.gc();
      console.error('Triggered garbage collection');
    }
  }

  // Serialization for persistence
  toJSON() {
    return {
      projectRootDir: this.projectRootDir,
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
    
    // Restore project root if available
    if (data.projectRootDir) {
      this.projectRootDir = normalizePath(data.projectRootDir);
    }
    
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
