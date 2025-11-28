import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex, SymbolStub, Reference } from '../memory-index.js';

/**
 * explore_codebase - Bulk class exploration tool for comprehensive codebase analysis
 * 
 * Efficiently processes all indexed classes in a single pass to provide:
 * - Complete class inventory with metrics
 * - Coupling analysis (dependencies and dependents)
 * - Code smell detection (God classes, unused classes, etc.)
 * - Refactoring candidates identification
 * 
 * Optimized for large codebases (16000+ classes) with target completion <30 minutes
 */

export interface ClassSummary {
  fqn: string;
  name: string;
  kind: 'class' | 'interface' | 'enum' | 'record';
  packageName: string;
  file: string;
  line: number;
  modifiers: string[];
  // Structure
  fieldCount: number;
  methodCount: number;
  constructorCount: number;
  innerClassCount: number;
  // Inheritance
  extends?: string;
  implements?: string[];
  subclassCount: number;
  inheritanceDepth: number;
  // Coupling metrics
  outboundDependencies: string[];
  inboundDependents: string[];
  dependencyCount: number;
  dependentCount: number;
  // Code smell indicators
  flags: ClassFlags;
}

export interface ClassFlags {
  isGodClass: boolean;       // >20 methods
  isDataClass: boolean;      // mostly fields, few methods
  isUnused: boolean;         // no dependents
  isLeafClass: boolean;      // no subclasses
  isHighCoupling: boolean;   // >10 dependencies
  isInterface: boolean;
  isAbstract: boolean;
  isUtility: boolean;        // only static methods
  isEntryPoint: boolean;     // has main method or Spring annotations
  hasCircularDependency: boolean;
}

export interface PackageSummary {
  name: string;
  classCount: number;
  interfaceCount: number;
  enumCount: number;
  totalMethods: number;
  totalFields: number;
  avgMethodsPerClass: number;
  godClassCount: number;
  unusedClassCount: number;
  classes: string[];
}

export interface CodebaseAnalysis {
  metadata: {
    analyzedAt: string;
    totalClasses: number;
    totalInterfaces: number;
    totalEnums: number;
    totalPackages: number;
    processingTimeMs: number;
  };
  statistics: {
    avgMethodsPerClass: number;
    avgFieldsPerClass: number;
    avgDependenciesPerClass: number;
    maxDependencies: { fqn: string; count: number };
    maxDependents: { fqn: string; count: number };
    deepestInheritance: { fqn: string; depth: number };
  };
  codeSmells: {
    godClasses: string[];
    dataClasses: string[];
    unusedClasses: string[];
    highCouplingClasses: string[];
    circularDependencies: string[][];
  };
  refactoringCandidates: {
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    fqn: string;
    reason: string;
    suggestion: string;
  }[];
  packages: PackageSummary[];
  classes: ClassSummary[];
}

export const exploreCodebaseTool: Tool = {
  name: 'explore_codebase',
  description: `Bulk analysis of all indexed classes in one call - designed for large codebases (16000+ classes).

**When to use**: 
- Initial codebase understanding before refactoring
- Finding code smells across entire project
- Generating refactoring priority list
- Getting overview before major changes

**Output includes**:
- Complete class inventory with structure metrics
- Coupling analysis (dependencies/dependents for each class)
- Code smell detection (God classes, unused classes, high coupling)
- Refactoring candidates with prioritized suggestions
- Package-level summaries

**Performance**: Optimized for efficiency - processes in batches, uses pre-computed indices.
**Timeout**: ~30 minutes for 16000+ classes

Example: explore_codebase(format: "summary")  // Quick overview
Example: explore_codebase(format: "detailed", packages: ["com.example.core"])  // Detailed for specific packages

This is more efficient than calling explore_class 16000+ times.`,
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['summary', 'detailed', 'json', 'refactoring'],
        description: 'Output format: summary (quick stats), detailed (full report), json (structured data), refactoring (prioritized issues)',
        default: 'summary'
      },
      packages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter to specific packages (optional). If empty, analyzes all packages.'
      },
      includeClasses: {
        type: 'boolean',
        description: 'Include individual class details in output (default: true for <1000 classes, false otherwise)',
        default: null
      },
      maxClasses: {
        type: 'number',
        description: 'Maximum number of classes to include in detailed output (default: 5000)',
        default: 5000
      },
      detectCircular: {
        type: 'boolean',
        description: 'Detect circular dependencies (can be slow for large codebases)',
        default: false
      },
      batchSize: {
        type: 'number',
        description: 'Processing batch size (default: 500 for optimal memory/speed balance)',
        default: 500
      }
    },
    required: []
  }
};

