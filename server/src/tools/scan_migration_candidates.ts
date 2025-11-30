import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex, SymbolStub, Reference } from '../memory-index.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * scan_migration_candidates - Bulk migration analysis tool
 * 
 * Analyzes a package/directory to identify migration-ready classes,
 * categorize by risk, and generate an optimal migration plan with batch ordering.
 * 
 * This is 40-60x faster than calling explore_class individually for each file.
 * 
 * IMPORTANT: This tool now includes DEEP FILE ANALYSIS to detect same-package
 * dependencies that don't require explicit imports in Java.
 */

// ============== File-Based Type Reference Extraction ==============

/**
 * Comprehensive Java file parser that extracts ALL type references.
 * This catches same-package dependencies that the index might miss.
 */
interface ExtractedTypeReference {
  typeName: string;
  kind: 'extends' | 'implements' | 'field_type' | 'parameter_type' | 'return_type' | 
        'local_variable' | 'throws' | 'catch' | 'annotation' | 'instanceof' | 
        'cast' | 'instantiation' | 'generic_type' | 'array_type' | 'method_reference' |
        'class_literal' | 'static_access' | 'import';
  line: number;
}

interface FileAnalysisResult {
  packageName: string;
  className: string;
  imports: Map<string, string>;  // simpleName -> FQN
  wildcardImports: string[];     // package prefixes
  typeReferences: ExtractedTypeReference[];
}

/**
 * Common java.lang types that are auto-imported (should not be flagged as same-package)
 */
const JAVA_LANG_TYPES = new Set([
  'Object', 'String', 'Class', 'System', 'Runtime', 'Thread', 'Throwable',
  'Exception', 'RuntimeException', 'Error', 'StackTraceElement',
  'Boolean', 'Byte', 'Character', 'Short', 'Integer', 'Long', 'Float', 'Double', 'Void',
  'Number', 'Math', 'StrictMath', 'StringBuilder', 'StringBuffer',
  'Comparable', 'CharSequence', 'Iterable', 'AutoCloseable', 'Cloneable',
  'Enum', 'Record', 'Deprecated', 'Override', 'SuppressWarnings', 'FunctionalInterface',
  'SafeVarargs', 'Package', 'Module', 'ClassLoader', 'Process', 'ProcessBuilder',
  'Appendable', 'Readable', 'Runnable', 'Serializable'
]);

/**
 * Java primitive types
 */
const PRIMITIVE_TYPES = new Set([
  'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short', 'void'
]);

/**
 * Common Java collection types (from java.util)
 */
const JAVA_UTIL_TYPES = new Set([
  'List', 'ArrayList', 'LinkedList', 'Map', 'HashMap', 'TreeMap', 'LinkedHashMap',
  'Set', 'HashSet', 'TreeSet', 'LinkedHashSet', 'Collection', 'Collections',
  'Arrays', 'Optional', 'Iterator', 'Comparator', 'Date', 'Calendar', 'UUID',
  'Queue', 'Deque', 'Stack', 'Vector', 'Properties', 'Enumeration', 'BitSet'
]);

/**
 * Parse a Java file and extract all type references
 */
function parseJavaFile(filePath: string): FileAnalysisResult | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseJavaContent(content, filePath);
  } catch (error) {
    return null;
  }
}

/**
 * Parse Java content and extract all type references
 */
function parseJavaContent(content: string, filePath: string): FileAnalysisResult {
  const result: FileAnalysisResult = {
    packageName: '',
    className: path.basename(filePath, '.java'),
    imports: new Map(),
    wildcardImports: [],
    typeReferences: []
  };
  
  // Remove comments to avoid false positives
  const contentWithoutComments = removeComments(content);
  const lines = contentWithoutComments.split('\n');
  
  // Extract package declaration
  const packageMatch = contentWithoutComments.match(/^\s*package\s+([\w.]+)\s*;/m);
  if (packageMatch) {
    result.packageName = packageMatch[1];
  }
  
  // Extract class/interface name
  const classMatch = contentWithoutComments.match(/(?:public\s+)?(?:abstract\s+)?(?:final\s+)?(?:class|interface|enum|record|@interface)\s+(\w+)/);
  if (classMatch) {
    result.className = classMatch[1];
  }
  
  // Extract imports
  const importRegex = /^\s*import\s+(?:static\s+)?([\w.]+)(\.\*)?\s*;/gm;
  let importMatch;
  while ((importMatch = importRegex.exec(contentWithoutComments)) !== null) {
    const importFqn = importMatch[1];
    if (importMatch[2] === '.*') {
      result.wildcardImports.push(importFqn);
    } else {
      const simpleName = importFqn.substring(importFqn.lastIndexOf('.') + 1);
      result.imports.set(simpleName, importFqn);
      // Track as import reference
      result.typeReferences.push({
        typeName: importFqn,
        kind: 'import',
        line: 0
      });
    }
  }
  
  // Process each line for type references
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    extractTypeReferencesFromLine(line, lineNum + 1, result);
  }
  
  return result;
}

/**
 * Remove Java comments (single-line and multi-line)
 */
function removeComments(content: string): string {
  // Remove multi-line comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, match => {
    // Preserve line count for accurate line numbers
    return match.split('\n').map(() => '').join('\n');
  });
  
  // Remove single-line comments
  content = content.replace(/\/\/.*$/gm, '');
  
  // Remove string literals to avoid false type matches
  content = content.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  content = content.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  
  return content;
}

/**
 * Extract all type references from a single line
 */
