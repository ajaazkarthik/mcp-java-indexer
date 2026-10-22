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
  isTestClass: boolean;      // Test/IT class (new for filtering)
  isProbablyUsed: boolean;   // Detected via annotations/patterns (reduces false positives)
}

// Method clustering for God class refactoring suggestions
export interface MethodCluster {
  name: string;              // Suggested class name
  reason: string;            // Why these methods belong together
  methods: string[];         // Method names
  sharedFields: string[];    // Fields accessed by these methods
  confidence: 'high' | 'medium' | 'low';
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
    // Multi-module awareness
    modules?: string[];
    isMultiModule?: boolean;
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
- Generating refactoring priority list with actionable insights
- Getting overview before major changes

**Output includes**:
- Complete class inventory with structure metrics
- Coupling analysis (dependencies/dependents for each class)
- Code smell detection (God classes, unused classes, high coupling)
- Refactoring candidates with prioritized suggestions
- **NEW: Method clustering analysis** for God classes (suggests HOW to split)
- **NEW: Test class filtering** to avoid false positives
- **NEW: Smarter unused detection** (ignores Spring/EJB patterns)
- Package-level summaries

**Performance**: Optimized for efficiency - processes in batches, uses pre-computed indices.
**Timeout**: ~30 minutes for 16000+ classes

Example: explore_codebase(format: "refactoring", sortByPriority: "LOW_FIRST")  // Quick wins first!
Example: explore_codebase(format: "refactoring-priority", ignoreTests: true)  // Skip test classes
Example: explore_codebase(format: "refactoring", priority: "LOW")  // Only LOW priority issues
Example: explore_codebase(format: "method-clusters", packages: ["com.example.util"])  // Method grouping suggestions

This is more efficient than calling explore_class 16000+ times.`,
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['summary', 'detailed', 'json', 'refactoring', 'refactoring-priority', 'method-clusters'],
        description: 'Output format: summary (quick stats), detailed (full report), json (structured data), refactoring (code smell issues with sortable priority), refactoring-priority (classes grouped by inbound dependency count), method-clusters (GOD CLASS SPLITTING: shows how to group methods)',
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
      },
      maxPerTier: {
        type: 'number',
        description: 'Maximum classes to show per dependency tier (default: 100). Use 0 for unlimited.',
        default: 100
      },
      sortByPriority: {
        type: 'string',
        enum: ['LOW_FIRST', 'HIGH_FIRST'],
        description: 'Sort refactoring candidates: LOW_FIRST (recommended - quick wins first!) or HIGH_FIRST (legacy default). Use LOW_FIRST for momentum-based refactoring.',
        default: 'HIGH_FIRST'
      },
      priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'ALL'],
        description: 'Filter to show only specific priority level. Use "LOW" for quick wins, "HIGH" for major issues.',
        default: 'ALL'
      },
      ignoreTests: {
        type: 'boolean',
        description: 'Exclude test classes (*Test.java, *IT.java, *Tests.java, src/test/**). Recommended to avoid false positives.',
        default: false
      },
      includeMethodClusters: {
        type: 'boolean',
        description: 'For God classes, analyze and suggest method groupings (how to split the class)',
        default: false
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
  const maxPerTier = (args.maxPerTier as number) ?? 100;
  const sortByPriority = (args.sortByPriority as string) || 'HIGH_FIRST';
  const priorityFilter = (args.priority as string) || 'ALL';
  const ignoreTests = args.ignoreTests === true;
  const includeMethodClusters = args.includeMethodClusters === true || format === 'method-clusters';

  try {
    // Step 1: Gather all class-like symbols efficiently
    const allSymbols = memoryIndex.getAllSymbols();
    const classes: SymbolStub[] = [];
    const methodsByClass = new Map<string, SymbolStub[]>();
    const fieldsByClass = new Map<string, SymbolStub[]>();
    const constructorsByClass = new Map<string, SymbolStub[]>();
    const innerClassesByClass = new Map<string, number>();

    // Single pass to categorize all symbols, cooperatively yielding to MCP.
    let symbolRows = 0;
    for (const [fqn, stub] of allSymbols) {
      if (++symbolRows % 512 === 0) {
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      if (stub.kind === 'class' || stub.kind === 'interface' || stub.kind === 'enum' || stub.kind === 'record') {
        // Filter by package if specified
        if (filterPackages && filterPackages.length > 0) {
          const matchesPackage = filterPackages.some(pkg => 
            stub.packageName === pkg || stub.packageName.startsWith(pkg + '.')
          );
          if (!matchesPackage) continue;
        }
        
        // Filter test classes if ignoreTests is true
        if (ignoreTests && isTestClass(stub)) {
          continue;
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

    // Step 5b: Detect Maven modules (for multi-module project awareness)
    const moduleInfo = detectMavenModules(classSummaries);

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
        processingTimeMs: Date.now() - startTime,
        modules: moduleInfo.modules,
        isMultiModule: moduleInfo.isMultiModule
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
    const formatOptions: FormatOptions = {
      sortByPriority,
      priorityFilter,
      includeMethodClusters,
      methodsByClass,
      fieldsByClass,
      memoryIndex
    };
    
    const output = formatOutput(analysis, format, includeClasses, maxPerTier, formatOptions);

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

/**
 * Detect Maven modules from file paths.
 * Returns module names if multi-module project is detected.
 */
function detectMavenModules(classes: ClassSummary[]): { modules: string[]; isMultiModule: boolean } {
  const modulePatterns = new Set<string>();
  
  for (const cls of classes) {
    const file = cls.file.replace(/\\/g, '/');
    // Look for patterns like /module-name/src/main/java/
    const match = file.match(/\/([^\/]+)\/src\/main\/java\//);
    if (match) {
      modulePatterns.add(match[1]);
    }
    // Also check for /module-name/src/ pattern
    const match2 = file.match(/\/([^\/]+)\/src\/[^\/]+\//);
    if (match2 && !match2[1].startsWith('src')) {
      modulePatterns.add(match2[1]);
    }
  }
  
  return {
    modules: Array.from(modulePatterns).sort(),
    isMultiModule: modulePatterns.size > 1
  };
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

/**
 * Check if a class is a test class based on naming and file path conventions
 */
function isTestClass(cls: SymbolStub): boolean {
  const name = cls.name;
  const file = cls.file.toLowerCase().replace(/\\/g, '/');
  
  // Check name patterns
  if (name.endsWith('Test') || name.endsWith('IT') || name.endsWith('Tests') ||
      name.endsWith('Spec') || name.endsWith('TestCase') || name.startsWith('Test')) {
    return true;
  }
  
  // Check file path patterns
  if (file.includes('/src/test/') || file.includes('/test/') || 
      file.includes('/tests/') || file.includes('_test/')) {
    return true;
  }
  
  return false;
}

/**
 * Check if a class is probably used even without detected dependents
 * This reduces false positives for unused detection
 */
function isProbablyUsedClass(cls: SymbolStub, methods: SymbolStub[]): boolean {
  const modifiers = cls.modifiers || [];
  const name = cls.name;
  
  // Check for Spring/JEE annotations patterns (common false positives)
  // These are often instantiated via reflection/DI
  const springPatterns = [
    'Controller', 'Service', 'Repository', 'Component', 'Bean', 
    'Configuration', 'Aspect', 'Endpoint', 'Resource', 'Entity',
    'Mapper', 'Converter', 'Serializer', 'Deserializer', 'Handler',
    'Listener', 'Processor', 'Factory', 'Provider', 'Adapter',
    'Validator', 'Formatter', 'Filter', 'Interceptor'
  ];
  
  for (const pattern of springPatterns) {
    if (name.endsWith(pattern) || name.includes(pattern)) {
      return true;
    }
  }
  
  // Impl classes are usually wired via interfaces
  if (name.endsWith('Impl') || name.endsWith('Implementation')) {
    return true;
  }
  
  // Public classes in API/model packages are often used externally
  if (modifiers.includes('public')) {
    const pkg = cls.packageName.toLowerCase();
    if (pkg.includes('.api.') || pkg.includes('.model') || pkg.includes('.dto') ||
        pkg.includes('.entity') || pkg.includes('.domain')) {
      return true;
    }
  }
  
  // Classes with @Override methods are likely implementations
  const hasOverride = methods.some(m => m.modifiers?.includes('override'));
  if (hasOverride) {
    return true;
  }
  
  // EJB patterns
  const ejbPatterns = ['SessionBean', 'EJB', 'MDB', 'MessageDriven'];
  for (const pattern of ejbPatterns) {
    if (name.includes(pattern)) {
      return true;
    }
  }
  
  return false;
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
  const testClass = isTestClass(cls);
  const probablyUsed = isProbablyUsedClass(cls, methods);
  
  // Check for entry point markers
  const hasMain = methods.some(m => m.name === 'main' && m.modifiers?.includes('static'));
  
  // Check for utility class pattern (only static methods, private constructor)
  const isUtility = !isInterface && !isAbstract && 
    methods.length > 0 &&
    methods.every(m => m.modifiers?.includes('static')) &&
    fields.every(f => f.modifiers?.includes('static'));

  // God class: too many methods (BUT not test classes - they SHOULD have many methods)
  const isGodClass = methods.length > 20 && !testClass;
  
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
  
  // Unused: no dependents (but not if it's an entry point, interface, or probably used via DI/reflection)
  const isUnused = dependentCount === 0 && !hasMain && !isInterface && !isAbstract && !probablyUsed && !testClass;
  
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
    hasCircularDependency: false, // Set later if detected
    isTestClass: testClass,
    isProbablyUsed: probablyUsed
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

  // Sort by priority (default HIGH first)
  const priorityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
  return candidates.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Sort candidates based on sortByPriority option
 */
function sortCandidates(
  candidates: CodebaseAnalysis['refactoringCandidates'],
  sortByPriority: string
): CodebaseAnalysis['refactoringCandidates'] {
  const priorityOrder = sortByPriority === 'LOW_FIRST' 
    ? { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2 }
    : { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
  
  return candidates.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Filter candidates by priority
 */
function filterCandidatesByPriority(
  candidates: CodebaseAnalysis['refactoringCandidates'],
  priorityFilter: string
): CodebaseAnalysis['refactoringCandidates'] {
  if (priorityFilter === 'ALL') {
    return candidates;
  }
  return candidates.filter(c => c.priority === priorityFilter);
}

interface FormatOptions {
  sortByPriority: string;
  priorityFilter: string;
  includeMethodClusters: boolean;
  methodsByClass: Map<string, SymbolStub[]>;
  fieldsByClass: Map<string, SymbolStub[]>;
  memoryIndex: MemoryIndex;
}

function formatOutput(
  analysis: CodebaseAnalysis, 
  format: string, 
  includeClasses: boolean, 
  maxPerTier: number = 100,
  options?: FormatOptions
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(analysis, null, 2);
    
    case 'refactoring':
      return formatRefactoringReport(analysis, options);
    
    case 'refactoring-priority':
      return formatRefactoringPriorityReport(analysis, maxPerTier);
    
    case 'method-clusters':
      return formatMethodClustersReport(analysis, options);
    
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
  
  // Multi-module warning
  if (analysis.metadata.isMultiModule && analysis.metadata.modules && analysis.metadata.modules.length > 1) {
    lines.push('## ⚠️ Multi-Module Project Detected');
    lines.push('');
    lines.push(`Found ${analysis.metadata.modules.length} modules: ${analysis.metadata.modules.slice(0, 5).map(m => `\`${m}\``).join(', ')}${analysis.metadata.modules.length > 5 ? ' ...' : ''}`);
    lines.push('');
    lines.push('> **Important**: Dependency counts only include classes IN THIS INDEX.');
    lines.push('> - Classes depending on other modules may show fewer dependencies than actual');
    lines.push('> - "Unused" classes may be used by modules not indexed');
    lines.push('> - For accurate cross-module analysis, index the entire parent project');
    lines.push('> - Or use `grep` to verify dependencies before moving/deleting classes');
    lines.push('');
  }
  
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

function formatRefactoringReport(analysis: CodebaseAnalysis, options?: FormatOptions): string {
  const lines: string[] = [];
  const sortByPriority = options?.sortByPriority || 'HIGH_FIRST';
  const priorityFilter = options?.priorityFilter || 'ALL';
  
  // Apply sorting and filtering
  let candidates = [...analysis.refactoringCandidates];
  candidates = filterCandidatesByPriority(candidates, priorityFilter);
  candidates = sortCandidates(candidates, sortByPriority);
  
  lines.push('# 🔧 Refactoring Priority Report');
  lines.push('');
  lines.push(`Generated: ${analysis.metadata.analyzedAt}`);
  lines.push(`Classes Analyzed: ${analysis.metadata.totalClasses + analysis.metadata.totalInterfaces + analysis.metadata.totalEnums}`);
  
  if (priorityFilter !== 'ALL') {
    lines.push(`**Filter**: Showing only ${priorityFilter} priority issues`);
  }
  if (sortByPriority === 'LOW_FIRST') {
    lines.push(`**Sort**: LOW priority first (quick wins strategy! 🚀)`);
  }
  lines.push('');
  
  const high = candidates.filter(c => c.priority === 'HIGH');
  const medium = candidates.filter(c => c.priority === 'MEDIUM');
  const low = candidates.filter(c => c.priority === 'LOW');
  
  lines.push(`## Summary: ${high.length} HIGH, ${medium.length} MEDIUM, ${low.length} LOW priority issues`);
  lines.push('');
  