export async function handleExploreCodebase(
  args: any,
  memoryIndex: MemoryIndex
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const startTime = Date.now();
  const format = (args.format as string) || 'summary';
  const filterPackages = args.packages as string[] | undefined;
  const detectCircular = args.detectCircular === true;
  const maxClasses = (args.maxClasses as number) || 5000;
  const batchSize = (args.batchSize as number) || 500;

  try {
    // Step 1: Gather all class-like symbols efficiently
    const allSymbols = memoryIndex.getAllSymbols();
    const classes: SymbolStub[] = [];
    const methodsByClass = new Map<string, SymbolStub[]>();
    const fieldsByClass = new Map<string, SymbolStub[]>();
    const constructorsByClass = new Map<string, SymbolStub[]>();
    const innerClassesByClass = new Map<string, number>();

    // Single pass to categorize all symbols
    for (const [fqn, stub] of allSymbols) {
      if (stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum' || stub.kind === 'record') {
        // Filter by package if specified
        if (filterPackages && filterPackages.length > 0) {
          const matchesPackage = filterPackages.some(pkg => 
            stub.packageName === pkg || stub.packageName.startsWith(pkg + '.')
          );
          if (!matchesPackage) continue;
        }
        classes.push(stub);
      } else if (stub.kind === 'method' || stub.kind === 'field' || stub.kind === 'constructor') {
        // Associate with declaring class
        const declaringClass = stub.declaringClass || extractDeclaringClass(fqn);
        if (declaringClass) {
          if (stub.kind === 'method') {
            if (!methodsByClass.has(declaringClass)) methodsByClass.set(declaringClass, []);
            methodsByClass.get(declaringClass)!.push(stub);
          } else if (stub.kind === 'field') {
            if (!fieldsByClass.has(declaringClass)) fieldsByClass.set(declaringClass, []);
            fieldsByClass.get(declaringClass)!.push(stub);
          } else if (stub.kind === 'constructor') {
            if (!constructorsByClass.has(declaringClass)) constructorsByClass.set(declaringClass, []);
            constructorsByClass.get(declaringClass)!.push(stub);
          }
        }
      }
    }

    // Count inner classes
    for (const stub of classes) {
      const parentClass = stub.declaringClass;
      if (parentClass) {
        innerClassesByClass.set(parentClass, (innerClassesByClass.get(parentClass) || 0) + 1);
      }
    }

    if (classes.length === 0) {
      // Return empty result in requested format
      const emptyAnalysis: CodebaseAnalysis = {
        metadata: {
          analyzedAt: new Date().toISOString(),
          totalClasses: 0,
          totalInterfaces: 0,
          totalEnums: 0,
          totalPackages: 0,
          processingTimeMs: Date.now() - startTime
        },
        statistics: {
          avgMethodsPerClass: 0,
          avgFieldsPerClass: 0,
          avgDependenciesPerClass: 0,
          maxDependencies: { fqn: '', count: 0 },
          maxDependents: { fqn: '', count: 0 },
          deepestInheritance: { fqn: '', depth: 0 }
        },
        codeSmells: {
          godClasses: [],
          dataClasses: [],
          unusedClasses: [],
          highCouplingClasses: [],
          circularDependencies: []
        },
        refactoringCandidates: [],
        packages: [],
        classes: []
      };

      if (format === 'json') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(emptyAnalysis, null, 2)
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: `# Codebase Analysis

No classes found in the index.${filterPackages ? ` Filter packages: ${filterPackages.join(', ')}` : ''}

**Suggestions:**
- Run \`index_project\` first to index your Java codebase
- Check if the package filter matches existing packages
- Use \`find_symbol\` to verify symbols are indexed`
        }]
      };
    }

    // Decide whether to include class details based on count
    const includeClasses = args.includeClasses !== undefined 
      ? args.includeClasses 
      : classes.length < 1000;

    // Step 2: Build dependency maps efficiently (single pass through references)
    const outboundDeps = new Map<string, Set<string>>();
    const inboundDeps = new Map<string, Set<string>>();
    
    // Pre-populate maps for all classes
    for (const cls of classes) {
      outboundDeps.set(cls.fqn, new Set());
      inboundDeps.set(cls.fqn, new Set());
    }

    // Build class FQN set for quick lookup
    const classSet = new Set(classes.map(c => c.fqn));

    // Process in batches to avoid memory issues
    const classFqns = classes.map(c => c.fqn);
    for (let i = 0; i < classFqns.length; i += batchSize) {
      const batch = classFqns.slice(i, i + batchSize);
      
      for (const classFqn of batch) {
        // Get references FROM this class
        const refs = memoryIndex.findReferencesFromClass(classFqn);
        for (const ref of refs) {
          const targetClass = extractClassFromFqn(ref.toFqn);
          if (targetClass && targetClass !== classFqn && classSet.has(targetClass)) {
            outboundDeps.get(classFqn)!.add(targetClass);
            inboundDeps.get(targetClass)!.add(classFqn);
          }
        }

        // Also check inheritance
        const classSymbol = allSymbols.get(classFqn);
        if (classSymbol) {
          const extendsClass = classSymbol.extends || classSymbol.extendsClass;
          if (extendsClass) {
            const resolvedParent = resolveClassName(extendsClass, classSymbol.packageName, allSymbols);
            if (resolvedParent && classSet.has(resolvedParent)) {
              outboundDeps.get(classFqn)!.add(resolvedParent);
              inboundDeps.get(resolvedParent)!.add(classFqn);
            }
          }
          const implementsInterfaces = classSymbol.implements || classSymbol.implementsInterfaces;
          if (implementsInterfaces) {
            for (const iface of implementsInterfaces) {
              const resolvedIface = resolveClassName(iface, classSymbol.packageName, allSymbols);
              if (resolvedIface && classSet.has(resolvedIface)) {
                outboundDeps.get(classFqn)!.add(resolvedIface);
                inboundDeps.get(resolvedIface)!.add(classFqn);
              }
            }
          }
        }
      }
    }

    // Step 3: Build class summaries
    const classSummaries: ClassSummary[] = [];
    const packageMap = new Map<string, PackageSummary>();

    // Calculate inheritance depth for all classes (cached)
    const inheritanceDepthCache = new Map<string, number>();
    
    for (const cls of classes) {
      const methods = methodsByClass.get(cls.fqn) || [];
      const fields = fieldsByClass.get(cls.fqn) || [];
      const constructors = constructorsByClass.get(cls.fqn) || [];
      const innerClasses = innerClassesByClass.get(cls.fqn) || 0;
      
      const outDeps = outboundDeps.get(cls.fqn) || new Set();
      const inDeps = inboundDeps.get(cls.fqn) || new Set();

      // Get subclass count from reverse inheritance
      const subclasses = memoryIndex.getChildren(cls.fqn);

      // Calculate inheritance depth (with caching)
      const inheritanceDepth = calculateInheritanceDepth(cls, allSymbols, inheritanceDepthCache);

      // Detect code smells
      const flags = detectCodeSmells(cls, methods, fields, outDeps.size, inDeps.size, subclasses.length);

      const summary: ClassSummary = {
        fqn: cls.fqn,
        name: cls.name,
        kind: cls.kind as 'class' | 'interface' | 'enum' | 'record',
        packageName: cls.packageName,
        file: cls.file,
        line: cls.line,
        modifiers: cls.modifiers || [],
        fieldCount: fields.length,
        methodCount: methods.length,
        constructorCount: constructors.length,
        innerClassCount: innerClasses,
        extends: cls.extends || cls.extendsClass,
        implements: cls.implements || cls.implementsInterfaces,
        subclassCount: subclasses.length,
        inheritanceDepth,
        outboundDependencies: Array.from(outDeps),
        inboundDependents: Array.from(inDeps),
        dependencyCount: outDeps.size,
        dependentCount: inDeps.size,
        flags
      };

      classSummaries.push(summary);

      // Update package summary
      if (!packageMap.has(cls.packageName)) {
        packageMap.set(cls.packageName, {
          name: cls.packageName,
          classCount: 0,
          interfaceCount: 0,
          enumCount: 0,
          totalMethods: 0,
          totalFields: 0,
          avgMethodsPerClass: 0,
          godClassCount: 0,
          unusedClassCount: 0,
          classes: []
        });
      }
      
      const pkg = packageMap.get(cls.packageName)!;
      if (cls.kind === 'class') pkg.classCount++;
      else if (cls.kind === 'interface') pkg.interfaceCount++;
      else if (cls.kind === 'enum') pkg.enumCount++;
      pkg.totalMethods += methods.length;
      pkg.totalFields += fields.length;
      if (flags.isGodClass) pkg.godClassCount++;
      if (flags.isUnused) pkg.unusedClassCount++;
      pkg.classes.push(cls.fqn);
    }

    // Calculate package averages
    for (const [, pkg] of packageMap) {
      const totalClasses = pkg.classCount + pkg.interfaceCount + pkg.enumCount;
      pkg.avgMethodsPerClass = totalClasses > 0 ? Math.round(pkg.totalMethods / totalClasses * 10) / 10 : 0;
    }

    // Step 4: Detect circular dependencies if requested
    const circularDependencies: string[][] = [];
    if (detectCircular) {
      const visited = new Set<string>();
      const stack = new Set<string>();
      const path: string[] = [];
      
      const detectCycle = (node: string): boolean => {
        if (stack.has(node)) {
          const cycleStart = path.indexOf(node);
          if (cycleStart >= 0) {
            circularDependencies.push(path.slice(cycleStart));
          }
          return true;
        }
        if (visited.has(node)) return false;
        
        visited.add(node);
        stack.add(node);
        path.push(node);
        
        const deps = outboundDeps.get(node) || new Set();
        for (const dep of deps) {
          detectCycle(dep);
        }
        
        path.pop();
        stack.delete(node);
        return false;
      };

      for (const cls of classSummaries.slice(0, 1000)) { // Limit for performance
        if (!visited.has(cls.fqn)) {
          detectCycle(cls.fqn);
        }
      }

      // Mark classes involved in circular dependencies
      const circularClasses = new Set(circularDependencies.flat());
      for (const summary of classSummaries) {
        if (circularClasses.has(summary.fqn)) {
          summary.flags.hasCircularDependency = true;
        }
      }
    }

    // Step 5: Generate refactoring candidates
    const refactoringCandidates = generateRefactoringCandidates(classSummaries);

    // Step 6: Calculate overall statistics
    const totalMethods = classSummaries.reduce((sum, c) => sum + c.methodCount, 0);
    const totalFields = classSummaries.reduce((sum, c) => sum + c.fieldCount, 0);
    const totalDeps = classSummaries.reduce((sum, c) => sum + c.dependencyCount, 0);

    const maxDeps = classSummaries.reduce(
      (max, c) => c.dependencyCount > max.count ? { fqn: c.fqn, count: c.dependencyCount } : max,
      { fqn: '', count: 0 }
    );
    const maxDependents = classSummaries.reduce(
      (max, c) => c.dependentCount > max.count ? { fqn: c.fqn, count: c.dependentCount } : max,
      { fqn: '', count: 0 }
    );
    const deepestInheritance = classSummaries.reduce(
      (max, c) => c.inheritanceDepth > max.depth ? { fqn: c.fqn, depth: c.inheritanceDepth } : max,
      { fqn: '', depth: 0 }
    );

    const analysis: CodebaseAnalysis = {
      metadata: {
        analyzedAt: new Date().toISOString(),
        totalClasses: classSummaries.filter(c => c.kind === 'class').length,
        totalInterfaces: classSummaries.filter(c => c.kind === 'interface').length,
        totalEnums: classSummaries.filter(c => c.kind === 'enum').length,
        totalPackages: packageMap.size,
        processingTimeMs: Date.now() - startTime
      },
      statistics: {
        avgMethodsPerClass: Math.round(totalMethods / classSummaries.length * 10) / 10,
        avgFieldsPerClass: Math.round(totalFields / classSummaries.length * 10) / 10,
        avgDependenciesPerClass: Math.round(totalDeps / classSummaries.length * 10) / 10,
        maxDependencies: maxDeps,
        maxDependents: maxDependents,
        deepestInheritance: deepestInheritance
      },
      codeSmells: {
        godClasses: classSummaries.filter(c => c.flags.isGodClass).map(c => c.fqn),
        dataClasses: classSummaries.filter(c => c.flags.isDataClass).map(c => c.fqn),
        unusedClasses: classSummaries.filter(c => c.flags.isUnused).map(c => c.fqn),
        highCouplingClasses: classSummaries.filter(c => c.flags.isHighCoupling).map(c => c.fqn),
        circularDependencies: circularDependencies.slice(0, 20)
      },
      refactoringCandidates: refactoringCandidates.slice(0, 50),
      packages: Array.from(packageMap.values()).sort((a, b) => b.classCount - a.classCount),
      classes: includeClasses ? classSummaries.slice(0, maxClasses) : []
    };

    // Step 7: Format output based on requested format
    const output = formatOutput(analysis, format, includeClasses);

    return {
      content: [{
        type: 'text',
        text: output
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to analyze codebase: ${errorMessage}`
      }],
      isError: true
    };
  }
}

// Helper functions

function extractDeclaringClass(fqn: string): string | undefined {
  // For method FQN like "com.example.MyClass.myMethod(String)", extract "com.example.MyClass"
  const parenIndex = fqn.indexOf('(');
  const fqnWithoutParams = parenIndex > 0 ? fqn.substring(0, parenIndex) : fqn;
  const lastDot = fqnWithoutParams.lastIndexOf('.');
  if (lastDot > 0) {
    return fqnWithoutParams.substring(0, lastDot);
  }
  return undefined;
}

function extractClassFromFqn(fqn: string): string | undefined {
  // Similar to extractDeclaringClass but handles various reference formats
  const parenIndex = fqn.indexOf('(');
  const fqnWithoutParams = parenIndex > 0 ? fqn.substring(0, parenIndex) : fqn;
  const lastDot = fqnWithoutParams.lastIndexOf('.');
  if (lastDot > 0) {
    const potentialClass = fqnWithoutParams.substring(0, lastDot);
    // Check if it looks like a class (starts with uppercase after last dot)
    const classLastDot = potentialClass.lastIndexOf('.');
    const simpleName = classLastDot > 0 ? potentialClass.substring(classLastDot + 1) : potentialClass;
    if (simpleName.length > 0 && simpleName[0] === simpleName[0].toUpperCase()) {
      return potentialClass;
    }
    return potentialClass;
  }
  return fqn;
}

function resolveClassName(name: string, currentPackage: string, allSymbols: Map<string, SymbolStub>): string | undefined {
  // If already qualified
  if (name.includes('.')) {
    return allSymbols.has(name) ? name : undefined;
  }
  
  // Try same package first
  const samePackage = currentPackage + '.' + name;
  if (allSymbols.has(samePackage)) {
    return samePackage;
  }
  
  // Search all symbols for simple name match
  for (const [fqn, stub] of allSymbols) {
    if (stub.name === name && (stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum')) {
      return fqn;
    }
  }
  
  return undefined;
}

function calculateInheritanceDepth(
  cls: SymbolStub, 
  allSymbols: Map<string, SymbolStub>,
  cache: Map<string, number>
): number {
  if (cache.has(cls.fqn)) {
    return cache.get(cls.fqn)!;
  }

  let depth = 0;
  let currentClass = cls.extends || cls.extendsClass;
  const visited = new Set<string>();

  while (currentClass && !visited.has(currentClass)) {
    visited.add(currentClass);
    depth++;
    
    const parentSymbol = allSymbols.get(currentClass);
    if (parentSymbol) {
      currentClass = parentSymbol.extends || parentSymbol.extendsClass;
    } else {
      // Try to resolve by simple name
      for (const [fqn, stub] of allSymbols) {
        if (stub.name === currentClass || fqn.endsWith('.' + currentClass)) {
          currentClass = stub.extends || stub.extendsClass;
          break;
        }
      }
      break;
    }
  }

  cache.set(cls.fqn, depth);
  return depth;
}

function detectCodeSmells(
  cls: SymbolStub,
  methods: SymbolStub[],
  fields: SymbolStub[],
  dependencyCount: number,
  dependentCount: number,
  subclassCount: number
): ClassFlags {
  const modifiers = cls.modifiers || [];
  const isInterface = cls.kind === 'interface';
  const isAbstract = modifiers.includes('abstract');
  
  // Check for entry point markers
  const hasMain = methods.some(m => m.name === 'main' && m.modifiers?.includes('static'));
  
  // Check for utility class pattern (only static methods, private constructor)
  const isUtility = !isInterface && !isAbstract && 
    methods.length > 0 &&
    methods.every(m => m.modifiers?.includes('static')) &&
    fields.every(f => f.modifiers?.includes('static'));

  // God class: too many methods
  const isGodClass = methods.length > 20;
  
  // Data class: mostly fields, few methods (excluding getters/setters)
  const nonGetterSetterMethods = methods.filter(m => 
    !m.name.startsWith('get') && 
    !m.name.startsWith('set') && 
    !m.name.startsWith('is') &&
    m.name !== 'toString' &&
    m.name !== 'hashCode' &&
    m.name !== 'equals'
  );
  const isDataClass = fields.length > 3 && nonGetterSetterMethods.length <= 2;
  
  // High coupling: too many dependencies
  const isHighCoupling = dependencyCount > 10;
  
  // Unused: no dependents (but not if it's an entry point or interface)
  const isUnused = dependentCount === 0 && !hasMain && !isInterface && !isAbstract;
  
  // Leaf class: no subclasses
  const isLeafClass = subclassCount === 0;

  return {
    isGodClass,
    isDataClass,
    isUnused,
    isLeafClass,
    isHighCoupling,
    isInterface,
    isAbstract,
    isUtility,
    isEntryPoint: hasMain,
    hasCircularDependency: false // Set later if detected
  };
}

function generateRefactoringCandidates(classes: ClassSummary[]): CodebaseAnalysis['refactoringCandidates'] {
  const candidates: CodebaseAnalysis['refactoringCandidates'] = [];

  for (const cls of classes) {
    // HIGH priority: God classes
    if (cls.flags.isGodClass) {
      candidates.push({
        priority: 'HIGH',
        fqn: cls.fqn,
        reason: `God Class: ${cls.methodCount} methods`,
        suggestion: 'Split into smaller, focused classes using Single Responsibility Principle'
      });
    }

    // HIGH priority: Circular dependencies
    if (cls.flags.hasCircularDependency) {
      candidates.push({
        priority: 'HIGH',
        fqn: cls.fqn,
        reason: 'Involved in circular dependency',
        suggestion: 'Break cycle using dependency injection or interface extraction'
      });
    }

    // MEDIUM priority: High coupling
    if (cls.flags.isHighCoupling && !cls.flags.isGodClass) {
      candidates.push({
        priority: 'MEDIUM',
        fqn: cls.fqn,
        reason: `High coupling: ${cls.dependencyCount} dependencies`,
        suggestion: 'Consider using dependency injection or facades to reduce coupling'
      });
    }

    // MEDIUM priority: Deeply nested inheritance
    if (cls.inheritanceDepth > 4) {
      candidates.push({
        priority: 'MEDIUM',
        fqn: cls.fqn,
        reason: `Deep inheritance: ${cls.inheritanceDepth} levels`,
        suggestion: 'Consider composition over inheritance or flattening the hierarchy'
      });
    }

    // LOW priority: Unused classes
    if (cls.flags.isUnused && !cls.flags.isInterface && !cls.flags.isAbstract) {
      candidates.push({
        priority: 'LOW',
        fqn: cls.fqn,
        reason: 'No dependents found (may be unused)',
        suggestion: 'Verify if class is needed or can be removed'
      });
    }

    // LOW priority: Data classes without behavior
    if (cls.flags.isDataClass) {
      candidates.push({
        priority: 'LOW',
        fqn: cls.fqn,
        reason: 'Data class with minimal behavior',
        suggestion: 'Consider using Java records or adding meaningful behavior'
      });
    }
  }

  // Sort by priority
  const priorityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
  return candidates.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

function formatOutput(analysis: CodebaseAnalysis, format: string, includeClasses: boolean): string {
  switch (format) {
    case 'json':
      return JSON.stringify(analysis, null, 2);
    
    case 'refactoring':
      return formatRefactoringReport(analysis);
    
    case 'detailed':
      return formatDetailedReport(analysis, includeClasses);
    
    case 'summary':
    default:
      return formatSummaryReport(analysis);
  }
}

function formatSummaryReport(analysis: CodebaseAnalysis): string {
  const lines: string[] = [];
  
  lines.push('# 📊 Codebase Analysis Summary');
  lines.push('');
  lines.push(`**Analyzed**: ${analysis.metadata.analyzedAt}`);
  lines.push(`**Processing Time**: ${analysis.metadata.processingTimeMs}ms`);
  lines.push('');
  
  lines.push('## 📈 Overview');
  lines.push(`- **Total Classes**: ${analysis.metadata.totalClasses}`);
  lines.push(`- **Total Interfaces**: ${analysis.metadata.totalInterfaces}`);
  lines.push(`- **Total Enums**: ${analysis.metadata.totalEnums}`);
  lines.push(`- **Total Packages**: ${analysis.metadata.totalPackages}`);
  lines.push('');
  
  lines.push('## 📐 Metrics');
  lines.push(`- **Avg Methods/Class**: ${analysis.statistics.avgMethodsPerClass}`);
  lines.push(`- **Avg Fields/Class**: ${analysis.statistics.avgFieldsPerClass}`);
  lines.push(`- **Avg Dependencies/Class**: ${analysis.statistics.avgDependenciesPerClass}`);
  lines.push(`- **Most Dependencies**: \`${analysis.statistics.maxDependencies.fqn}\` (${analysis.statistics.maxDependencies.count})`);
  lines.push(`- **Most Dependents**: \`${analysis.statistics.maxDependents.fqn}\` (${analysis.statistics.maxDependents.count})`);
  lines.push(`- **Deepest Inheritance**: \`${analysis.statistics.deepestInheritance.fqn}\` (depth: ${analysis.statistics.deepestInheritance.depth})`);
  lines.push('');
  
  lines.push('## 🔍 Code Smells');
  lines.push(`- **God Classes**: ${analysis.codeSmells.godClasses.length}`);
  lines.push(`- **Data Classes**: ${analysis.codeSmells.dataClasses.length}`);
  lines.push(`- **Unused Classes**: ${analysis.codeSmells.unusedClasses.length}`);
  lines.push(`- **High Coupling Classes**: ${analysis.codeSmells.highCouplingClasses.length}`);
  lines.push(`- **Circular Dependencies**: ${analysis.codeSmells.circularDependencies.length}`);
  lines.push('');
  
  // Top code smells
  if (analysis.codeSmells.godClasses.length > 0) {
    lines.push('### 🔴 God Classes (Top 5)');
    analysis.codeSmells.godClasses.slice(0, 5).forEach(c => lines.push(`- \`${c}\``));
    if (analysis.codeSmells.godClasses.length > 5) {
      lines.push(`- ... and ${analysis.codeSmells.godClasses.length - 5} more`);
    }
    lines.push('');
  }
  
  if (analysis.codeSmells.highCouplingClasses.length > 0) {
    lines.push('### 🟡 High Coupling Classes (Top 5)');
    analysis.codeSmells.highCouplingClasses.slice(0, 5).forEach(c => lines.push(`- \`${c}\``));
    if (analysis.codeSmells.highCouplingClasses.length > 5) {
      lines.push(`- ... and ${analysis.codeSmells.highCouplingClasses.length - 5} more`);
    }
    lines.push('');
  }
  
  lines.push('## 📦 Top Packages');
  analysis.packages.slice(0, 10).forEach(pkg => {
    const total = pkg.classCount + pkg.interfaceCount + pkg.enumCount;
    lines.push(`- **${pkg.name}**: ${total} types (${pkg.classCount}C/${pkg.interfaceCount}I/${pkg.enumCount}E), ${pkg.avgMethodsPerClass} avg methods`);
  });
  if (analysis.packages.length > 10) {
    lines.push(`- ... and ${analysis.packages.length - 10} more packages`);
  }
  lines.push('');
  
  lines.push('## 💡 Suggested Next Steps');
  lines.push(`- Use \`explore_codebase(format: "refactoring")\` for prioritized refactoring list`);
  lines.push(`- Use \`explore_codebase(format: "detailed")\` for full class details`);
  lines.push(`- Use \`explore_class(className: "...")\` for specific class deep dive`);
  lines.push(`- Use \`analyze_impact(symbolFqn: "...")\` for change impact analysis`);
  
  return lines.join('\n');
}

function formatRefactoringReport(analysis: CodebaseAnalysis): string {
  const lines: string[] = [];
  
  lines.push('# 🔧 Refactoring Priority Report');
  lines.push('');
  lines.push(`Generated: ${analysis.metadata.analyzedAt}`);
  lines.push(`Classes Analyzed: ${analysis.metadata.totalClasses + analysis.metadata.totalInterfaces + analysis.metadata.totalEnums}`);
  lines.push('');
  
  const high = analysis.refactoringCandidates.filter(c => c.priority === 'HIGH');
  const medium = analysis.refactoringCandidates.filter(c => c.priority === 'MEDIUM');
  const low = analysis.refactoringCandidates.filter(c => c.priority === 'LOW');
  
  lines.push(`## Summary: ${high.length} HIGH, ${medium.length} MEDIUM, ${low.length} LOW priority issues`);
  lines.push('');
  
  if (high.length > 0) {
    lines.push('## 🔴 HIGH Priority');
    lines.push('');
    lines.push('Address these immediately:');
    lines.push('');
    high.forEach((c, i) => {
      lines.push(`### ${i + 1}. \`${c.fqn}\``);
      lines.push(`- **Issue**: ${c.reason}`);
      lines.push(`- **Suggestion**: ${c.suggestion}`);
      lines.push('');
    });
  }
  
  if (medium.length > 0) {
    lines.push('## 🟡 MEDIUM Priority');
    lines.push('');
    lines.push('Plan to address in the near term:');
    lines.push('');
    medium.slice(0, 20).forEach((c, i) => {
      lines.push(`### ${i + 1}. \`${c.fqn}\``);
      lines.push(`- **Issue**: ${c.reason}`);
      lines.push(`- **Suggestion**: ${c.suggestion}`);
      lines.push('');
    });
    if (medium.length > 20) {
      lines.push(`... and ${medium.length - 20} more medium priority issues`);
      lines.push('');
    }
  }
  
  if (low.length > 0) {
    lines.push('## 🟢 LOW Priority');
    lines.push('');
    lines.push('Nice-to-have improvements:');
    lines.push('');
    low.slice(0, 10).forEach((c, i) => {
      lines.push(`${i + 1}. \`${c.fqn}\` - ${c.reason}`);
    });
    if (low.length > 10) {
      lines.push(`... and ${low.length - 10} more low priority issues`);
    }
    lines.push('');
  }
  
  if (analysis.refactoringCandidates.length === 0) {
    lines.push('## ✅ No Major Issues Found');
    lines.push('');
    lines.push('The codebase looks clean! Keep up the good work.');
  }
  
  return lines.join('\n');
}

function formatDetailedReport(analysis: CodebaseAnalysis, includeClasses: boolean): string {
  const lines: string[] = [];
  
  lines.push('# 📊 Detailed Codebase Analysis');
  lines.push('');
  
  // Include summary first
  lines.push(formatSummaryReport(analysis));
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Package details
  lines.push('## 📦 Package Details');
  lines.push('');
  
  analysis.packages.forEach(pkg => {
    const total = pkg.classCount + pkg.interfaceCount + pkg.enumCount;
    lines.push(`### ${pkg.name}`);
    lines.push(`- Types: ${total} (${pkg.classCount} classes, ${pkg.interfaceCount} interfaces, ${pkg.enumCount} enums)`);
    lines.push(`- Methods: ${pkg.totalMethods} total, ${pkg.avgMethodsPerClass} avg/class`);
    lines.push(`- Fields: ${pkg.totalFields} total`);
    if (pkg.godClassCount > 0) lines.push(`- ⚠️ God Classes: ${pkg.godClassCount}`);
    if (pkg.unusedClassCount > 0) lines.push(`- ⚠️ Unused Classes: ${pkg.unusedClassCount}`);
    lines.push('');
  });
  
  // Class details if included
  if (includeClasses && analysis.classes.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 📋 Class Details');
    lines.push('');
    
    analysis.classes.forEach(cls => {
      const flags: string[] = [];
      if (cls.flags.isGodClass) flags.push('🔴 GOD CLASS');
      if (cls.flags.isHighCoupling) flags.push('🟡 HIGH COUPLING');
      if (cls.flags.isUnused) flags.push('⚪ UNUSED');
      if (cls.flags.isDataClass) flags.push('📦 DATA CLASS');
      if (cls.flags.isUtility) flags.push('🔧 UTILITY');
      if (cls.flags.hasCircularDependency) flags.push('🔄 CIRCULAR DEP');
      
      lines.push(`### ${cls.name}`);
      lines.push(`- **FQN**: \`${cls.fqn}\``);
      lines.push(`- **Type**: ${cls.kind}${cls.modifiers.length > 0 ? ` (${cls.modifiers.join(', ')})` : ''}`);
      lines.push(`- **Location**: ${cls.file}:${cls.line}`);
      lines.push(`- **Structure**: ${cls.methodCount} methods, ${cls.fieldCount} fields, ${cls.constructorCount} constructors`);
      if (cls.extends) lines.push(`- **Extends**: \`${cls.extends}\``);
      if (cls.implements && cls.implements.length > 0) {
        lines.push(`- **Implements**: ${cls.implements.map(i => `\`${i}\``).join(', ')}`);
      }
      lines.push(`- **Inheritance Depth**: ${cls.inheritanceDepth}`);
      lines.push(`- **Dependencies**: ${cls.dependencyCount} out, ${cls.dependentCount} in`);
      if (flags.length > 0) {
        lines.push(`- **Flags**: ${flags.join(' | ')}`);
      }
      lines.push('');
    });
  }
  
  return lines.join('\n');
}