function extractTypeReferencesFromLine(line: string, lineNum: number, result: FileAnalysisResult): void {
  // Skip empty lines and package/import declarations
  if (!line.trim() || line.match(/^\s*(package|import)\s/)) {
    return;
  }
  
  // 1. extends clause
  const extendsMatch = line.match(/\bextends\s+(\w+(?:\.\w+)*)/);
  if (extendsMatch) {
    addTypeReference(extendsMatch[1], 'extends', lineNum, result);
  }
  
  // 2. implements clause (can have multiple interfaces)
  const implementsMatch = line.match(/\bimplements\s+([\w.,\s<>]+)/);
  if (implementsMatch) {
    const interfaces = implementsMatch[1].split(',').map(s => s.trim());
    for (const iface of interfaces) {
      const cleanType = extractBaseType(iface);
      if (cleanType) {
        addTypeReference(cleanType, 'implements', lineNum, result);
      }
      // Also extract generic type parameters
      extractGenericTypes(iface, 'generic_type', lineNum, result);
    }
  }
  
  // 3. throws clause
  const throwsMatch = line.match(/\bthrows\s+([\w.,\s]+)/);
  if (throwsMatch) {
    const exceptions = throwsMatch[1].split(',').map(s => s.trim());
    for (const exc of exceptions) {
      addTypeReference(extractBaseType(exc), 'throws', lineNum, result);
    }
  }
  
  // 4. Annotations
  const annotationRegex = /@(\w+(?:\.\w+)*)/g;
  let annotationMatch;
  while ((annotationMatch = annotationRegex.exec(line)) !== null) {
    addTypeReference(annotationMatch[1], 'annotation', lineNum, result);
  }
  
  // 5. Field declarations (Type fieldName;)
  const fieldMatch = line.match(/^\s*(?:private|protected|public|static|final|volatile|transient|\s)+\s*(\w+(?:\.\w+)*(?:<[^>]+>)?(?:\[\])?)\s+\w+\s*[;=]/);
  if (fieldMatch && !line.match(/\bclass\b|\binterface\b|\benum\b/)) {
    extractTypesFromDeclaration(fieldMatch[1], 'field_type', lineNum, result);
  }
  
  // 6. Method return types and parameters
  // Match: accessModifiers returnType methodName(params)
  const methodMatch = line.match(/(?:public|private|protected|static|final|abstract|synchronized|native|\s)+\s*(?:<[^>]+>\s+)?(\w+(?:\.\w+)*(?:<[^>]+>)?(?:\[\])?)\s+\w+\s*\(/);
  if (methodMatch && !line.includes(' new ') && !line.match(/\bclass\b|\binterface\b/)) {
    extractTypesFromDeclaration(methodMatch[1], 'return_type', lineNum, result);
  }
  
  // 7. Method parameters
  const paramMatch = line.match(/\(\s*([^)]+)\s*\)/);
  if (paramMatch && !line.match(/^\s*(?:if|while|for|switch|catch)\s*\(/)) {
    const params = paramMatch[1].split(',');
    for (const param of params) {
      const typeMatch = param.trim().match(/^(?:final\s+)?(\w+(?:\.\w+)*(?:<[^>]+>)?(?:\[\])?)\s+\w+/);
      if (typeMatch) {
        extractTypesFromDeclaration(typeMatch[1], 'parameter_type', lineNum, result);
      }
    }
  }
  
  // 8. Local variable declarations
  const localVarMatch = line.match(/^\s*(?:final\s+)?(\w+(?:\.\w+)*(?:<[^>]+>)?(?:\[\])?)\s+\w+\s*[;=]/);
  if (localVarMatch && !line.match(/\breturn\b/) && !line.match(/^\s*(?:private|protected|public)/)) {
    extractTypesFromDeclaration(localVarMatch[1], 'local_variable', lineNum, result);
  }
  
  // 9. Object instantiation (new Type())
  const newMatch = line.match(/\bnew\s+(\w+(?:\.\w+)*)\s*[<(]/);
  if (newMatch) {
    addTypeReference(newMatch[1], 'instantiation', lineNum, result);
  }
  
  // 10. Cast expressions ((Type) expr)
  const castMatch = line.match(/\(\s*(\w+(?:\.\w+)*)\s*\)\s*(?:\w|\()/);
  if (castMatch && !PRIMITIVE_TYPES.has(castMatch[1])) {
    addTypeReference(castMatch[1], 'cast', lineNum, result);
  }
  
  // 11. instanceof expressions
  const instanceofMatch = line.match(/\binstanceof\s+(\w+(?:\.\w+)*)/);
  if (instanceofMatch) {
    addTypeReference(instanceofMatch[1], 'instanceof', lineNum, result);
  }
  
  // 12. catch blocks
  const catchMatch = line.match(/\bcatch\s*\(\s*(?:final\s+)?(\w+(?:\.\w+)*(?:\s*\|\s*\w+(?:\.\w+)*)*)\s+\w+\s*\)/);
  if (catchMatch) {
    const exceptions = catchMatch[1].split('|').map(s => s.trim());
    for (const exc of exceptions) {
      addTypeReference(exc, 'catch', lineNum, result);
    }
  }
  
  // 13. Class literals (Type.class)
  const classLiteralMatch = line.match(/(\w+(?:\.\w+)*)\.class\b/g);
  if (classLiteralMatch) {
    for (const match of classLiteralMatch) {
      const typeName = match.replace('.class', '');
      addTypeReference(typeName, 'class_literal', lineNum, result);
    }
  }
  
  // 14. Method references (Type::method)
  const methodRefMatch = line.match(/(\w+(?:\.\w+)*)::\w+/g);
  if (methodRefMatch) {
    for (const match of methodRefMatch) {
      const typeName = match.split('::')[0];
      addTypeReference(typeName, 'method_reference', lineNum, result);
    }
  }
  
  // 15. Static field/method access (Type.CONSTANT or Type.staticMethod())
  // Matches: ClassName.field or ClassName.method()
  // For simple names (no dots), the first UpperCamelCase word is the type
  const staticAccessMatch = line.match(/\b([A-Z][a-zA-Z0-9_]*)\.[a-zA-Z_]\w*(?:\(|[\s;,)\]=]|$)/g);
  if (staticAccessMatch) {
    for (const match of staticAccessMatch) {
      // Extract just the type name (first word before the dot)
      const typeMatch = match.match(/^([A-Z][a-zA-Z0-9_]*)\./);
      const typeName = typeMatch?.[1];
      if (typeName && !JAVA_LANG_TYPES.has(typeName) && !result.imports.has(typeName)) {
        addTypeReference(typeName, 'static_access', lineNum, result);
      }
    }
  }
  
  // 16. Generic type bounds in method declarations (<T extends Entity>)
  const typeBoundMatch = line.match(/<\s*\w+\s+extends\s+(\w+(?:\.\w+)*)/);
  if (typeBoundMatch) {
    addTypeReference(typeBoundMatch[1], 'generic_type', lineNum, result);
  }
  
  // 17. Fully-qualified type names in code body (e.g., com.example.business.Helper)
  // CRITICAL: Detects blocked dependencies that use FQN instead of imports
  // Pattern: lowercase.package.segments.ClassName (at least 2 package segments)
  const fqnPattern = /\b((?:[a-z_][a-z0-9_]*\.)+)([A-Z][A-Za-z0-9_]*)\b(?!\s*::)/g;
  let fqnMatch;
  while ((fqnMatch = fqnPattern.exec(line)) !== null) {
    const packagePrefix = fqnMatch[1].slice(0, -1); // Remove trailing dot
    const className = fqnMatch[2];
    const fullFqn = packagePrefix + '.' + className;
    
    // Skip java.lang types and already imported types
    if (!JAVA_LANG_TYPES.has(className) && !result.imports.has(className)) {
      addTypeReference(fullFqn, 'static_access', lineNum, result);
    }
  }
  
  // 18. FQN followed by method/field access (com.example.Helper.method() or .CONSTANT)
  const fqnAccessPattern = /\b((?:[a-z_][a-z0-9_]*\.)+[A-Z][A-Za-z0-9_]*)\.[a-zA-Z_]\w*(?:\(|\s*[;,)\]=])/g;
  let fqnAccessMatch;
  while ((fqnAccessMatch = fqnAccessPattern.exec(line)) !== null) {
    const fullFqn = fqnAccessMatch[1];
    const lastDot = fullFqn.lastIndexOf('.');
    const className = fullFqn.substring(lastDot + 1);
    
    if (!JAVA_LANG_TYPES.has(className) && !result.imports.has(className)) {
      addTypeReference(fullFqn, 'static_access', lineNum, result);
    }
  }
}

/**
 * Extract base type from a potentially generic type
 */
function extractBaseType(typeStr: string): string {
  const match = typeStr.match(/^(\w+(?:\.\w+)*)/);
  return match ? match[1] : '';
}

/**
 * Extract generic type parameters from a type declaration
 */
function extractGenericTypes(typeStr: string, kind: ExtractedTypeReference['kind'], lineNum: number, result: FileAnalysisResult): void {
  const genericMatch = typeStr.match(/<([^>]+)>/);
  if (genericMatch) {
    const typeParams = genericMatch[1].split(',').map(s => s.trim());
    for (const param of typeParams) {
      const cleanType = extractBaseType(param.replace(/^\?.*extends\s+/, '').replace(/^\?.*super\s+/, ''));
      if (cleanType && cleanType !== '?') {
        addTypeReference(cleanType, kind, lineNum, result);
      }
    }
  }
}

/**
 * Extract all types from a type declaration (handles generics, arrays)
 */
function extractTypesFromDeclaration(typeStr: string, kind: ExtractedTypeReference['kind'], lineNum: number, result: FileAnalysisResult): void {
  // Extract base type
  const baseType = extractBaseType(typeStr);
  if (baseType) {
    addTypeReference(baseType, kind, lineNum, result);
  }
  
  // Extract generic type parameters
  extractGenericTypes(typeStr, 'generic_type', lineNum, result);
}

/**
 * Add a type reference if it's not a primitive or java.lang type
 */
function addTypeReference(typeName: string, kind: ExtractedTypeReference['kind'], lineNum: number, result: FileAnalysisResult): void {
  if (!typeName) return;
  
  // Skip primitives
  if (PRIMITIVE_TYPES.has(typeName)) return;
  
  // Skip java.lang types
  if (JAVA_LANG_TYPES.has(typeName)) return;
  
  // Skip common java.util types (they require imports)
  if (JAVA_UTIL_TYPES.has(typeName) && !result.imports.has(typeName)) {
    // Only skip if it looks like it's actually java.util (would need import)
    return;
  }
  
  // Skip single-letter type parameters (T, E, K, V, etc.)
  if (typeName.length === 1 && typeName.match(/[A-Z]/)) return;
  
  result.typeReferences.push({ typeName, kind, line: lineNum });
}

/**
 * Type resolution result with confidence indicator
 */
interface TypeResolutionResult {
  fqn: string;
  confidence: 'definite' | 'wildcard' | 'indexed' | 'assumed_same_package';
  source: string;  // What resolved it (import, wildcard, index, assumption)
}

/**
 * Context for enhanced type resolution
 */
interface TypeResolutionContext {
  packageName: string;
  imports: Map<string, string>;
  wildcardImports: string[];
  indexedTypes: Map<string, string[]>;  // simpleName -> [FQN1, FQN2, ...]
  blockedPatterns: string[];
}

/**
 * Enhanced type resolution that uses wildcard imports and index lookup
 * Returns resolution with confidence level to identify risky assumptions
 */
function resolveTypeFqnEnhanced(
  typeName: string, 
  context: TypeResolutionContext
): TypeResolutionResult {
  const { packageName, imports, wildcardImports, indexedTypes, blockedPatterns } = context;
  
  // Already FQN - highest confidence
  if (typeName.includes('.')) {
    return { fqn: typeName, confidence: 'definite', source: 'fqn_in_code' };
  }
  
  // Check explicit imports - definite resolution
  if (imports.has(typeName)) {
    return { fqn: imports.get(typeName)!, confidence: 'definite', source: 'explicit_import' };
  }
  
  // Check java.lang (auto-imported) - definite
  if (JAVA_LANG_TYPES.has(typeName)) {
    return { fqn: 'java.lang.' + typeName, confidence: 'definite', source: 'java.lang' };
  }
  
  // Check java.util types - these need explicit import in real code
  if (JAVA_UTIL_TYPES.has(typeName)) {
    return { fqn: 'java.util.' + typeName, confidence: 'assumed_same_package', source: 'java.util_without_import' };
  }
  
  // Check wildcard imports - try to match against blocked patterns or index
  for (const wildcardPackage of wildcardImports) {
    const potentialFqn = wildcardPackage + '.' + typeName;
    
    // Check if this matches any blocked pattern - this is a risk!
    for (const pattern of blockedPatterns) {
      if (potentialFqn.startsWith(pattern + '.') || potentialFqn === pattern) {
        return { fqn: potentialFqn, confidence: 'wildcard', source: `wildcard_import:${wildcardPackage}.*` };
      }
    }
    
    // Check if this type exists in the index under this package
    const candidates = indexedTypes.get(typeName) || [];
    const matchingCandidate = candidates.find(c => c.startsWith(wildcardPackage + '.'));
    if (matchingCandidate) {
      return { fqn: matchingCandidate, confidence: 'indexed', source: `wildcard_import:${wildcardPackage}.*` };
    }
  }
  
  // Check if type exists anywhere in the index (could help disambiguate)
  const indexCandidates = indexedTypes.get(typeName) || [];
  
  // If exactly one match in index and it's in same package, use it
  const samePackageMatch = indexCandidates.find(c => {
    const pkg = c.substring(0, c.lastIndexOf('.'));
    return pkg === packageName;
  });
  if (samePackageMatch) {
    return { fqn: samePackageMatch, confidence: 'indexed', source: 'same_package_indexed' };
  }
  
  // If type exists in index under a blocked package, that's a risk!
  for (const candidate of indexCandidates) {
    for (const pattern of blockedPatterns) {
      if (candidate.startsWith(pattern + '.') || candidate === pattern) {
        return { fqn: candidate, confidence: 'indexed', source: 'blocked_package_in_index' };
      }
    }
  }
  
  // If no explicit import and not java.lang, assume same package
  // This is a RISK - mark with low confidence
  if (packageName) {
    return { 
      fqn: packageName + '.' + typeName, 
      confidence: 'assumed_same_package', 
      source: 'assumed_same_package' 
    };
  }
  
  return { fqn: typeName, confidence: 'assumed_same_package', source: 'unresolved' };
}

/**
 * Legacy resolve function for backward compatibility
 */
function resolveTypeFqn(typeName: string, packageName: string, imports: Map<string, string>, wildcardImports: string[]): string {
  // Already FQN
  if (typeName.includes('.')) {
    return typeName;
  }
  
  // Check explicit imports
  if (imports.has(typeName)) {
    return imports.get(typeName)!;
  }
  
  // Check java.lang (auto-imported)
  if (JAVA_LANG_TYPES.has(typeName)) {
    return 'java.lang.' + typeName;
  }
  
  // If no explicit import and not java.lang, assume same package
  // This is the key for detecting same-package dependencies!
  if (packageName) {
    return packageName + '.' + typeName;
  }
  
  return typeName;
}

// ============== Input/Output Interfaces ==============

export interface ScanMigrationInput {
  // REQUIRED
  sourcePackage: string;           // "com.asdf.util" or file path pattern
  
  // BLOCKING PATTERNS - classes with these deps cannot migrate
  blockedPatterns: string[];       // ["com.asdf.business", "biz.atune.plugin"]
  
  // OPTIONAL
  targetModule?: string;           // Check for circular deps with target
  includeSubpackages?: boolean;    // Default: true
  maxSafeExternalDeps?: number;    // Default: 0 (strict isolation)
  groupBySubpackage?: boolean;     // Group results by sub-package
  outputFormat?: "summary" | "detailed" | "json" | "migration-plan" | "tiered";
  
  // STRICT MODE - Deep file analysis for accurate same-package dependency detection
  // When enabled, parses file content directly instead of relying solely on the index
  strictMode?: boolean;            // Default: true (CRITICAL for accurate migration analysis)
  
  // Additional patterns to treat as "safe" (won't be flagged as blocking)
  safePatterns?: string[];         // e.g., ["java.", "javax.", "org.springframework."]
  
  // ========== NEW: INTRA-MODULE DEPENDENCY DETECTION ==========
  
  // Patterns WITHIN sourcePackage that also block migration
  // e.g., base classes that haven't been migrated yet
  internalBlockedPatterns?: string[];  // e.g., ["com.atune.services.base", "com.atune.services.entity"]
  
  // Classes that are explicitly ALLOWED as dependencies (already migrated or in shared module)
  // These bypass internal blocking checks
  allowedDependencies?: string[];      // e.g., ["com.atune.services.api.Service", "com.atune.services.member.PlanMemberType"]
  
  // If true, ANY dependency on another class within sourcePackage blocks migration
  // UNLESS that class is in allowedDependencies
  // This is the STRICTEST mode for identifying truly independent files
  treatInternalAsBlocked?: boolean;    // Default: false (backward compatible)
}

export interface DependencyInfo {
  target: string;                  // FQN of blocking dependency
  type: "import" | "method_call" | "field_access" | "extends" | "implements" | 
        "instantiation" | "type_reference" | "field_type" | "parameter_type" | 
        "return_type" | "local_variable" | "throws" | "catch" | "annotation" |
        "instanceof" | "cast" | "generic_type" | "array_type" | "method_reference" |
        "class_literal" | "static_access" | "same_package_type";
  location: string;                // File:line
  removable: boolean;              // Could this be extracted?
  confidence?: 'definite' | 'wildcard' | 'indexed' | 'assumed_same_package';  // How confident is this resolution?
}

/**
 * Unresolved type reference - types that couldn't be definitively resolved
 */
export interface UnresolvedRef {
  typeName: string;               // Original type name in code
  resolvedFqn: string;            // Best-guess FQN
  confidence: 'wildcard' | 'assumed_same_package';  // Why it's uncertain
  source: string;                 // What resolution method was used
  location: string;               // File:line
}

export interface ClassInfo {
  className: string;
  fqn: string;
  filePath: string;
  type: "class" | "interface" | "enum" | "record" | "annotation";
  
  // Dependency analysis
  blockedDeps: DependencyInfo[];   // Why it can't migrate (EXTERNAL blocked)
  internalBlockedDeps: DependencyInfo[];  // NEW: Internal deps that block (within sourcePackage)
  internalDeps: string[];          // Depends on OTHER files in source package (allowed)
  externalDeps: string[];          // Deps outside source package (OK)
  unresolvedRefs: UnresolvedRef[]; // Types that couldn't be definitively resolved - RISK!
  
  // Metrics
  totalDependencies: number;
  blockedCount: number;            // External blocked count
  internalBlockedCount: number;    // NEW: Internal blocked count
  unresolvedCount: number;         // Number of uncertain type resolutions
  migrationRisk: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";
  migrationScore: number;          // 0-100 score: 100 = safe, 0 = heavily blocked
  
  // NEW: Migration tier based on internal dependency chain
  // Tier 0 = no internal deps at all (migrate first)
  // Tier 1 = depends only on Tier 0 classes
  // Tier 2 = depends on Tier 0-1, etc.
  // Tier -1 = circular dependency (migrate together or refactor)
  migrationTier: number;
  
  // Suggestions
  suggestion?: string;             // "Extract interface", "Move with X", etc.
  hasUncertainDeps: boolean;       // True if any deps have low confidence resolution
}

export interface MigrationBatch {
  order: number;                   // 1 = migrate first
  classes: string[];               // FQNs
  reason: string;                  // "Pure enums/interfaces"
  dependsOn: number[];             // Batch numbers this depends on
  estimatedRisk: "LOW" | "MEDIUM" | "HIGH";
  fileCount: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  risk: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface ScanMigrationResult {
  // QUICK SUMMARY
  summary: {
    totalClasses: number;
    safeToMigrate: number;        // 0 blocked dependencies
    needsReview: number;          // 1-5 blocked deps (might be fixable)
    blocked: number;              // 6+ blocked deps
    scanTimeMs: number;
  };

  // CATEGORIZED CLASSES
  categories: {
    safe: ClassInfo[];
    review: ClassInfo[];
    blocked: ClassInfo[];
  };

  // MIGRATION EXECUTION PLAN
  migrationPlan: {
    batches: MigrationBatch[];
    estimatedEffort: string;      // "2 hours", "1 day", etc.
    riskAssessment: string;
  };

  // FOR VISUALIZATION (optional)
  dependencyGraph?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}

// ============== Tool Definition ==============

export const scanMigrationCandidatesTool: Tool = {
  name: 'scan_migration_candidates',
  description: `Bulk analyze a package to identify migration-ready classes with COMPREHENSIVE dependency detection.

**CRITICAL**: This tool now detects INTRA-MODULE dependencies that previously caused false positives!

**New in v2.8.0**:
- \`internalBlockedPatterns\`: Block patterns WITHIN your source package (e.g., base classes)
- \`allowedDependencies\`: Whitelist classes already migrated or in shared modules
- \`treatInternalAsBlocked\`: STRICT mode - all internal deps block unless in allowlist
- \`outputFormat: "tiered"\`: Shows migration order by internal dependency tier
- \`migrationTier\`: Each class now has a tier (0 = no internal deps, migrate first)

**When to use**: Planning module extraction, large-scale refactoring, dependency cleanup.

**Key Features**:
- Detects extends/implements with same-package types (no import needed in Java)
- Finds type references in: fields, method params, return types, local variables
- Catches: throws/catch types, annotations, instanceof, casts, generics, method references
- Identifies class literals (Entity.class) and static access patterns
- **NEW**: Detects intra-module dependencies (e.g., GeneralLogicService, Entity)

**Example - Find truly independent classes**:
\`\`\`javascript
scan_migration_candidates({
  sourcePackage: "com.atune.services.member",
  blockedPatterns: ["com.atune.business", "biz.atune"],
  internalBlockedPatterns: ["com.atune.services.base"],  // Block base classes
  treatInternalAsBlocked: true,  // STRICT: all internal deps block
  allowedDependencies: ["com.atune.services.api.Service"],  // Already in shared module
  outputFormat: "tiered"  // Show migration order
})
\`\`\`

**Risk Categories**:
- SAFE: 0 blocked deps (external AND internal) - migrate immediately
- LOW/MEDIUM: 1-5 blocked deps - may need minor refactoring
- BLOCKED: 6+ blocked deps - leave in place or major refactor

**Migration Tiers**:
- Tier 0: No internal deps at all → migrate FIRST
- Tier 1: Depends only on Tier 0 classes → migrate after Tier 0
- Tier 2+: Higher tiers depend on lower tiers
- Tier -1: Circular dependencies → migrate together or refactor`,
  inputSchema: {
    type: 'object',
    properties: {
      sourcePackage: {
        type: 'string',
        description: 'Package name to analyze (e.g., "com.example.util") or file path pattern'
      },
      blockedPatterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Package patterns that block migration (e.g., ["com.example.business"])'
      },
      targetModule: {
        type: 'string',
        description: 'Optional: target module to check for circular dependencies'
      },
      includeSubpackages: {
        type: 'boolean',
        description: 'Include classes in sub-packages (default: true)',
        default: true
      },
      maxSafeExternalDeps: {
        type: 'number',
        description: 'Max blocked deps to still be considered "needs review" (default: 5)',
        default: 5
      },
      groupBySubpackage: {
        type: 'boolean',
        description: 'Group results by sub-package in output',
        default: false
      },
      outputFormat: {
        type: 'string',
        enum: ['summary', 'detailed', 'json', 'migration-plan', 'tiered'],
        description: 'Output format: summary (quick), detailed (full), json (structured), migration-plan (with batches), tiered (migration order by dependency tier)',
        default: 'migration-plan'
      },
      strictMode: {
        type: 'boolean',
        description: 'Enable deep file analysis to detect ALL dependencies including same-package types that don\'t require imports. HIGHLY RECOMMENDED for accurate migration analysis.',
        default: true
      },
      safePatterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional package patterns to treat as safe (e.g., ["java.", "javax.", "org.springframework."])'
      },
      // ========== NEW PARAMETERS FOR INTRA-MODULE DEPENDENCY DETECTION ==========
      internalBlockedPatterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Patterns WITHIN sourcePackage that also block migration (e.g., ["com.atune.services.base"] for base classes not yet migrated)'
      },
      allowedDependencies: {
        type: 'array',
        items: { type: 'string' },
        description: 'Classes explicitly ALLOWED as dependencies - already migrated or in shared module (e.g., ["com.atune.services.api.Service"])'
      },
      treatInternalAsBlocked: {
        type: 'boolean',
        description: 'If true, ANY internal dependency (within sourcePackage) blocks migration UNLESS in allowedDependencies. Use this to find truly independent classes.',
        default: false
      }
    },
    required: ['sourcePackage', 'blockedPatterns']
  }
};