  // Show in order based on sortByPriority
  if (sortByPriority === 'LOW_FIRST') {
    // LOW FIRST - Quick wins strategy
    if (low.length > 0) {
      lines.push('## 🚀 LOW Priority - QUICK WINS (Start Here!)');
      lines.push('');
      lines.push('> **Strategy**: These are easy, low-risk changes. Complete them first to build momentum!');
      lines.push('');
      low.forEach((c, i) => {
        lines.push(`### ${i + 1}. \`${c.fqn}\``);
        lines.push(`- **Issue**: ${c.reason}`);
        lines.push(`- **Suggestion**: ${c.suggestion}`);
        lines.push(`- **Risk**: ✅ Minimal - isolated change`);
        lines.push('');
      });
    }
    
    if (medium.length > 0) {
      lines.push('## 🟡 MEDIUM Priority - Next Wave');
      lines.push('');
      lines.push('> After completing LOW priority items, tackle these:');
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
    
    if (high.length > 0) {
      lines.push('## 🔴 HIGH Priority - Tackle Last');
      lines.push('');
      lines.push('> These require more planning. Address after cleaning up LOW/MEDIUM:');
      lines.push('');
      high.forEach((c, i) => {
        lines.push(`### ${i + 1}. \`${c.fqn}\``);
        lines.push(`- **Issue**: ${c.reason}`);
        lines.push(`- **Suggestion**: ${c.suggestion}`);
        lines.push(`- **Risk**: ⚠️ High - may affect many callers`);
        lines.push('');
      });
    }
  } else {
    // HIGH FIRST - Traditional approach
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
  }
  
  if (candidates.length === 0) {
    lines.push('## ✅ No Issues Found');
    lines.push('');
    if (priorityFilter !== 'ALL') {
      lines.push(`No ${priorityFilter} priority issues found. Try a different filter.`);
    } else {
      lines.push('The codebase looks clean! Keep up the good work.');
    }
  }
  
  // Add tips for LOW_FIRST strategy
  if (sortByPriority === 'LOW_FIRST' && low.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 💡 Quick Wins Strategy Tips');
    lines.push('');
    lines.push('1. **Batch similar changes** - Group related LOW priority fixes');
    lines.push('2. **Test after each batch** - Keep changes small and verifiable');
    lines.push('3. **Track progress** - Each completed item builds momentum');
    lines.push('4. **Move to MEDIUM only after LOW is clean**');
    lines.push('5. **God classes become MUCH easier** once surrounding code is clean');
  }
  
  return lines.join('\n');
}

/**
 * Format output for refactoring-priority: Group classes by inbound dependency count
 * 
 * Classes with 0 inbound dependencies are safest to refactor/delete (no ripple effects)
 * Classes with 1-2 inbound dependencies are low risk
 * God classes and circular dependencies go last (high risk)
 */
function formatRefactoringPriorityReport(analysis: CodebaseAnalysis, maxPerTier: number): string {
  const lines: string[] = [];
  
  lines.push('# 🎯 Refactoring Priority by Dependency Count');
  lines.push('');
  lines.push('> **Strategy**: Start with classes that have ZERO inbound dependencies (nobody uses them).');
  lines.push('> These are safe to refactor, delete, or modify with NO ripple effects.');
  lines.push('> Work your way up through the tiers. Leave God classes and hub classes for last.');
  lines.push('');
  lines.push(`**Analyzed**: ${analysis.metadata.analyzedAt}`);
  lines.push(`**Total Classes**: ${analysis.metadata.totalClasses + analysis.metadata.totalInterfaces + analysis.metadata.totalEnums}`);
  lines.push(`**Processing Time**: ${analysis.metadata.processingTimeMs}ms`);
  lines.push('');
  
  // Group classes by inbound dependency count (dependentCount)
  const tierGroups = new Map<number, ClassSummary[]>();
  const complexClasses: ClassSummary[] = []; // God classes, circular deps, hub classes
  
  for (const cls of analysis.classes) {
    // Complex classes go to a special tier at the end
    const isComplex = cls.flags.isGodClass || 
                      cls.flags.hasCircularDependency || 
                      cls.dependentCount > 20; // Hub class threshold
    
    if (isComplex) {
      complexClasses.push(cls);
    } else {
      const tier = cls.dependentCount; // Use inbound dependency count
      if (!tierGroups.has(tier)) {
        tierGroups.set(tier, []);
      }
      tierGroups.get(tier)!.push(cls);
    }
  }
  
  // Sort tiers by dependency count (0, 1, 2, ...)
  const sortedTiers = Array.from(tierGroups.keys()).sort((a, b) => a - b);
  
  // Calculate summary stats
  const tierStats: { tier: number; count: number }[] = [];
  let totalQuickWins = 0;
  
  for (const tier of sortedTiers) {
    const count = tierGroups.get(tier)!.length;
    tierStats.push({ tier, count });
    if (tier <= 2) totalQuickWins += count;
  }
  
  // Summary box
  lines.push('## 📊 Quick Summary');
  lines.push('');
  lines.push('| Tier | Dependency Count | Classes | Risk Level |');
  lines.push('|------|------------------|---------|------------|');
  
  for (const { tier, count } of tierStats.slice(0, 10)) {
    const risk = tier === 0 ? '✅ Zero Risk' : 
                 tier === 1 ? '🟢 Low Risk' : 
                 tier === 2 ? '🟢 Low Risk' : 
                 tier <= 5 ? '🟡 Moderate' : 
                 tier <= 10 ? '🟠 Higher' : '🔴 High';
    lines.push(`| ${tier} | ${tier === 0 ? 'Nobody uses this' : `${tier} class${tier === 1 ? '' : 'es'} depend on this`} | ${count} | ${risk} |`);
  }
  
  if (sortedTiers.length > 10) {
    const remaining = sortedTiers.slice(10).reduce((sum, t) => sum + tierGroups.get(t)!.length, 0);
    lines.push(`| 11+ | Many dependents | ${remaining} | 🔴 High |`);
  }
  
  if (complexClasses.length > 0) {
    lines.push(`| ⚠️ | God/Hub/Circular | ${complexClasses.length} | 🔴 Tackle Last |`);
  }
  
  lines.push('');
  lines.push(`**🎯 Quick Wins (Tier 0-2)**: ${totalQuickWins} classes can be refactored with minimal risk`);
  lines.push('');
  
  // Tier 0: Zero dependencies - GOLD
  lines.push('---');
  lines.push('');
  lines.push('## 🏆 TIER 0: Zero Inbound Dependencies');
  lines.push('');
  lines.push('> **These classes have NO dependents** - they can be freely modified, refactored, or deleted');
  lines.push('> without breaking any other code. Perfect starting point for cleanup!');
  lines.push('');
  
  const tier0 = tierGroups.get(0) || [];
  if (tier0.length === 0) {
    lines.push('*No classes found with zero inbound dependencies.*');
  } else {
    // Categorize tier 0 classes
    const deadCode = tier0.filter(c => c.dependencyCount === 0); // No in or out deps
    const leafClasses = tier0.filter(c => c.dependencyCount > 0); // Has outbound but no inbound
    
    if (deadCode.length > 0) {
      lines.push(`### 🗑️ Dead Code Candidates (${deadCode.length})`);
      lines.push('');
      lines.push('These have **no inbound AND no outbound** dependencies - likely unused:');
      lines.push('');
      const displayCount = maxPerTier === 0 ? deadCode.length : Math.min(maxPerTier, deadCode.length);
      deadCode.slice(0, displayCount).forEach(cls => {
        const kindIcon = cls.kind === 'interface' ? '📐' : cls.kind === 'enum' ? '📋' : '📦';
        lines.push(`- ${kindIcon} \`${cls.fqn}\``);
        lines.push(`  - 📍 ${cls.file}:${cls.line}`);
        lines.push(`  - 📊 ${cls.methodCount} methods, ${cls.fieldCount} fields`);
      });
      if (deadCode.length > displayCount) {
        lines.push(`- ... and ${deadCode.length - displayCount} more dead code candidates`);
      }
      lines.push('');
    }
    
    if (leafClasses.length > 0) {
      lines.push(`### 🍃 Leaf Classes (${leafClasses.length})`);
      lines.push('');
      lines.push('These USE other classes but nobody uses them - safe to refactor:');
      lines.push('');
      const displayCount = maxPerTier === 0 ? leafClasses.length : Math.min(maxPerTier, leafClasses.length);
      leafClasses.slice(0, displayCount).forEach(cls => {
        const kindIcon = cls.kind === 'interface' ? '📐' : cls.kind === 'enum' ? '📋' : '📦';
        lines.push(`- ${kindIcon} \`${cls.fqn}\``);
        lines.push(`  - Uses: ${cls.dependencyCount} classes`);
        if (cls.outboundDependencies.length > 0 && cls.outboundDependencies.length <= 5) {
          lines.push(`  - Dependencies: ${cls.outboundDependencies.map(d => getSimpleName(d)).join(', ')}`);
        }
      });
      if (leafClasses.length > displayCount) {
        lines.push(`- ... and ${leafClasses.length - displayCount} more leaf classes`);
      }
      lines.push('');
    }
  }
  
  // Tier 1: One dependency
  lines.push('---');
  lines.push('');
  lines.push('## 🟢 TIER 1: One Inbound Dependency');
  lines.push('');
  lines.push('> Only **one** other class depends on these. Low risk - just update that one caller.');
  lines.push('');
  
  const tier1 = tierGroups.get(1) || [];
  if (tier1.length === 0) {
    lines.push('*No classes found with exactly one dependent.*');
  } else {
    const displayCount = maxPerTier === 0 ? tier1.length : Math.min(maxPerTier, tier1.length);
    lines.push(`| Class | Used By | Methods | Fields |`);
    lines.push(`|-------|---------|---------|--------|`);
    tier1.slice(0, displayCount).forEach(cls => {
      const usedBy = cls.inboundDependents[0] ? getSimpleName(cls.inboundDependents[0]) : '-';
      lines.push(`| \`${cls.name}\` | ${usedBy} | ${cls.methodCount} | ${cls.fieldCount} |`);
    });
    if (tier1.length > displayCount) {
      lines.push(`| ... | ${tier1.length - displayCount} more | - | - |`);
    }
  }
  lines.push('');
  
  // Tier 2: Two dependencies
  lines.push('---');
  lines.push('');
  lines.push('## 🟢 TIER 2: Two Inbound Dependencies');
  lines.push('');
  lines.push('> Two classes depend on these. Still manageable - update both callers.');
  lines.push('');
  
  const tier2 = tierGroups.get(2) || [];
  if (tier2.length === 0) {
    lines.push('*No classes found with exactly two dependents.*');
  } else {
    const displayCount = maxPerTier === 0 ? tier2.length : Math.min(maxPerTier, tier2.length);
    lines.push(`| Class | Used By | Methods |`);
    lines.push(`|-------|---------|---------|`);
    tier2.slice(0, displayCount).forEach(cls => {
      const usedBy = cls.inboundDependents.slice(0, 2).map(d => getSimpleName(d)).join(', ');
      lines.push(`| \`${cls.name}\` | ${usedBy} | ${cls.methodCount} |`);
    });
    if (tier2.length > displayCount) {
      lines.push(`| ... | ${tier2.length - displayCount} more | - |`);
    }
  }
  lines.push('');
  
  // Tiers 3-5: Moderate
  const tier3to5 = [3, 4, 5].flatMap(t => tierGroups.get(t) || []);
  if (tier3to5.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 🟡 TIER 3-5: Moderate Dependencies');
    lines.push('');
    lines.push(`> ${tier3to5.length} classes with 3-5 dependents. Requires more coordination.`);
    lines.push('');
    const displayCount = maxPerTier === 0 ? tier3to5.length : Math.min(maxPerTier, tier3to5.length);
    tier3to5.slice(0, displayCount).forEach(cls => {
      lines.push(`- \`${cls.name}\` (${cls.dependentCount} dependents)`);
    });
    if (tier3to5.length > displayCount) {
      lines.push(`- ... and ${tier3to5.length - displayCount} more`);
    }
    lines.push('');
  }
  
  // Tiers 6-10: Higher risk
  const tier6to10 = [6, 7, 8, 9, 10].flatMap(t => tierGroups.get(t) || []);
  if (tier6to10.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 🟠 TIER 6-10: Higher Risk');
    lines.push('');
    lines.push(`> ${tier6to10.length} classes with 6-10 dependents. Changes affect multiple areas.`);
    lines.push('');
    const displayCount = maxPerTier === 0 ? tier6to10.length : Math.min(maxPerTier / 2, tier6to10.length);
    tier6to10.slice(0, displayCount).forEach(cls => {
      lines.push(`- \`${cls.name}\` (${cls.dependentCount} dependents)`);
    });
    if (tier6to10.length > displayCount) {
      lines.push(`- ... and ${tier6to10.length - displayCount} more`);
    }
    lines.push('');
  }
  
  // Tiers 11+: High risk
  const tier11plus = sortedTiers.filter(t => t > 10).flatMap(t => tierGroups.get(t) || []);
  if (tier11plus.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 🔴 TIER 11+: High Risk');
    lines.push('');
    lines.push(`> ${tier11plus.length} classes with 11+ dependents. Careful planning required.`);
    lines.push('');
    // Sort by dependent count descending
    tier11plus.sort((a, b) => b.dependentCount - a.dependentCount);
    const displayCount = maxPerTier === 0 ? tier11plus.length : Math.min(20, tier11plus.length);
    tier11plus.slice(0, displayCount).forEach(cls => {
      lines.push(`- \`${cls.name}\` - **${cls.dependentCount} dependents**`);
    });
    if (tier11plus.length > displayCount) {
      lines.push(`- ... and ${tier11plus.length - displayCount} more high-risk classes`);
    }
    lines.push('');
  }
  
  // Complex classes: tackle last
  if (complexClasses.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## ⚠️ TACKLE LAST: Complex Classes');
    lines.push('');
    lines.push('> These require extra care: God classes, hub classes, and circular dependencies.');
    lines.push('');
    
    const godClasses = complexClasses.filter(c => c.flags.isGodClass);
    const hubClasses = complexClasses.filter(c => c.dependentCount > 20 && !c.flags.isGodClass);
    const circularClasses = complexClasses.filter(c => c.flags.hasCircularDependency && !c.flags.isGodClass && c.dependentCount <= 20);
    
    if (godClasses.length > 0) {
      lines.push(`### 🐘 God Classes (${godClasses.length})`);
      lines.push('');
      lines.push('Classes with >20 methods - consider breaking into smaller classes:');
      lines.push('');
      godClasses.forEach(cls => {
        lines.push(`- \`${cls.fqn}\``);
        lines.push(`  - ${cls.methodCount} methods, ${cls.fieldCount} fields`);
        lines.push(`  - ${cls.dependentCount} dependents, ${cls.dependencyCount} dependencies`);
      });
      lines.push('');
    }
    
    if (hubClasses.length > 0) {
      lines.push(`### 🌐 Hub Classes (${hubClasses.length})`);
      lines.push('');
      lines.push('Core classes used by 20+ other classes - changes here affect everything:');
      lines.push('');
      hubClasses.sort((a, b) => b.dependentCount - a.dependentCount);
      hubClasses.forEach(cls => {
        lines.push(`- \`${cls.name}\` - **${cls.dependentCount} classes depend on this**`);
      });
      lines.push('');
    }
    
    if (circularClasses.length > 0) {
      lines.push(`### 🔄 Circular Dependencies (${circularClasses.length})`);
      lines.push('');
      lines.push('Break these cycles before refactoring:');
      lines.push('');
      circularClasses.forEach(cls => {
        lines.push(`- \`${cls.name}\``);
      });
      lines.push('');
    }
  }
  
  // Action plan
  lines.push('---');
  lines.push('');
  lines.push('## 📋 Recommended Action Plan');
  lines.push('');
  lines.push('1. **Week 1**: Review and clean up Tier 0 (dead code, leaf classes)');
  lines.push('2. **Week 2-3**: Refactor Tier 1-2 classes (low risk, quick wins)');
  lines.push('3. **Week 4+**: Tackle Tier 3-5 with proper testing');
  lines.push('4. **Long-term**: Plan major refactoring for God classes and hub classes');
  lines.push('');
  lines.push('Use `explore_class(className: "...")` for detailed analysis of specific classes.');
  lines.push('Use `analyze_impact(symbolFqn: "...")` before making changes to high-tier classes.');
  
  return lines.join('\n');
}

/**
 * Get simple class name from FQN
 */
function getSimpleName(fqn: string): string {
  const lastDot = fqn.lastIndexOf('.');
  return lastDot > 0 ? fqn.substring(lastDot + 1) : fqn;
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
      if (cls.flags.isTestClass) flags.push('🧪 TEST');
      
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

/**
 * Analyze methods in a God class and suggest logical groupings
 * Uses multiple heuristics:
 * 1. Method name prefix patterns (e.g., all "validate*" methods)
 * 2. Shared field access (methods that use same fields)
 * 3. Call relationships (methods that call each other)
 */
function analyzeMethodClusters(
  classFqn: string,
  methods: SymbolStub[],
  fields: SymbolStub[],
  memoryIndex: MemoryIndex
): MethodCluster[] {
  const clusters: MethodCluster[] = [];
  const methodNames = methods.map(m => m.name);
  
  if (methods.length < 5) {
    return clusters; // Not worth clustering for small classes
  }
  
  // 1. Group by method name prefix
  const prefixGroups = new Map<string, string[]>();
  const commonPrefixes = ['get', 'set', 'is', 'has', 'create', 'build', 'parse', 'validate', 
                          'process', 'handle', 'load', 'save', 'update', 'delete', 'find',
                          'calculate', 'compute', 'convert', 'format', 'init', 'register',
                          'check', 'verify', 'transform', 'extract', 'generate', 'export', 'import'];
  
  for (const method of methods) {
    for (const prefix of commonPrefixes) {
      if (method.name.startsWith(prefix) && method.name.length > prefix.length) {
        if (!prefixGroups.has(prefix)) {
          prefixGroups.set(prefix, []);
        }
        prefixGroups.get(prefix)!.push(method.name);
        break;
      }
    }
  }
  
  // Convert prefix groups to clusters (minimum 3 methods to form a cluster)
  for (const [prefix, groupMethods] of prefixGroups) {
    if (groupMethods.length >= 3) {
      const suggestedName = generateSuggestedClassName(prefix, classFqn);
      clusters.push({
        name: suggestedName,
        reason: `${groupMethods.length} methods share "${prefix}*" naming pattern`,
        methods: groupMethods,
        sharedFields: [], // Will be filled later
        confidence: groupMethods.length >= 5 ? 'high' : 'medium'
      });
    }
  }
  
  // 2. Group by domain concept (based on method name keywords)
  const domainKeywords: { [key: string]: string[] } = {
    'DateUtils': ['date', 'time', 'calendar', 'timestamp', 'day', 'month', 'year'],
    'StringUtils': ['string', 'text', 'format', 'parse', 'trim', 'concat', 'split'],
    'FileUtils': ['file', 'path', 'directory', 'read', 'write', 'stream', 'io'],
    'ValidationUtils': ['valid', 'check', 'verify', 'assert', 'ensure', 'require'],
    'ConversionUtils': ['convert', 'transform', 'map', 'to', 'from', 'cast'],
    'CalculationUtils': ['calc', 'compute', 'sum', 'avg', 'total', 'count', 'math'],
    'DatabaseUtils': ['db', 'sql', 'query', 'persist', 'entity', 'transaction']
  };
  
  for (const [utilName, keywords] of Object.entries(domainKeywords)) {
    const matchingMethods = methods.filter(m => {
      const nameLower = m.name.toLowerCase();
      return keywords.some(kw => nameLower.includes(kw));
    }).map(m => m.name);
    
    if (matchingMethods.length >= 3) {
      // Check if not already covered by prefix groups
      const alreadyClustered = clusters.some(c => 
        c.methods.some(cm => matchingMethods.includes(cm))
      );
      
      if (!alreadyClustered) {
        clusters.push({
          name: utilName,
          reason: `Methods related to ${utilName.replace('Utils', '').toLowerCase()} operations`,
          methods: matchingMethods,
          sharedFields: [],
          confidence: 'medium'
        });
      }
    }
  }
  
  // 3. Identify getters/setters that could become a Data class
  const getterSetterPairs = new Map<string, { get: boolean; set: boolean; methods: string[] }>();
  for (const method of methods) {
    let fieldName = '';
    if (method.name.startsWith('get') && method.name.length > 3) {
      fieldName = method.name.substring(3);
    } else if (method.name.startsWith('set') && method.name.length > 3) {
      fieldName = method.name.substring(3);
    } else if (method.name.startsWith('is') && method.name.length > 2) {
      fieldName = method.name.substring(2);
    }
    
    if (fieldName) {
      if (!getterSetterPairs.has(fieldName)) {
        getterSetterPairs.set(fieldName, { get: false, set: false, methods: [] });
      }
      const pair = getterSetterPairs.get(fieldName)!;
      if (method.name.startsWith('get') || method.name.startsWith('is')) {
        pair.get = true;
      } else {
        pair.set = true;
      }
      pair.methods.push(method.name);
    }
  }
  
  const dataClassMethods: string[] = [];
  for (const [, pair] of getterSetterPairs) {
    if (pair.get || pair.set) {
      // FIX: Use iterative push instead of spread (safety for large method lists)
      for (const method of pair.methods) {
        dataClassMethods.push(method);
      }
    }
  }
  
  if (dataClassMethods.length >= 6) {
    // Check if not already a separate cluster
    const notClustered = dataClassMethods.filter(m => 
      !clusters.some(c => c.methods.includes(m))
    );
    
    if (notClustered.length >= 4) {
      clusters.push({
        name: getSimpleName(classFqn) + 'Data',
        reason: `${notClustered.length} getter/setter methods could be extracted to a data class`,
        methods: notClustered.slice(0, 20),
        sharedFields: fields.map(f => f.name).slice(0, 10),
        confidence: 'high'
      });
    }
  }
  
  // 4. Remaining unclustered methods
  const clusteredMethods = new Set(clusters.flatMap(c => c.methods));
  const unclustered = methods.filter(m => !clusteredMethods.has(m.name)).map(m => m.name);
  
  if (unclustered.length >= 3 && unclustered.length <= 10) {
    clusters.push({
      name: getSimpleName(classFqn) + 'Core',
      reason: `${unclustered.length} core business methods (not fitting other patterns)`,
      methods: unclustered,
      sharedFields: [],
      confidence: 'low'
    });
  }
  
  return clusters;
}

function generateSuggestedClassName(prefix: string, originalFqn: string): string {
  const originalName = getSimpleName(originalFqn);
  
  // Remove common suffixes from original name
  let baseName = originalName
    .replace(/Utility$/i, '')
    .replace(/Utils$/i, '')
    .replace(/Helper$/i, '')
    .replace(/Manager$/i, '')
    .replace(/Service$/i, '');
  
  // Capitalize prefix
  const capitalizedPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  
  // Generate suggested name
  if (baseName.length > 3) {
    return baseName + capitalizedPrefix + 'Utils';
  } else {
    return capitalizedPrefix + 'Utils';
  }
}

/**
 * Format the method clusters report for God classes
 */
function formatMethodClustersReport(analysis: CodebaseAnalysis, options?: FormatOptions): string {
  const lines: string[] = [];
  
  lines.push('# 🔬 Method Clustering Analysis for God Classes');
  lines.push('');
  lines.push('> This report suggests **HOW to split** God classes based on method grouping analysis.');
  lines.push('> Each cluster represents a potential new class to extract.');
  lines.push('');
  lines.push(`**Analyzed**: ${analysis.metadata.analyzedAt}`);
  lines.push('');
  
  // Get God classes
  const godClasses = analysis.classes.filter(c => c.flags.isGodClass);
  
  if (godClasses.length === 0) {
    lines.push('## ✅ No God Classes Found');
    lines.push('');
    lines.push('Great! Your codebase has no classes with >20 methods.');
    return lines.join('\n');
  }
  
  lines.push(`## Found ${godClasses.length} God Class${godClasses.length > 1 ? 'es' : ''}`);
  lines.push('');
  
  // Sort by method count (largest first)
  godClasses.sort((a, b) => b.methodCount - a.methodCount);
  
  for (const cls of godClasses.slice(0, 10)) { // Limit to top 10
    lines.push('---');
    lines.push('');
    lines.push(`## 🐘 ${cls.name}`);
    lines.push('');
    lines.push(`- **FQN**: \`${cls.fqn}\``);
    lines.push(`- **Methods**: ${cls.methodCount}`);
    lines.push(`- **Fields**: ${cls.fieldCount}`);
    lines.push(`- **File**: ${cls.file}`);
    lines.push('');
    
    // Get methods and fields for this class
    const methods = options?.methodsByClass?.get(cls.fqn) || [];
    const fields = options?.fieldsByClass?.get(cls.fqn) || [];
    
    if (methods.length > 0 && options?.memoryIndex) {
      const clusters = analyzeMethodClusters(cls.fqn, methods, fields, options.memoryIndex);
      
      if (clusters.length > 0) {
        lines.push('### 📦 Suggested Splits');
        lines.push('');
        
        // Sort clusters by confidence
        clusters.sort((a, b) => {
          const order = { 'high': 0, 'medium': 1, 'low': 2 };
          return order[a.confidence] - order[b.confidence];
        });
        
        for (let i = 0; i < clusters.length; i++) {
          const cluster = clusters[i];
          const confidenceIcon = cluster.confidence === 'high' ? '🟢' : 
                                cluster.confidence === 'medium' ? '🟡' : '🔴';
          
          lines.push(`#### ${i + 1}. Extract: \`${cluster.name}\` ${confidenceIcon}`);
          lines.push('');
          lines.push(`**Reason**: ${cluster.reason}`);
          lines.push(`**Confidence**: ${cluster.confidence.toUpperCase()}`);
          lines.push('');
          lines.push('**Methods to move:**');
          cluster.methods.slice(0, 15).forEach(m => {
            lines.push(`- \`${m}()\``);
          });
          if (cluster.methods.length > 15) {
            lines.push(`- ... and ${cluster.methods.length - 15} more`);
          }
          lines.push('');
          
          if (cluster.sharedFields.length > 0) {
            lines.push('**Related fields:**');
            cluster.sharedFields.slice(0, 5).forEach(f => {
              lines.push(`- \`${f}\``);
            });
            lines.push('');
          }
        }
        
        // Refactoring steps
        lines.push('### 📝 Refactoring Steps');
        lines.push('');
        lines.push('1. Create new class with suggested name');
        lines.push('2. Move listed methods to new class');
        lines.push('3. Move related fields (if any)');
        lines.push('4. Update original class to delegate to new class');
        lines.push('5. Update all callers (use `find_usages` to locate them)');
        lines.push('6. Run tests and fix any issues');
        lines.push('');
      } else {
        lines.push('### ⚠️ No Clear Clustering Pattern Found');
        lines.push('');
        lines.push('This class may need manual analysis. Consider:');
        lines.push('- Grouping methods by the data they access');
        lines.push('- Looking for natural domain boundaries');
        lines.push('- Consulting with team members who know this code');
        lines.push('');
      }
    } else {
      lines.push('### ℹ️ Method Details Not Available');
      lines.push('');
      lines.push('Use `explore_class(className: "' + cls.name + '")` for detailed method analysis.');
      lines.push('');
    }
  }
  
  if (godClasses.length > 10) {
    lines.push('---');
    lines.push('');
    lines.push(`> Showing top 10 of ${godClasses.length} God classes. Run with specific package filter for more.`);
  }
  
  // Best practices
  lines.push('---');
  lines.push('');
  lines.push('## 💡 God Class Refactoring Best Practices');
  lines.push('');
  lines.push('1. **Start with high-confidence clusters** - These have clear patterns');
  lines.push('2. **Extract one cluster at a time** - Small, incremental changes');
  lines.push('3. **Preserve the original class initially** - Delegate to extracted classes');
  lines.push('4. **Write tests BEFORE refactoring** - Ensure behavior is preserved');
  lines.push('5. **Update callers gradually** - Can be done in follow-up PRs');
  lines.push('6. **Consider using composition** - Original class holds references to extracted classes');
  
  return lines.join('\n');
}