// ============== Helper Functions ==============

/**
 * Check if a package/class name matches any blocked pattern
 */
function matchesBlockedPattern(fqn: string, blockedPatterns: string[]): boolean {
  for (const pattern of blockedPatterns) {
    // Exact match or prefix match (for packages)
    if (fqn === pattern || fqn.startsWith(pattern + '.')) {
      return true;
    }
    // Also check if the FQN is within the blocked package
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (fqn.startsWith(prefix)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a class is in the allowed dependencies list
 * Supports exact match and package prefix matching
 */
function isAllowedDependency(fqn: string, allowedDependencies?: string[]): boolean {
  if (!allowedDependencies || allowedDependencies.length === 0) {
    return false;
  }
  
  for (const allowed of allowedDependencies) {
    // Exact match
    if (fqn === allowed) {
      return true;
    }
    // Package prefix with wildcard (e.g., "com.example.api.*")
    if (allowed.endsWith('.*')) {
      const prefix = allowed.slice(0, -2);
      if (fqn.startsWith(prefix + '.')) {
        return true;
      }
    }
    // Package prefix match (e.g., "com.example.api" matches "com.example.api.Service")
    if (fqn.startsWith(allowed + '.')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a class matches any internal blocked pattern
 * These are patterns WITHIN the source package that should block migration
 */
function matchesInternalBlockedPattern(fqn: string, internalBlockedPatterns?: string[]): boolean {
  if (!internalBlockedPatterns || internalBlockedPatterns.length === 0) {
    return false;
  }
  return matchesBlockedPattern(fqn, internalBlockedPatterns);
}

/**
 * Compute migration tiers based on internal dependency chains
 * 
 * Tier 0: Classes with NO internal dependencies at all (migrate first)
 * Tier 1: Classes depending ONLY on Tier 0 classes
 * Tier 2: Classes depending on Tier 0-1 classes
 * ...
 * Tier -1: Circular dependencies (must migrate together or refactor)
 * 
 * @param classes All classes being analyzed
 * @returns Map of FQN to tier number
 */
function computeMigrationTiers(classes: ClassInfo[]): Map<string, number> {
  const tiers = new Map<string, number>();
  const classSet = new Set(classes.map(c => c.fqn));
  const assigned = new Set<string>();
  
  // Helper to get internal deps that are in our class set
  const getInternalDeps = (cls: ClassInfo): string[] => {
    return cls.internalDeps.filter(d => classSet.has(d));
  };
  
  // First pass: Tier 0 = classes with no internal dependencies
  for (const cls of classes) {
    // Also count internalBlockedDeps as internal deps for tier calculation
    const internalDeps = getInternalDeps(cls);
    const internalBlockedDeps = cls.internalBlockedDeps.map(d => d.target).filter(t => classSet.has(t));
    const allInternalDeps = [...new Set([...internalDeps, ...internalBlockedDeps])];
    
    if (allInternalDeps.length === 0) {
      tiers.set(cls.fqn, 0);
      assigned.add(cls.fqn);
    }
  }
  
  // Iteratively assign higher tiers
  let tier = 0;
  let maxIterations = classes.length; // Prevent infinite loops
  
  while (assigned.size < classes.length && maxIterations-- > 0) {
    tier++;
    const newlyAssigned: string[] = [];
    
    for (const cls of classes) {
      if (assigned.has(cls.fqn)) continue;
      
      // Get all internal deps (allowed + blocked)
      const internalDeps = getInternalDeps(cls);
      const internalBlockedDeps = cls.internalBlockedDeps.map(d => d.target).filter(t => classSet.has(t));
      const allInternalDeps = [...new Set([...internalDeps, ...internalBlockedDeps])];
      
      // Check if all deps are in lower tiers
      const allDepsAssigned = allInternalDeps.every(d => assigned.has(d));
      
      if (allDepsAssigned) {
        tiers.set(cls.fqn, tier);
        newlyAssigned.push(cls.fqn);
      }
    }
    
    if (newlyAssigned.length === 0) {
      // Circular dependency detected - assign remaining to tier -1
      for (const cls of classes) {
        if (!assigned.has(cls.fqn)) {
          tiers.set(cls.fqn, -1);
          assigned.add(cls.fqn);
        }
      }
      break;
    }
    
    newlyAssigned.forEach(fqn => assigned.add(fqn));
  }
  
  return tiers;
}

/**
 * Determine if a dependency can potentially be removed/extracted
 */
function isRemovableDependency(depType: string): boolean {
  // Method calls and field accesses might be extractable to interfaces
  // Inheritance (extends/implements) is harder to remove
  return depType === 'method_call' || depType === 'field_access' || depType === 'instantiation';
}

/**
 * Calculate migration risk based on blocked dependency count (external + internal)
 */
function calculateRisk(blockedCount: number, internalBlockedCount: number, maxSafeExternal: number): ClassInfo['migrationRisk'] {
  const totalBlocked = blockedCount + internalBlockedCount;
  if (totalBlocked === 0) return 'SAFE';
  if (totalBlocked <= 2) return 'LOW';
  if (totalBlocked <= maxSafeExternal) return 'MEDIUM';
  return 'BLOCKED';
}

/**
 * Calculate migration safety score (0-100)
 * 100 = completely safe to migrate (no blocked deps)
 * 0 = heavily blocked, major refactoring required
 * 
 * Scoring:
 * - Start at 100
 * - extends blocked: -20 (hardest to fix)
 * - extends internal blocked: -25 (even harder - need to migrate dependency first)
 * - implements blocked: -15 (hard to fix)
 * - method_call blocked: -5 each
 * - field_access blocked: -5 each
 * - instantiation blocked: -8 each (need DI)
 * - internal blocked (non-extends): -10 each (need to migrate dependency first)
 * - other types: -3 each
 */
function calculateMigrationScore(blockedDeps: DependencyInfo[], internalBlockedDeps: DependencyInfo[]): number {
  if (blockedDeps.length === 0 && internalBlockedDeps.length === 0) return 100;
  
  let score = 100;
  
  // External blocked deps
  for (const dep of blockedDeps) {
    switch (dep.type) {
      case 'extends':
        score -= 20;
        break;
      case 'implements':
        score -= 15;
        break;
      case 'instantiation':
        score -= 8;
        break;
      case 'method_call':
      case 'field_access':
        score -= 5;
        break;
      default:
        score -= 3;
        break;
    }
  }
  
  // Internal blocked deps (within source package but not yet migrated)
  // These are HARDER to fix because you need to migrate the dependency first
  for (const dep of internalBlockedDeps) {
    switch (dep.type) {
      case 'extends':
        score -= 25; // Even harder than external
        break;
      case 'implements':
        score -= 18;
        break;
      default:
        score -= 10; // Significant penalty for internal deps
        break;
    }
  }
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate suggestion based on blocked dependencies (external + internal)
 */
function generateSuggestion(classInfo: ClassInfo): string {
  const totalBlocked = classInfo.blockedCount + classInfo.internalBlockedCount;
  
  if (totalBlocked === 0) {
    return 'Ready to migrate - no blocked dependencies';
  }
  
  const allBlockedDeps = [...classInfo.blockedDeps, ...classInfo.internalBlockedDeps];
  const depTypes = new Set(allBlockedDeps.map(d => d.type));
  const suggestions: string[] = [];
  
  // Check for internal blocked first (more actionable)
  if (classInfo.internalBlockedCount > 0) {
    const internalTargets = classInfo.internalBlockedDeps.map(d => d.target.split('.').pop()).slice(0, 3).join(', ');
    suggestions.push(`Migrate these internal deps first: ${internalTargets}`);
  }
  
  if (depTypes.has('extends')) {
    const extendsInternal = classInfo.internalBlockedDeps.find(d => d.type === 'extends');
    if (extendsInternal) {
      suggestions.push(`Extends ${extendsInternal.target.split('.').pop()} - migrate parent class first`);
    } else {
      suggestions.push('Consider extracting interface from parent class');
    }
  }
  if (depTypes.has('implements')) {
    suggestions.push('Interface dependency - may need to move interface first');
  }
  if (depTypes.has('method_call')) {
    const removable = allBlockedDeps.filter(d => d.type === 'method_call' && d.removable).length;
    if (removable > 0) {
      suggestions.push(`${removable} method call(s) could be extracted to interface`);
    }
  }
  if (depTypes.has('instantiation')) {
    suggestions.push('Consider using dependency injection instead of direct instantiation');
  }
  if (depTypes.has('field_access')) {
    suggestions.push('Consider using getter/setter methods or constants');
  }
  
  if (totalBlocked > 10) {
    suggestions.push('Too coupled - consider major refactoring or leave in place');
  }
  
  return suggestions.length > 0 ? suggestions.join('; ') : 'Review blocking dependencies';
}

/**
 * Topological sort for migration batch ordering
 * Classes with no internal dependencies come first
 */
function computeMigrationBatches(
  classes: ClassInfo[],
  sourcePackage: string
): MigrationBatch[] {
  const batches: MigrationBatch[] = [];
  const processed = new Set<string>();
  const fqnToClass = new Map(classes.map(c => [c.fqn, c]));
  
  // Helper to get internal deps that are also in our class set
  const getUnprocessedInternalDeps = (classInfo: ClassInfo): string[] => {
    return classInfo.internalDeps.filter(dep => 
      fqnToClass.has(dep) && !processed.has(dep)
    );
  };
  
  let batchOrder = 1;
  let remainingClasses = [...classes];
  
  while (remainingClasses.length > 0) {
    // Find classes with no unprocessed internal dependencies
    const batchClasses = remainingClasses.filter(c => 
      getUnprocessedInternalDeps(c).length === 0
    );
    
    if (batchClasses.length === 0) {
      // Circular dependency detected - take classes with fewest unprocessed deps
      const sorted = remainingClasses.sort((a, b) => 
        getUnprocessedInternalDeps(a).length - getUnprocessedInternalDeps(b).length
      );
      batchClasses.push(sorted[0]);
    }
    
    // Categorize the batch
    const pureTypes = batchClasses.filter(c => 
      c.type === 'enum' || c.type === 'interface' || c.type === 'annotation' ||
      (c.internalDeps.length === 0 && c.blockedCount === 0)
    );
    const utilities = batchClasses.filter(c => 
      !pureTypes.includes(c) && c.blockedCount === 0
    );
    const reviewNeeded = batchClasses.filter(c => 
      !pureTypes.includes(c) && !utilities.includes(c)
    );
    
    // Create sub-batches for better ordering
    if (pureTypes.length > 0) {
      const batch: MigrationBatch = {
        order: batchOrder++,
        classes: pureTypes.map(c => c.fqn),
        reason: 'Pure types: enums, interfaces, constants with 0 dependencies',
        dependsOn: batches.length > 0 ? [batches[batches.length - 1].order] : [],
        estimatedRisk: 'LOW',
        fileCount: pureTypes.length
      };
      batches.push(batch);
      pureTypes.forEach(c => processed.add(c.fqn));
    }
    
    if (utilities.length > 0) {
      const batch: MigrationBatch = {
        order: batchOrder++,
        classes: utilities.map(c => c.fqn),
        reason: 'Utility classes with no blocked dependencies',
        dependsOn: batches.length > 0 ? [batches[batches.length - 1].order] : [],
        estimatedRisk: 'LOW',
        fileCount: utilities.length
      };
      batches.push(batch);
      utilities.forEach(c => processed.add(c.fqn));
    }
    
    if (reviewNeeded.length > 0) {
      const hasRemovable = reviewNeeded.some(c => 
        c.blockedDeps.some(d => d.removable)
      );
      const batch: MigrationBatch = {
        order: batchOrder++,
        classes: reviewNeeded.map(c => c.fqn),
        reason: hasRemovable 
          ? 'Classes with potentially removable blocked dependencies'
          : 'Classes requiring refactoring before migration',
        dependsOn: batches.length > 0 ? [batches[batches.length - 1].order] : [],
        estimatedRisk: reviewNeeded.every(c => c.migrationRisk === 'BLOCKED') ? 'HIGH' : 'MEDIUM',
        fileCount: reviewNeeded.length
      };
      batches.push(batch);
      reviewNeeded.forEach(c => processed.add(c.fqn));
    }
    
    // Remove processed classes
    remainingClasses = remainingClasses.filter(c => !processed.has(c.fqn));
  }
  
  return batches;
}

/**
 * Estimate effort based on class counts and risk levels
 */
function estimateEffort(categories: ScanMigrationResult['categories']): string {
  const safeCount = categories.safe.length;
  const reviewCount = categories.review.length;
  const blockedCount = categories.blocked.length;
  
  // Rough estimates: safe = 1 min, review = 15 min, blocked = 1 hour each
  const safeHours = safeCount / 60;
  const reviewHours = (reviewCount * 15) / 60;
  const blockedHours = blockedCount;
  
  const totalHours = safeHours + reviewHours + blockedHours;
  
  if (totalHours < 1) return `${Math.ceil(totalHours * 60)} minutes`;
  if (totalHours < 8) return `${totalHours.toFixed(1)} hours`;
  if (totalHours < 40) return `${Math.ceil(totalHours / 8)} days`;
  return `${Math.ceil(totalHours / 40)} weeks`;
}

// ============== Main Handler ==============

export async function handleScanMigrationCandidates(
  args: any,
  memoryIndex: MemoryIndex
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const startTime = Date.now();
  
  try {
    // Parse input
    const input: ScanMigrationInput = {
      sourcePackage: args.sourcePackage as string,
      blockedPatterns: (args.blockedPatterns as string[]) || [],
      targetModule: args.targetModule as string | undefined,
      includeSubpackages: args.includeSubpackages !== false,
      maxSafeExternalDeps: (args.maxSafeExternalDeps as number) ?? 5,
      groupBySubpackage: args.groupBySubpackage === true,
      outputFormat: (args.outputFormat as ScanMigrationInput['outputFormat']) || 'migration-plan',
      strictMode: args.strictMode !== false, // Default to true for comprehensive analysis
      safePatterns: (args.safePatterns as string[]) || ['java.', 'javax.', 'sun.', 'com.sun.'],
      // NEW: Intra-module dependency detection parameters
      internalBlockedPatterns: (args.internalBlockedPatterns as string[]) || [],
      allowedDependencies: (args.allowedDependencies as string[]) || [],
      treatInternalAsBlocked: args.treatInternalAsBlocked === true  // Default false for backward compatibility
    };
    
    if (!input.sourcePackage) {
      return {
        content: [{ type: 'text', text: 'Error: sourcePackage is required' }],
        isError: true
      };
    }
    
    if (!input.blockedPatterns || input.blockedPatterns.length === 0) {
      return {
        content: [{ type: 'text', text: 'Error: blockedPatterns is required (at least one pattern)' }],
        isError: true
      };
    }
    
    // Find all classes in the source package
    const allSymbols = memoryIndex.getAllSymbols();
    const packageClasses: SymbolStub[] = [];
    const sourcePackagePrefix = input.sourcePackage + '.';
    
    for (const [fqn, stub] of allSymbols) {
      // Only include top-level classes/interfaces/enums/records (not methods/fields)
      if (stub.kind !== 'class' && stub.kind !== 'interface' && stub.kind !== 'enum' && stub.kind !== 'record') {
        continue;
      }
      
      // Extract package name from FQN if not available
      const packageName = stub.packageName || (() => {
        const lastDot = fqn.lastIndexOf('.');
        return lastDot > 0 ? fqn.substring(0, lastDot) : '';
      })();
      
      // Check if in source package
      const inSourcePackage = input.includeSubpackages
        ? (packageName === input.sourcePackage || packageName.startsWith(sourcePackagePrefix))
        : packageName === input.sourcePackage;
      
      if (inSourcePackage) {
        packageClasses.push(stub);
      }
    }
    
    if (packageClasses.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No classes found in package: ${input.sourcePackage}\n\n` +
                `**Suggestions:**\n` +
                `- Check if the project is indexed (use index_project first)\n` +
                `- Verify the package name is correct\n` +
                `- Use find_symbol to search for classes`
        }]
      };
    }
    
    // Build a set of all classes in the package (for internal dependency detection)
    const packageFqns = new Set(packageClasses.map(c => c.fqn));
    const packageSimpleNames = new Map<string, string>(); // simpleName -> FQN
    for (const cls of packageClasses) {
      packageSimpleNames.set(cls.name, cls.fqn);
    }
    
    // Build index of all types by simple name for enhanced resolution
    const indexedTypes = new Map<string, string[]>();  // simpleName -> [FQN1, FQN2, ...]
    for (const [fqn, stub] of allSymbols) {
      if (stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum' || stub.kind === 'record') {
        const existing = indexedTypes.get(stub.name) || [];
        existing.push(fqn);
        indexedTypes.set(stub.name, existing);
      }
    }
    
    // Analyze each class
    const classInfos: ClassInfo[] = [];
    
    for (const stub of packageClasses) {
      const blockedDeps: DependencyInfo[] = [];
      const internalBlockedDeps: DependencyInfo[] = [];  // NEW: Internal blocked deps
      const internalDeps: string[] = [];
      const externalDeps: string[] = [];
      const unresolvedRefs: UnresolvedRef[] = [];
      const processedTargets = new Set<string>();
      
      // Helper to check if a pattern is safe (not blocking)
      const isSafePattern = (fqn: string): boolean => {
        for (const pattern of input.safePatterns || []) {
          if (fqn.startsWith(pattern)) return true;
        }
        return false;
      };
      
      // NEW: Helper to check if an internal dependency should block migration
      const isInternalBlocked = (targetFqn: string): boolean => {
        // If it's in the allowed dependencies list, it's OK
        if (isAllowedDependency(targetFqn, input.allowedDependencies)) {
          return false;
        }
        
        // If treatInternalAsBlocked is true, ALL internal deps are blocked unless allowed
        if (input.treatInternalAsBlocked) {
          return true;
        }
        
        // Otherwise, only block if it matches internalBlockedPatterns
        return matchesInternalBlockedPattern(targetFqn, input.internalBlockedPatterns);
      };
      
      // STRICT MODE: Parse file content directly to catch ALL dependencies
      if (input.strictMode && stub.file && fs.existsSync(stub.file)) {
        const fileAnalysis = parseJavaFile(stub.file);
        if (fileAnalysis) {
          // Build enhanced resolution context
          const resolutionContext: TypeResolutionContext = {
            packageName: fileAnalysis.packageName,
            imports: fileAnalysis.imports,
            wildcardImports: fileAnalysis.wildcardImports,
            indexedTypes,
            blockedPatterns: input.blockedPatterns
          };
          
          for (const typeRef of fileAnalysis.typeReferences) {
            // Use enhanced type resolution with confidence tracking
            const resolution = resolveTypeFqnEnhanced(typeRef.typeName, resolutionContext);
            const resolvedFqn = resolution.fqn;
            
            // Skip self-references
            if (resolvedFqn === stub.fqn) continue;
            
            // Skip already processed
            const key = `${resolvedFqn}:${typeRef.kind}`;
            if (processedTargets.has(key)) continue;
            processedTargets.add(key);
            
            // Skip safe patterns (java.*, javax.*, etc.)
            if (isSafePattern(resolvedFqn)) continue;
            
            // Track unresolved/uncertain references
            if (resolution.confidence === 'assumed_same_package' || resolution.confidence === 'wildcard') {
              // Check if this MIGHT be a blocked package type
              let mightBeBlocked = false;
              for (const pattern of input.blockedPatterns) {
                const potentialFqn = pattern + '.' + typeRef.typeName;
                const candidates = indexedTypes.get(typeRef.typeName) || [];
                if (candidates.some(c => c.startsWith(pattern + '.'))) {
                  mightBeBlocked = true;
                  break;
                }
              }
              
              // Also check wildcard imports for potential blocked resolution
              if (!mightBeBlocked && resolution.confidence === 'wildcard') {
                mightBeBlocked = true;  // Wildcard imports are inherently risky
              }
              
              if (mightBeBlocked || resolution.source === 'assumed_same_package') {
                unresolvedRefs.push({
                  typeName: typeRef.typeName,
                  resolvedFqn: resolvedFqn,
                  confidence: resolution.confidence as 'wildcard' | 'assumed_same_package',
                  source: resolution.source,
                  location: `${stub.file}:${typeRef.line}`
                });
              }
            }
            
            // Check if it's a blocked dependency (external)
            if (matchesBlockedPattern(resolvedFqn, input.blockedPatterns)) {
              blockedDeps.push({
                target: resolvedFqn,
                type: typeRef.kind as DependencyInfo['type'],
                location: `${stub.file}:${typeRef.line}`,
                removable: isRemovableDependency(typeRef.kind),
                confidence: resolution.confidence
              });
            }
            // Check if it's an internal dependency (same package class)
            else if (packageFqns.has(resolvedFqn)) {
              // NEW: Check if this internal dependency should block migration
              if (isInternalBlocked(resolvedFqn)) {
                internalBlockedDeps.push({
                  target: resolvedFqn,
                  type: typeRef.kind as DependencyInfo['type'],
                  location: `${stub.file}:${typeRef.line}`,
                  removable: false,  // Internal deps can't be removed - need to migrate first
                  confidence: resolution.confidence
                });
              } else if (!internalDeps.includes(resolvedFqn)) {
                internalDeps.push(resolvedFqn);
              }
            }
            // Check if simple name matches a package class (same-package reference)
            else if (packageSimpleNames.has(typeRef.typeName)) {
              const actualFqn = packageSimpleNames.get(typeRef.typeName)!;
              if (actualFqn !== stub.fqn) {
                // Check if externally blocked
                if (matchesBlockedPattern(actualFqn, input.blockedPatterns)) {
                  blockedDeps.push({
                    target: actualFqn,
                    type: 'same_package_type',
                    location: `${stub.file}:${typeRef.line}`,
                    removable: isRemovableDependency(typeRef.kind),
                    confidence: 'indexed'
                  });
                }
                // Check if internally blocked
                else if (isInternalBlocked(actualFqn)) {
                  internalBlockedDeps.push({
                    target: actualFqn,
                    type: 'same_package_type',
                    location: `${stub.file}:${typeRef.line}`,
                    removable: false,
                    confidence: 'indexed'
                  });
                } else if (!internalDeps.includes(actualFqn)) {
                  internalDeps.push(actualFqn);
                }
              }
            }
            // Check if it matches internalBlockedPatterns (even if not in same package)
            // This catches dependencies like com.atune.services.base.Entity when scanning com.atune.services.member
            else if (matchesInternalBlockedPattern(resolvedFqn, input.internalBlockedPatterns)) {
              // Check if it's in the allowed list
              if (!isAllowedDependency(resolvedFqn, input.allowedDependencies)) {
                internalBlockedDeps.push({
                  target: resolvedFqn,
                  type: typeRef.kind as DependencyInfo['type'],
                  location: `${stub.file}:${typeRef.line}`,
                  removable: false,  // Internal blocked deps need to be migrated first
                  confidence: resolution.confidence
                });
              } else if (!externalDeps.includes(resolvedFqn)) {
                externalDeps.push(resolvedFqn);
              }
            }
            // External but not blocked
            else {
              if (!externalDeps.includes(resolvedFqn)) {
                externalDeps.push(resolvedFqn);
              }
            }
          }
        }
      }
      
      // Also use index-based references (catches method calls, field access, etc.)
      const refs = memoryIndex.findReferencesFromClass(stub.fqn);
      
      for (const ref of refs) {
        let targetFqn = ref.toFqn;
        
        // Extract class FQN from method/field references
        const parenIdx = targetFqn.indexOf('(');
        const fqnWithoutParams = parenIdx > 0 ? targetFqn.substring(0, parenIdx) : targetFqn;
        const lastDot = fqnWithoutParams.lastIndexOf('.');
        if (lastDot > 0 && (ref.kind === 'method_call' || ref.kind === 'field_access')) {
          targetFqn = fqnWithoutParams.substring(0, lastDot);
        }
        
        // Skip self-references and safe patterns
        if (targetFqn === stub.fqn || isSafePattern(targetFqn)) {
          continue;
        }
        
        // Skip if already processed
        const key = `${targetFqn}:${ref.kind}`;
        if (processedTargets.has(key)) continue;
        processedTargets.add(key);
        
        // Check if it's a blocked dependency (external)
        if (matchesBlockedPattern(targetFqn, input.blockedPatterns)) {
          blockedDeps.push({
            target: targetFqn,
            type: ref.kind as DependencyInfo['type'],
            location: `${ref.file}:${ref.line}`,
            removable: isRemovableDependency(ref.kind),
            confidence: 'indexed'
          });
        }
        // Check if it's an internal dependency (within source package)
        else if (packageFqns.has(targetFqn)) {
          // NEW: Check if this internal dependency should block migration
          if (isInternalBlocked(targetFqn)) {
            internalBlockedDeps.push({
              target: targetFqn,
              type: ref.kind as DependencyInfo['type'],
              location: `${ref.file}:${ref.line}`,
              removable: false,
              confidence: 'indexed'
            });
          } else if (!internalDeps.includes(targetFqn)) {
            internalDeps.push(targetFqn);
          }
        }
        // Check if it matches internalBlockedPatterns (cross-package internal deps)
        else if (matchesInternalBlockedPattern(targetFqn, input.internalBlockedPatterns)) {
          if (!isAllowedDependency(targetFqn, input.allowedDependencies)) {
            internalBlockedDeps.push({
              target: targetFqn,
              type: ref.kind as DependencyInfo['type'],
              location: `${ref.file}:${ref.line}`,
              removable: false,
              confidence: 'indexed'
            });
          } else if (!externalDeps.includes(targetFqn)) {
            externalDeps.push(targetFqn);
          }
        }
        // External but not blocked
        else {
          if (!externalDeps.includes(targetFqn)) {
            externalDeps.push(targetFqn);
          }
        }
      }
      
      // ========================================================================
      // EXPLORE_CLASS-STYLE ANALYSIS: Use call graph for deeper method-level deps
      // This catches dependencies that file parsing might miss
      // ========================================================================
      
      // Find all methods belonging to this class
      const classMethods: SymbolStub[] = [];
      for (const [symbolFqn, s] of allSymbols) {
        if ((symbolFqn.startsWith(stub.fqn + '.') || s.declaringClass === stub.fqn) && 
            (s.kind === 'method' || s.kind === 'constructor')) {
          classMethods.push(s);
        }
      }
      
      // Analyze outbound calls from each method (like explore_class does)
      for (const method of classMethods) {
        const outboundCalls = memoryIndex.getOutboundCalls(method.fqn);
        for (const call of outboundCalls) {
          const calleeFqn = call.callee;
          
          // Extract class FQN from method call
          const parenIdx = calleeFqn.indexOf('(');
          const fqnWithoutParams = parenIdx > 0 ? calleeFqn.substring(0, parenIdx) : calleeFqn;
          const lastDot = fqnWithoutParams.lastIndexOf('.');
          
          if (lastDot <= 0) continue; // No class part
          
          const calleeClass = fqnWithoutParams.substring(0, lastDot);
          
          // Skip self-references and safe patterns
          if (calleeClass === stub.fqn || isSafePattern(calleeClass)) continue;
          
          // Skip if already processed
          const key = `${calleeClass}:call_graph`;
          if (processedTargets.has(key)) continue;
          processedTargets.add(key);
          
          // Resolve simple names to FQN if needed
          let resolvedClass = calleeClass;
          if (!calleeClass.includes('.')) {
            // Try to find in index
            const matches = indexedTypes.get(calleeClass) || [];
            const samePackageMatch = matches.find(m => m.startsWith(stub.packageName + '.'));
            resolvedClass = samePackageMatch || matches[0] || calleeClass;
          }
          
          // Check if it's a blocked dependency (external)
          if (matchesBlockedPattern(resolvedClass, input.blockedPatterns)) {
            blockedDeps.push({
              target: resolvedClass,
              type: 'method_call',
              location: `${method.file}:${method.line}`,
              removable: true,
              confidence: 'indexed'
            });
          }
          // Check if it's an internal dependency
          else if (packageFqns.has(resolvedClass)) {
            // NEW: Check if this internal dependency should block migration
            if (isInternalBlocked(resolvedClass)) {
              internalBlockedDeps.push({
                target: resolvedClass,
                type: 'method_call',
                location: `${method.file}:${method.line}`,
                removable: false,
                confidence: 'indexed'
              });
            } else if (!internalDeps.includes(resolvedClass)) {
              internalDeps.push(resolvedClass);
            }
          }
          // Check if it matches internalBlockedPatterns (cross-package internal deps)
          else if (matchesInternalBlockedPattern(resolvedClass, input.internalBlockedPatterns)) {
            if (!isAllowedDependency(resolvedClass, input.allowedDependencies)) {
              internalBlockedDeps.push({
                target: resolvedClass,
                type: 'method_call',
                location: `${method.file}:${method.line}`,
                removable: false,
                confidence: 'indexed'
              });
            } else if (!externalDeps.includes(resolvedClass)) {
              externalDeps.push(resolvedClass);
            }
          }
          // External but not blocked
          else if (resolvedClass.includes('.')) {
            if (!externalDeps.includes(resolvedClass)) {
              externalDeps.push(resolvedClass);
            }
          }
        }
      }
      
      // Also check extends/implements from symbol itself
      const extendsClass = stub.extends || stub.extendsClass;
      if (extendsClass && !processedTargets.has(`${extendsClass}:extends`)) {
        if (matchesBlockedPattern(extendsClass, input.blockedPatterns)) {
          blockedDeps.push({
            target: extendsClass,
            type: 'extends',
            location: `${stub.file}:${stub.line}`,
            removable: false,
            confidence: 'definite'
          });
        } else if (packageFqns.has(extendsClass)) {
          // NEW: Check if internal extends should block
          if (isInternalBlocked(extendsClass)) {
            internalBlockedDeps.push({
              target: extendsClass,
              type: 'extends',
              location: `${stub.file}:${stub.line}`,
              removable: false,
              confidence: 'definite'
            });
          } else if (!internalDeps.includes(extendsClass)) {
            internalDeps.push(extendsClass);
          }
        }
        // Check if extends matches internalBlockedPatterns (cross-package)
        else if (matchesInternalBlockedPattern(extendsClass, input.internalBlockedPatterns)) {
          if (!isAllowedDependency(extendsClass, input.allowedDependencies)) {
            internalBlockedDeps.push({
              target: extendsClass,
              type: 'extends',
              location: `${stub.file}:${stub.line}`,
              removable: false,
              confidence: 'definite'
            });
          }
        }
      }
      
      const implementsInterfaces = stub.implements || stub.implementsInterfaces || [];
      for (const iface of implementsInterfaces) {
        if (processedTargets.has(`${iface}:implements`)) continue;
        if (matchesBlockedPattern(iface, input.blockedPatterns)) {
          blockedDeps.push({
            target: iface,
            type: 'implements',
            location: `${stub.file}:${stub.line}`,
            removable: false,
            confidence: 'definite'
          });
        } else if (packageFqns.has(iface)) {
          // NEW: Check if internal implements should block
          if (isInternalBlocked(iface)) {
            internalBlockedDeps.push({
              target: iface,
              type: 'implements',
              location: `${stub.file}:${stub.line}`,
              removable: false,
              confidence: 'definite'
            });
          } else if (!internalDeps.includes(iface)) {
            internalDeps.push(iface);
          }
        }
        // Check if implements matches internalBlockedPatterns (cross-package)
        else if (matchesInternalBlockedPattern(iface, input.internalBlockedPatterns)) {
          if (!isAllowedDependency(iface, input.allowedDependencies)) {
            internalBlockedDeps.push({
              target: iface,
              type: 'implements',
              location: `${stub.file}:${stub.line}`,
              removable: false,
              confidence: 'definite'
            });
          }
        }
      }
      
      // Calculate score with penalty for unresolved refs AND internal blocked deps
      const baseScore = calculateMigrationScore(blockedDeps, internalBlockedDeps);
      const unresolvedPenalty = Math.min(unresolvedRefs.length * 5, 30); // Max 30 point penalty
      const adjustedScore = unresolvedRefs.length > 0 ? Math.max(0, baseScore - unresolvedPenalty) : baseScore;
      
      // Determine if class has uncertain dependencies
      const hasUncertainDeps = unresolvedRefs.length > 0 || 
        blockedDeps.some(d => d.confidence === 'wildcard' || d.confidence === 'assumed_same_package');
      
      // Adjust risk based on uncertainty AND internal blocked deps - never SAFE if uncertain or internal blocked
      let risk = calculateRisk(blockedDeps.length, internalBlockedDeps.length, input.maxSafeExternalDeps ?? 5);
      if ((hasUncertainDeps || internalBlockedDeps.length > 0) && risk === 'SAFE') {
        risk = 'LOW';  // Downgrade SAFE to LOW if there's uncertainty or internal blocking
      }
      
      const classInfo: ClassInfo = {
        className: stub.name,
        fqn: stub.fqn,
        filePath: stub.file,
        type: stub.kind as ClassInfo['type'],
        blockedDeps,
        internalBlockedDeps,  // NEW
        internalDeps,
        externalDeps,
        unresolvedRefs,
        totalDependencies: blockedDeps.length + internalBlockedDeps.length + internalDeps.length + externalDeps.length,
        blockedCount: blockedDeps.length,
        internalBlockedCount: internalBlockedDeps.length,  // NEW
        unresolvedCount: unresolvedRefs.length,
        migrationRisk: risk,
        migrationScore: adjustedScore,
        migrationTier: 0,  // Will be computed after all classes are analyzed
        hasUncertainDeps
      };
      
      classInfo.suggestion = generateSuggestion(classInfo);
      classInfos.push(classInfo);
    }
    
    // Compute migration tiers based on internal dependency chains
    const migrationTiers = computeMigrationTiers(classInfos);
    for (const classInfo of classInfos) {
      classInfo.migrationTier = migrationTiers.get(classInfo.fqn) ?? -1;
    }
    
    // Categorize classes - also consider internal blocked deps for categorization
    const categories = {
      safe: classInfos.filter(c => c.migrationRisk === 'SAFE' && c.internalBlockedCount === 0),
      review: classInfos.filter(c => 
        (c.migrationRisk === 'LOW' || c.migrationRisk === 'MEDIUM') ||
        (c.migrationRisk === 'SAFE' && c.internalBlockedCount > 0)  // Downgrade SAFE with internal blocked
      ),
      blocked: classInfos.filter(c => c.migrationRisk === 'BLOCKED' || c.migrationRisk === 'HIGH')
    };
    
    // Compute migration batches
    const migratable = [...categories.safe, ...categories.review];
    const batches = computeMigrationBatches(migratable, input.sourcePackage);
    
    // Build result
    const scanTimeMs = Date.now() - startTime;
    
    const result: ScanMigrationResult = {
      summary: {
        totalClasses: classInfos.length,
        safeToMigrate: categories.safe.length,
        needsReview: categories.review.length,
        blocked: categories.blocked.length,
        scanTimeMs
      },
      categories,
      migrationPlan: {
        batches,
        estimatedEffort: estimateEffort(categories),
        riskAssessment: buildRiskAssessment(categories)
      }
    };
    
    // Format output based on requested format
    const output = formatOutput(result, input);
    
    return {
      content: [{ type: 'text', text: output }]
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error scanning migration candidates: ${errorMessage}` }],
      isError: true
    };
  }
}

/**
 * Build a risk assessment summary
 */
function buildRiskAssessment(categories: ScanMigrationResult['categories']): string {
  const total = categories.safe.length + categories.review.length + categories.blocked.length;
  const safePercent = ((categories.safe.length / total) * 100).toFixed(0);
  const reviewPercent = ((categories.review.length / total) * 100).toFixed(0);
  const blockedPercent = ((categories.blocked.length / total) * 100).toFixed(0);
  
  if (categories.blocked.length === 0) {
    return `LOW overall risk - ${safePercent}% can migrate immediately, ${reviewPercent}% need minor review`;
  }
  if (categories.blocked.length > categories.safe.length) {
    return `HIGH overall risk - ${blockedPercent}% blocked, major refactoring needed`;
  }
  return `MEDIUM overall risk - ${safePercent}% safe, ${reviewPercent}% review, ${blockedPercent}% blocked`;
}

/**
 * Format the output based on requested format
 */
function formatOutput(result: ScanMigrationResult, input: ScanMigrationInput): string {
  // Count classes with uncertain dependencies
  const allClasses = [...result.categories.safe, ...result.categories.review, ...result.categories.blocked];
  const uncertainClasses = allClasses.filter(c => c.hasUncertainDeps);
  const totalUnresolved = allClasses.reduce((sum, c) => sum + c.unresolvedCount, 0);
  
  // NEW: Count classes with internal blocked dependencies
  const internalBlockedClasses = allClasses.filter(c => c.internalBlockedCount > 0);
  const totalInternalBlocked = allClasses.reduce((sum, c) => sum + c.internalBlockedCount, 0);
  
  // NEW: Get tier statistics
  const tierCounts = new Map<number, number>();
  for (const cls of allClasses) {
    tierCounts.set(cls.migrationTier, (tierCounts.get(cls.migrationTier) || 0) + 1);
  }
  
  // JSON format - return raw structured data
  if (input.outputFormat === 'json') {
    return JSON.stringify({
      summary: result.summary,
      warnings: {
        uncertainClassCount: uncertainClasses.length,
        totalUnresolvedRefs: totalUnresolved,
        internalBlockedClassCount: internalBlockedClasses.length,
        totalInternalBlockedDeps: totalInternalBlocked,
        message: totalUnresolved > 0 || totalInternalBlocked > 0
          ? `${uncertainClasses.length} classes have unresolved refs. ${internalBlockedClasses.length} classes have internal blocked deps. Verify before migrating.`
          : null
      },
      tierStatistics: Object.fromEntries(tierCounts),
      classes: allClasses.map(c => ({
        fqn: c.fqn,
        className: c.className,
        type: c.type,
        risk: c.migrationRisk,
        score: c.migrationScore,
        migrationTier: c.migrationTier,  // NEW
        blockedCount: c.blockedCount,
        internalBlockedCount: c.internalBlockedCount,  // NEW
        unresolvedCount: c.unresolvedCount,
        hasUncertainDeps: c.hasUncertainDeps,
        blockedDeps: c.blockedDeps,
        internalBlockedDeps: c.internalBlockedDeps,  // NEW
        internalDeps: c.internalDeps,  // NEW: Show allowed internal deps
        unresolvedRefs: c.unresolvedRefs,
        suggestion: c.suggestion
      })),
      migrationPlan: result.migrationPlan,
      meta: {
        sourcePackage: input.sourcePackage,
        blockedPatterns: input.blockedPatterns,
        internalBlockedPatterns: input.internalBlockedPatterns || [],  // NEW
        allowedDependencies: input.allowedDependencies || [],  // NEW
        treatInternalAsBlocked: input.treatInternalAsBlocked || false,  // NEW
        includeSubpackages: input.includeSubpackages,
        strictMode: input.strictMode
      }
    }, null, 2);
  }
  
  const lines: string[] = [];
  
  // Header
  lines.push(`# Migration Scan: ${input.sourcePackage}`);
  lines.push('');
  lines.push(`**Blocked patterns**: ${input.blockedPatterns.join(', ')}`);
  if (input.internalBlockedPatterns && input.internalBlockedPatterns.length > 0) {
    lines.push(`**Internal blocked patterns**: ${input.internalBlockedPatterns.join(', ')}`);
  }
  if (input.allowedDependencies && input.allowedDependencies.length > 0) {
    lines.push(`**Allowed dependencies**: ${input.allowedDependencies.join(', ')}`);
  }
  if (input.treatInternalAsBlocked) {
    lines.push(`**Mode**: STRICT - all internal deps blocked unless in allowlist`);
  }
  lines.push(`**Scan time**: ${result.summary.scanTimeMs}ms`);
  lines.push(`**Strict mode**: ${input.strictMode !== false ? 'ON (deep file analysis)' : 'OFF'}`);
  lines.push('');
  
  // NEW: Warning about internal blocked dependencies
  if (totalInternalBlocked > 0) {
    lines.push('## 🔗 INTERNAL DEPENDENCY WARNING');
    lines.push('');
    lines.push(`> **${internalBlockedClasses.length} classes** have **${totalInternalBlocked} internal blocked dependencies**.`);
    lines.push('>');
    lines.push('> These classes depend on other classes within the source package that must be migrated FIRST.');
    lines.push('> Use `outputFormat: "tiered"` to see migration order by dependency tier.');
    lines.push('');
    
    // Show top internal blocked classes
    const topInternalBlocked = internalBlockedClasses.slice(0, 5);
    if (topInternalBlocked.length > 0) {
      lines.push('### Classes with Internal Blocked Dependencies');
      lines.push('');
      for (const cls of topInternalBlocked) {
        const depList = cls.internalBlockedDeps.slice(0, 3).map(d => d.target.split('.').pop()).join(', ');
        lines.push(`- \`${cls.fqn}\` → ${cls.internalBlockedCount} blocked: ${depList}`);
      }
      if (internalBlockedClasses.length > 5) {
        lines.push(`- ... and ${internalBlockedClasses.length - 5} more classes`);
      }
      lines.push('');
    }
  }
  
  // CRITICAL WARNING about uncertain dependencies
  if (totalUnresolved > 0) {
    lines.push('## ⚠️ IMPORTANT WARNING');
    lines.push('');
    lines.push(`> **${uncertainClasses.length} classes** have **${totalUnresolved} type references** that could not be definitively resolved.`);
    lines.push('>');
    lines.push('> These may be same-package types, wildcard imports, or external dependencies.');
    lines.push('> **ALWAYS verify with grep before migrating any class.**');
    lines.push('');
    
    // Show top uncertain classes
    const topUncertain = uncertainClasses.slice(0, 5);
    if (topUncertain.length > 0) {
      lines.push('### Classes with Uncertain Dependencies');
      lines.push('');
      for (const cls of topUncertain) {
        const unresolvedNames = cls.unresolvedRefs.slice(0, 3).map(r => r.typeName).join(', ');
        lines.push(`- \`${cls.fqn}\` - ${cls.unresolvedCount} unresolved: ${unresolvedNames}`);
      }
      if (uncertainClasses.length > 5) {
        lines.push(`- ... and ${uncertainClasses.length - 5} more classes`);
      }
      lines.push('');
    }
  }
  
  // Summary (always shown)
  lines.push('## 📊 Summary');
  lines.push('');
  lines.push(`| Category | Count | Percent |`);
  lines.push(`|----------|-------|---------|`);
  lines.push(`| ✅ Safe to migrate | ${result.summary.safeToMigrate} | ${((result.summary.safeToMigrate / result.summary.totalClasses) * 100).toFixed(0)}% |`);
  lines.push(`| ⚠️ Needs review | ${result.summary.needsReview} | ${((result.summary.needsReview / result.summary.totalClasses) * 100).toFixed(0)}% |`);
  lines.push(`| ❌ Blocked | ${result.summary.blocked} | ${((result.summary.blocked / result.summary.totalClasses) * 100).toFixed(0)}% |`);
  lines.push(`| **Total** | ${result.summary.totalClasses} | 100% |`);
  if (uncertainClasses.length > 0) {
    lines.push(`| ⚡ Uncertain resolution | ${uncertainClasses.length} | ${((uncertainClasses.length / result.summary.totalClasses) * 100).toFixed(0)}% |`);
  }
  if (internalBlockedClasses.length > 0) {
    lines.push(`| 🔗 Internal blocked deps | ${internalBlockedClasses.length} | ${((internalBlockedClasses.length / result.summary.totalClasses) * 100).toFixed(0)}% |`);
  }
  lines.push('');
  
  if (input.outputFormat === 'summary') {
    // Just the summary
    lines.push(`**Estimated effort**: ${result.migrationPlan.estimatedEffort}`);
    lines.push(`**Risk assessment**: ${result.migrationPlan.riskAssessment}`);
    return lines.join('\n');
  }
  
  // NEW: Tiered output format - show classes organized by migration tier
  if (input.outputFormat === 'tiered') {
    lines.push('## 🏗️ Migration Tiers (by Internal Dependency Order)');
    lines.push('');
    lines.push('Classes are grouped by their migration tier. Lower tiers have fewer internal dependencies and should be migrated first.');
    lines.push('');
    
    // Get max tier
    const maxTier = Math.max(...Array.from(tierCounts.keys()).filter(t => t >= 0));
    
    // Tier 0 first (no internal deps)
    const tier0Classes = allClasses.filter(c => c.migrationTier === 0);
    if (tier0Classes.length > 0) {
      lines.push('### 🥇 Tier 0: No Internal Dependencies (Migrate First!)');
      lines.push(`*${tier0Classes.length} classes with zero internal deps - true leaf nodes*`);
      lines.push('');
      for (const cls of tier0Classes.slice(0, 30)) {
        const blockedMarker = cls.blockedCount > 0 ? ` [${cls.blockedCount} ext blocked]` : '';
        const uncertainMarker = cls.hasUncertainDeps ? ' ⚡' : '';
        lines.push(`- \`${cls.fqn}\` - Score: ${cls.migrationScore}${blockedMarker}${uncertainMarker}`);
      }
      if (tier0Classes.length > 30) {
        lines.push(`- ... and ${tier0Classes.length - 30} more`);
      }
      lines.push('');
    }
    
    // Tier 1+
    for (let tier = 1; tier <= maxTier; tier++) {
      const tierClasses = allClasses.filter(c => c.migrationTier === tier);
      if (tierClasses.length > 0) {
        lines.push(`### 📦 Tier ${tier}: Depends on Tier 0-${tier - 1}`);
        lines.push(`*${tierClasses.length} classes - migrate after lower tiers*`);
        lines.push('');
        for (const cls of tierClasses.slice(0, 20)) {
          const internalList = cls.internalDeps.slice(0, 2).map(d => d.split('.').pop()).join(', ');
          const internalBlockedList = cls.internalBlockedDeps.slice(0, 2).map(d => d.target.split('.').pop()).join(', ');
          const depsInfo = internalBlockedList ? `🔗 ${internalBlockedList}` : (internalList ? `→ ${internalList}` : '');
          const uncertainMarker = cls.hasUncertainDeps ? ' ⚡' : '';
          lines.push(`- \`${cls.fqn}\` ${depsInfo}${uncertainMarker}`);
        }
        if (tierClasses.length > 20) {
          lines.push(`- ... and ${tierClasses.length - 20} more`);
        }
        lines.push('');
      }
    }
    
    // Circular deps (tier -1)
    const circularClasses = allClasses.filter(c => c.migrationTier === -1);
    if (circularClasses.length > 0) {
      lines.push('### ⚠️ Circular Dependencies (Migrate Together or Refactor)');
      lines.push(`*${circularClasses.length} classes with circular internal deps*`);
      lines.push('');
      for (const cls of circularClasses.slice(0, 20)) {
        const internalList = cls.internalDeps.slice(0, 3).map(d => d.split('.').pop()).join(', ');
        lines.push(`- \`${cls.fqn}\` ↔ ${internalList}`);
      }
      if (circularClasses.length > 20) {
        lines.push(`- ... and ${circularClasses.length - 20} more`);
      }
      lines.push('');
    }
    
    // Legend
    lines.push('> **Legend**: ⚡ = uncertain resolution | 🔗 = internal blocked dep | → = depends on');
    lines.push('');
    
    // Suggested workflow
    lines.push('## 💡 Tiered Migration Workflow');
    lines.push('');
    lines.push('1. **Migrate Tier 0 first** - these have NO internal deps and are safe to move');
    lines.push('2. **Update your allowedDependencies** with the classes you just migrated');
    lines.push('3. **Re-run scan** - Tier 1 classes will now show as Tier 0');
    lines.push('4. **Repeat** until all classes are migrated');
    lines.push('');
    lines.push('**Example workflow:**');
    lines.push('```javascript');
    lines.push('// First run - find Tier 0');
    lines.push(`scan_migration_candidates({ sourcePackage: "${input.sourcePackage}", blockedPatterns: [...], treatInternalAsBlocked: true })`);
    lines.push('');
    lines.push('// After migrating Tier 0, add them to allowlist');
    lines.push(`scan_migration_candidates({ ..., allowedDependencies: ["com.example.Migrated1", "com.example.Migrated2"] })`);
    lines.push('```');
    
    return lines.join('\n');
  }
  
  // Detailed categorization
  lines.push('## 📁 Categorized Classes');
  lines.push('');
  
  // Safe classes
  if (result.categories.safe.length > 0) {
    lines.push('### ✅ Safe to Migrate');
    lines.push('');
    for (const cls of result.categories.safe.slice(0, 50)) {
      const uncertainMarker = cls.hasUncertainDeps ? ' ⚡' : '';
      const tierMarker = cls.migrationTier >= 0 ? ` [Tier ${cls.migrationTier}]` : ' [⚠️ circular]';
      lines.push(`- \`${cls.fqn}\` (${cls.type}) - Score: ${cls.migrationScore}${tierMarker}${uncertainMarker}`);
    }
    if (result.categories.safe.length > 50) {
      lines.push(`- ... and ${result.categories.safe.length - 50} more`);
    }
    lines.push('');
  }
  
  // Review classes
  if (result.categories.review.length > 0) {
    lines.push('### ⚠️ Needs Review');
    lines.push('');
    for (const cls of result.categories.review.slice(0, 30)) {
      const allBlocked = [...cls.blockedDeps, ...cls.internalBlockedDeps];
      const totalBlocked = cls.blockedCount + cls.internalBlockedCount;
      const depList = allBlocked.slice(0, 3).map(d => d.target.split('.').pop()).join(', ');
      const internalMarker = cls.internalBlockedCount > 0 ? ` 🔗${cls.internalBlockedCount}` : '';
      const uncertainMarker = cls.hasUncertainDeps ? ' ⚡' : '';
      lines.push(`- \`${cls.fqn}\` - Score: ${cls.migrationScore}, ${totalBlocked} blocked: ${depList}${internalMarker}${uncertainMarker}`);
      if (cls.suggestion) {
        lines.push(`  - 💡 ${cls.suggestion}`);
      }
    }
    if (result.categories.review.length > 30) {
      lines.push(`- ... and ${result.categories.review.length - 30} more`);
    }
    lines.push('');
  }
  
  // Blocked classes (show fewer, they're less actionable)
  if (result.categories.blocked.length > 0) {
    lines.push('### ❌ Blocked');
    lines.push('');
    for (const cls of result.categories.blocked.slice(0, 20)) {
      const totalBlocked = cls.blockedCount + cls.internalBlockedCount;
      const internalInfo = cls.internalBlockedCount > 0 ? ` (${cls.internalBlockedCount} internal)` : '';
      lines.push(`- \`${cls.fqn}\` - Score: ${cls.migrationScore}, ${totalBlocked} blocked deps${internalInfo}`);
    }
    if (result.categories.blocked.length > 20) {
      lines.push(`- ... and ${result.categories.blocked.length - 20} more`);
    }
    lines.push('');
  }
  
  // Legend
  lines.push('> **Legend**: ⚡ = uncertain resolution | 🔗 = internal blocked dep | [Tier N] = migration order');
  lines.push('');
  
  if (input.outputFormat === 'detailed') {
    return lines.join('\n');
  }
  
  // Migration plan (full output)
  lines.push('## 🚀 Migration Plan');
  lines.push('');
  lines.push(`**Estimated effort**: ${result.migrationPlan.estimatedEffort}`);
  lines.push(`**Risk assessment**: ${result.migrationPlan.riskAssessment}`);
  lines.push('');
  
  if (result.migrationPlan.batches.length > 0) {
    lines.push('### Execution Order');
    lines.push('');
    
    for (const batch of result.migrationPlan.batches) {
      const riskEmoji = batch.estimatedRisk === 'LOW' ? '🟢' : 
                       batch.estimatedRisk === 'MEDIUM' ? '🟡' : '🔴';
      lines.push(`#### Batch ${batch.order} ${riskEmoji} (${batch.fileCount} files)`);
      lines.push(`**Reason**: ${batch.reason}`);
      if (batch.dependsOn.length > 0) {
        lines.push(`**Depends on**: Batch ${batch.dependsOn.join(', ')}`);
      }
      lines.push('');
      
      // Show first few classes
      const toShow = batch.classes.slice(0, 10);
      for (const fqn of toShow) {
        lines.push(`- \`${fqn}\``);
      }
      if (batch.classes.length > 10) {
        lines.push(`- ... and ${batch.classes.length - 10} more`);
      }
      lines.push('');
    }
  }
  
  // Suggested next steps
  lines.push('## 💡 Suggested Next Steps');
  lines.push('');
  
  // Always recommend verification first
  lines.push('### 🔍 Before Migrating ANY Class');
  lines.push('');
  lines.push('1. **Verify with grep**: `grep -r "ClassName" --include="*.java" .`');
  lines.push('2. **Check blocked package imports**: `grep -r "import.*blockedpattern" --include="*.java" .`');
  lines.push('3. **Test compile in isolation** before committing');
  lines.push('');
  
  // Then specific suggestions
  lines.push('### 📋 Migration Order');
  lines.push('');
  if (result.categories.safe.length > 0) {
    lines.push(`1. Start with Batch 1 (${result.migrationPlan.batches[0]?.fileCount || 0} files) - pure types with no dependencies`);
  }
  if (result.categories.review.length > 0) {
    const firstReviewClass = result.categories.review[0];
    lines.push(`2. Review \`${firstReviewClass?.fqn}\` - has only ${firstReviewClass?.blockedCount} blocked dep(s)`);
  }
  if (result.categories.blocked.length > 0) {
    lines.push(`3. Leave ${result.categories.blocked.length} blocked classes for later - major refactoring needed`);
  }
  
  // Add warning if there are uncertain deps
  if (uncertainClasses.length > 0) {
    lines.push('');
    lines.push('### ⚠️ Uncertainty Warning');
    lines.push('');
    lines.push(`${uncertainClasses.length} classes have type references that could not be definitively resolved.`);
    lines.push('These may reference blocked packages via:');
    lines.push('- **Wildcard imports**: `import com.example.blocked.*;`');
    lines.push('- **Same-package types**: Types from same package that don\'t need imports');
    lines.push('- **Fully-qualified names**: `com.example.blocked.Type` in code');
    lines.push('');
    lines.push('**Always verify with grep before migrating!**');
  }
  
  return lines.join('\n');
}
