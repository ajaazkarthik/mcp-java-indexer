package com.mcp.indexer;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.CatchClause;
import com.github.javaparser.ast.type.*;
import com.mcp.indexer.StubModel.*;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Comprehensive reference extractor that detects ALL type dependencies including:
 * - extends/implements (inheritance)
 * - Method parameters and return types
 * - Field declarations
 * - Local variable types
 * - Generic type parameters (List<Entity>)
 * - Annotations (@Table, @Entity, etc.)
 * - Throws clauses
 * - Catch blocks
 * - instanceof expressions
 * - Cast expressions
 * - Class literals (Entity.class)
 * - Method references (Entity::method)
 * - Object creation (new Entity())
 * - Static field/method access
 * - Array types (Entity[])
 * - Type parameters and bounds
 * - Record components
 */
public class ReferenceExtractor {
    
    private final String filePath;
    private final IndexResult result;
    private final Map<String, String> importMap; // simpleName -> FQN
    private final Set<String> wildcardImports; // packages with wildcard imports
    private final String packageName;
    private final Set<String> processedRefs; // Avoid duplicate references
    
    // Common java.lang types that are auto-imported
    private static final Set<String> JAVA_LANG_TYPES = createJavaLangTypes();
    
    private static Set<String> createJavaLangTypes() {
        Set<String> types = new HashSet<>();
        types.add("Object"); types.add("String"); types.add("Class"); 
        types.add("System"); types.add("Runtime"); types.add("Thread");
        types.add("Throwable"); types.add("Exception"); types.add("RuntimeException");
        types.add("Error"); types.add("StackTraceElement");
        types.add("Boolean"); types.add("Byte"); types.add("Character");
        types.add("Short"); types.add("Integer"); types.add("Long");
        types.add("Float"); types.add("Double"); types.add("Void");
        types.add("Number"); types.add("Math"); types.add("StrictMath");
        types.add("StringBuilder"); types.add("StringBuffer");
        types.add("Comparable"); types.add("CharSequence"); types.add("Iterable");
        types.add("AutoCloseable"); types.add("Cloneable");
        types.add("Enum"); types.add("Record"); types.add("Deprecated");
        types.add("Override"); types.add("SuppressWarnings"); types.add("FunctionalInterface");
        types.add("SafeVarargs"); types.add("Package"); types.add("Module");
        types.add("ClassLoader"); types.add("Process"); types.add("ProcessBuilder");
        return types;
    }
    
    public ReferenceExtractor(String filePath, IndexResult result, CompilationUnit cu) {
        this.filePath = filePath;
        this.result = result;
        this.importMap = new HashMap<>();
        this.wildcardImports = new HashSet<>();
        this.processedRefs = new HashSet<>();
        this.packageName = cu.getPackageDeclaration()
            .map(pd -> pd.getNameAsString())
            .orElse("");
        
        // Build import map for type resolution
        for (ImportDeclaration imp : cu.getImports()) {
            if (imp.isAsterisk()) {
                // Track wildcard imports for resolution
                wildcardImports.add(imp.getNameAsString());
            } else {
                String importFqn = imp.getNameAsString();
                String simpleName = importFqn.substring(importFqn.lastIndexOf('.') + 1);
                importMap.put(simpleName, importFqn);
            }
        }
    }
    
    /**
     * Check if type is a Java primitive
     */
    private boolean isPrimitiveType(String type) {
        if (type == null) return false;
        switch (type) {
            case "int": case "long": case "double": case "float":
            case "boolean": case "char": case "byte": case "short": case "void":
                return true;
            default:
                return false;
        }
    }
    
    /**
     * Check if type is auto-imported from java.lang
     */
    private boolean isJavaLangType(String simpleName) {
        return simpleName != null && JAVA_LANG_TYPES.contains(simpleName);
    }
    
    /**
     * Resolve simple type name to FQN using imports and package context.
     * This handles same-package types that don't require explicit imports.
     */
    private String resolveTypeName(String typeName) {
        if (typeName == null || typeName.isEmpty()) {
            return typeName;
        }
        
        // Strip array brackets if present
        String baseType = typeName.replace("[]", "").trim();
        
        // Skip primitive types
        if (isPrimitiveType(baseType)) {
            return typeName;
        }
        
        // Skip java.lang types (auto-imported)
        if (isJavaLangType(baseType)) {
            return "java.lang." + baseType;
        }
        
        // Handle generic types - extract base type
        int genericStart = baseType.indexOf('<');
        String simpleBase = genericStart > 0 ? baseType.substring(0, genericStart) : baseType;
        
        // Handle nested class references (OuterClass.InnerClass)
        if (simpleBase.contains(".")) {
            // Could be a FQN or nested class
            int firstDot = simpleBase.indexOf('.');
            String outerClass = simpleBase.substring(0, firstDot);
            
            // Check if outer class is imported
            if (importMap.containsKey(outerClass)) {
                return importMap.get(outerClass) + simpleBase.substring(firstDot);
            }
            
            // Try same package for nested class
            if (!packageName.isEmpty() && !outerClass.contains(".")) {
                return packageName + "." + simpleBase;
            }
            
            // Likely already a FQN
            return simpleBase;
        }
        
        // Check explicit imports first
        if (importMap.containsKey(simpleBase)) {
            return importMap.get(simpleBase);
        }
        
        // If in same package, use packageName + simpleName (Java default behavior)
        // This is the KEY fix for same-package dependency detection
        if (!packageName.isEmpty()) {
            return packageName + "." + simpleBase;
        }
        
        // Otherwise return as-is (might be in default package or unresolvable)
        return simpleBase;
    }
    
    /**
     * Extract type reference from a Type node, handling generics, arrays, etc.
     */
    private void extractTypeReference(Type type, String contextFqn, String kind) {
        if (type == null) return;
        
        // Handle array types
        if (type.isArrayType()) {
            extractTypeReference(type.asArrayType().getComponentType(), contextFqn, kind);
            return;
        }
        
        // Handle generic types (e.g., List<Entity>, Map<String, Entity>)
        if (type.isClassOrInterfaceType()) {
            ClassOrInterfaceType cit = type.asClassOrInterfaceType();
            String typeName = cit.getNameAsString();
            
            if (!isPrimitiveType(typeName) && !isJavaLangType(typeName)) {
                String resolvedType = resolveTypeName(typeName);
                addReference(contextFqn, resolvedType, kind,
                    cit.getBegin().map(p -> p.line).orElse(0),
                    cit.getBegin().map(p -> p.column).orElse(0));
            }
            
            // Extract type arguments (generics)
            cit.getTypeArguments().ifPresent(typeArgs -> {
                for (Type typeArg : typeArgs) {
                    extractTypeReference(typeArg, contextFqn, kind);
                }
            });
            
            // Handle scope (for nested types like OuterClass.InnerClass)
            cit.getScope().ifPresent(scope -> {
                extractTypeReference(scope, contextFqn, kind);
            });
            return;
        }
        
        // Handle wildcard types (? extends Entity)
        if (type.isWildcardType()) {
            WildcardType wt = type.asWildcardType();
            wt.getExtendedType().ifPresent(ext -> extractTypeReference(ext, contextFqn, kind));
            wt.getSuperType().ifPresent(sup -> extractTypeReference(sup, contextFqn, kind));
            return;
        }
        
        // Handle type parameters (T extends Entity)
        if (type.isTypeParameter()) {
            TypeParameter tp = (TypeParameter) type;
            for (ClassOrInterfaceType bound : tp.getTypeBound()) {
                extractTypeReference(bound, contextFqn, kind);
            }
            return;
        }
        
        // Handle union types (in catch blocks: Exception1 | Exception2)
        if (type.isUnionType()) {
            UnionType ut = type.asUnionType();
            for (ReferenceType element : ut.getElements()) {
                extractTypeReference(element, contextFqn, kind);
            }
            return;
        }
        
        // Handle intersection types (T extends A & B)
        if (type.isIntersectionType()) {
            IntersectionType it = type.asIntersectionType();
            for (ReferenceType element : it.getElements()) {
                extractTypeReference(element, contextFqn, kind);
            }
            return;
        }
    }
    
    /**
     * Extract annotation references
     */
    private void extractAnnotationReferences(NodeList<AnnotationExpr> annotations, String contextFqn) {
        for (AnnotationExpr annotation : annotations) {
            String annotationName = annotation.getNameAsString();
            String resolvedType = resolveTypeName(annotationName);
            
            addReference(contextFqn, resolvedType, "annotation",
                annotation.getBegin().map(p -> p.line).orElse(0),
                annotation.getBegin().map(p -> p.column).orElse(0));
            
            // Extract type references from annotation values (e.g., @Table(entity = Entity.class))
            if (annotation.isNormalAnnotationExpr()) {
                NormalAnnotationExpr nae = annotation.asNormalAnnotationExpr();
                for (MemberValuePair mvp : nae.getPairs()) {
                    extractExpressionTypeReferences(mvp.getValue(), contextFqn);
                }
            } else if (annotation.isSingleMemberAnnotationExpr()) {
                SingleMemberAnnotationExpr smae = annotation.asSingleMemberAnnotationExpr();
                extractExpressionTypeReferences(smae.getMemberValue(), contextFqn);
            }
        }
    }
    
    /**
     * Extract type references from expressions (class literals, method references, etc.)
     */
    private void extractExpressionTypeReferences(Expression expr, String contextFqn) {
        if (expr == null) return;
        
        // Class literal: Entity.class
        if (expr.isClassExpr()) {
            ClassExpr ce = expr.asClassExpr();
            extractTypeReference(ce.getType(), contextFqn, "class_literal");
        }
        
        // Method reference: Entity::method
        if (expr.isMethodReferenceExpr()) {
            MethodReferenceExpr mre = expr.asMethodReferenceExpr();
            Expression scope = mre.getScope();
            if (scope.isTypeExpr()) {
                extractTypeReference(scope.asTypeExpr().getType(), contextFqn, "method_reference");
            }
        }
        
        // Array initializer with types
        if (expr.isArrayInitializerExpr()) {
            ArrayInitializerExpr aie = expr.asArrayInitializerExpr();
            for (Expression value : aie.getValues()) {
                extractExpressionTypeReferences(value, contextFqn);
            }
        }
    }
    
    /**
     * Main entry point for class/interface extraction
     */
    public void extractReferences(ClassOrInterfaceDeclaration cid, String contextFqn) {
        // Extract class-level annotations
        extractAnnotationReferences(cid.getAnnotations(), contextFqn);
        
        // Extract type parameters and bounds (class Foo<T extends Entity>)
        for (TypeParameter tp : cid.getTypeParameters()) {
            for (ClassOrInterfaceType bound : tp.getTypeBound()) {
                extractTypeReference(bound, contextFqn, "type_bound");
            }
        }
        
        // Extract inheritance references (extends)
        for (ClassOrInterfaceType ext : cid.getExtendedTypes()) {
            extractTypeReference(ext, contextFqn, "extends");
        }
        
        // Extract implemented interfaces
        for (ClassOrInterfaceType impl : cid.getImplementedTypes()) {
            extractTypeReference(impl, contextFqn, "implements");
        }
        
        // Extract field declarations
        for (FieldDeclaration fd : cid.getFields()) {
            extractAnnotationReferences(fd.getAnnotations(), contextFqn);
            extractTypeReference(fd.getElementType(), contextFqn, "field_type");
            
            // Check for type references in initializers
            for (VariableDeclarator vd : fd.getVariables()) {
                vd.getInitializer().ifPresent(init -> 
                    extractAllExpressionReferences(init, contextFqn));
            }
        }
        
        // Extract method declarations
        for (MethodDeclaration md : cid.getMethods()) {
            String params = md.getParameters().stream()
                .map(p -> p.getType().asString())
                .collect(java.util.stream.Collectors.joining(", "));
            String methodFqn = contextFqn + "." + md.getNameAsString() + "(" + params + ")";
            extractMethodReferences(md, methodFqn);
        }
        
        // Extract constructor declarations
        for (ConstructorDeclaration cd : cid.getConstructors()) {
            String params = cd.getParameters().stream()
                .map(p -> p.getType().asString())
                .collect(java.util.stream.Collectors.joining(", "));
            String constructorFqn = contextFqn + "." + cd.getNameAsString() + "(" + params + ")";
            extractConstructorReferences(cd, constructorFqn);
        }
        
        // Extract nested classes/interfaces
        for (ClassOrInterfaceDeclaration nested : cid.findAll(ClassOrInterfaceDeclaration.class)) {
            if (nested != cid) { // Skip self
                String nestedFqn = contextFqn + "." + nested.getNameAsString();
                extractReferences(nested, nestedFqn);
            }
        }
    }
    
    /**
     * Extract references from enum declarations
     */
    public void extractReferences(EnumDeclaration ed, String contextFqn) {
        // Extract annotations
        extractAnnotationReferences(ed.getAnnotations(), contextFqn);
        
        // Extract implemented interfaces
        for (ClassOrInterfaceType impl : ed.getImplementedTypes()) {
            extractTypeReference(impl, contextFqn, "implements");
        }
        
        // Extract field types
        for (FieldDeclaration fd : ed.getFields()) {
            extractAnnotationReferences(fd.getAnnotations(), contextFqn);
            extractTypeReference(fd.getElementType(), contextFqn, "field_type");
        }
        
        // Extract method declarations
        for (MethodDeclaration md : ed.getMethods()) {
            String params = md.getParameters().stream()
                .map(p -> p.getType().asString())
                .collect(java.util.stream.Collectors.joining(", "));
            String methodFqn = contextFqn + "." + md.getNameAsString() + "(" + params + ")";
            extractMethodReferences(md, methodFqn);
        }
        
        // Extract constructor declarations
        for (ConstructorDeclaration cd : ed.getConstructors()) {
            String params = cd.getParameters().stream()
                .map(p -> p.getType().asString())
                .collect(java.util.stream.Collectors.joining(", "));
            String constructorFqn = contextFqn + "." + cd.getNameAsString() + "(" + params + ")";
            extractConstructorReferences(cd, constructorFqn);
        }
    }
    
    /**
     * Extract references from record declarations (Java 14+)
     */
    public void extractReferences(RecordDeclaration rd, String contextFqn) {
        // Extract annotations
        extractAnnotationReferences(rd.getAnnotations(), contextFqn);
        
        // Extract implemented interfaces
        for (ClassOrInterfaceType impl : rd.getImplementedTypes()) {
            extractTypeReference(impl, contextFqn, "implements");
        }
        
        // Extract record component types
        for (Parameter param : rd.getParameters()) {
            extractAnnotationReferences(param.getAnnotations(), contextFqn);
            extractTypeReference(param.getType(), contextFqn, "record_component");
        }
        
        // Extract method declarations
        for (MethodDeclaration md : rd.getMethods()) {
            String params = md.getParameters().stream()
                .map(p -> p.getType().asString())
                .collect(java.util.stream.Collectors.joining(", "));
            String methodFqn = contextFqn + "." + md.getNameAsString() + "(" + params + ")";
            extractMethodReferences(md, methodFqn);
        }
    }
    
    /**
     * Comprehensive method reference extraction
     */
    private void extractMethodReferences(MethodDeclaration md, String methodFqn) {
        // Extract method-level annotations
        extractAnnotationReferences(md.getAnnotations(), methodFqn);
        
        // Extract return type
        extractTypeReference(md.getType(), methodFqn, "return_type");
        
        // Extract parameter types and annotations
        for (Parameter param : md.getParameters()) {
            extractAnnotationReferences(param.getAnnotations(), methodFqn);
            extractTypeReference(param.getType(), methodFqn, "parameter_type");
        }
        
        // Extract throws clause
        for (ReferenceType thrown : md.getThrownExceptions()) {
            extractTypeReference(thrown, methodFqn, "throws");
        }
        
        // Extract type parameters (generic methods)
        for (TypeParameter tp : md.getTypeParameters()) {
            for (ClassOrInterfaceType bound : tp.getTypeBound()) {
                extractTypeReference(bound, methodFqn, "type_bound");
            }
        }
        
        // Extract all references from method body
        md.getBody().ifPresent(body -> {
            // Method calls
            body.findAll(MethodCallExpr.class).forEach(mce -> 
                extractMethodCallReference(mce, methodFqn));
            
            // Field accesses
            body.findAll(FieldAccessExpr.class).forEach(fae -> 
                extractFieldAccessReference(fae, methodFqn));
            
            // Object creations (new X())
            body.findAll(ObjectCreationExpr.class).forEach(oce -> {
                extractTypeReference(oce.getType(), methodFqn, "instantiation");
                // Extract generic type arguments in constructor
                oce.getType().getTypeArguments().ifPresent(args -> {
                    for (Type arg : args) {
                        extractTypeReference(arg, methodFqn, "type_argument");
                    }
                });
            });
            
            // Variable declarations
            body.findAll(VariableDeclarator.class).forEach(vd -> {
                extractTypeReference(vd.getType(), methodFqn, "local_variable");
            });
            
            // Cast expressions
            body.findAll(CastExpr.class).forEach(ce -> {
                extractTypeReference(ce.getType(), methodFqn, "cast");
            });
            
            // instanceof expressions
            body.findAll(InstanceOfExpr.class).forEach(ioe -> {
                extractTypeReference(ioe.getType(), methodFqn, "instanceof");
                // Note: Pattern matching (Java 16+) patterns are handled by type extraction
                // The pattern variable type is already part of the instanceof type
            });
            
            // Catch clauses
            body.findAll(CatchClause.class).forEach(cc -> {
                extractTypeReference(cc.getParameter().getType(), methodFqn, "catch_type");
            });
            
            // Class literals (Entity.class)
            body.findAll(ClassExpr.class).forEach(ce -> {
                extractTypeReference(ce.getType(), methodFqn, "class_literal");
            });
            
            // Method references (Entity::method)
            body.findAll(MethodReferenceExpr.class).forEach(mre -> {
                Expression scope = mre.getScope();
                if (scope.isTypeExpr()) {
                    extractTypeReference(scope.asTypeExpr().getType(), methodFqn, "method_reference");
                }
            });
            
            // Array creation expressions
            body.findAll(ArrayCreationExpr.class).forEach(ace -> {
                extractTypeReference(ace.getElementType(), methodFqn, "array_creation");
            });
        });
    }
    
    /**
     * Extract references from constructor declarations
     */
    private void extractConstructorReferences(ConstructorDeclaration cd, String constructorFqn) {
        // Extract annotations
        extractAnnotationReferences(cd.getAnnotations(), constructorFqn);
        
        // Extract parameter types
        for (Parameter param : cd.getParameters()) {
            extractAnnotationReferences(param.getAnnotations(), constructorFqn);
            extractTypeReference(param.getType(), constructorFqn, "parameter_type");
        }
        
        // Extract throws clause
        for (ReferenceType thrown : cd.getThrownExceptions()) {
            extractTypeReference(thrown, constructorFqn, "throws");
        }
        
        // Extract body references (reuse method body logic)
        cd.getBody().findAll(MethodCallExpr.class).forEach(mce -> 
            extractMethodCallReference(mce, constructorFqn));
        
        cd.getBody().findAll(FieldAccessExpr.class).forEach(fae -> 
            extractFieldAccessReference(fae, constructorFqn));
        
        cd.getBody().findAll(ObjectCreationExpr.class).forEach(oce -> {
            extractTypeReference(oce.getType(), constructorFqn, "instantiation");
        });
        
        cd.getBody().findAll(VariableDeclarator.class).forEach(vd -> {
            extractTypeReference(vd.getType(), constructorFqn, "local_variable");
        });
        
        cd.getBody().findAll(CastExpr.class).forEach(ce -> {
            extractTypeReference(ce.getType(), constructorFqn, "cast");
        });
        
        cd.getBody().findAll(InstanceOfExpr.class).forEach(ioe -> {
            extractTypeReference(ioe.getType(), constructorFqn, "instanceof");
        });
        
        cd.getBody().findAll(CatchClause.class).forEach(cc -> {
            extractTypeReference(cc.getParameter().getType(), constructorFqn, "catch_type");
        });
        
        cd.getBody().findAll(ClassExpr.class).forEach(ce -> {
            extractTypeReference(ce.getType(), constructorFqn, "class_literal");
        });
        
        cd.getBody().findAll(MethodReferenceExpr.class).forEach(mre -> {
            Expression scope = mre.getScope();
            if (scope.isTypeExpr()) {
                extractTypeReference(scope.asTypeExpr().getType(), constructorFqn, "method_reference");
            }
        });
    }
    
    /**
     * Extract method call reference with proper scope resolution
     */
    private void extractMethodCallReference(MethodCallExpr mce, String contextFqn) {
        String calledMethod = mce.getNameAsString();
        String targetFqn;
        
        if (mce.getScope().isPresent()) {
            Expression scope = mce.getScope().get();
            if (scope.isNameExpr()) {
                String scopeName = scope.asNameExpr().getNameAsString();
                // Try to resolve the scope type
                String resolvedScope = resolveTypeName(scopeName);
                targetFqn = resolvedScope + "." + calledMethod;
            } else if (scope.isFieldAccessExpr()) {
                targetFqn = scope.asFieldAccessExpr().toString() + "." + calledMethod;
            } else if (scope.isMethodCallExpr()) {
                // Chained method call - just use the method name
                targetFqn = calledMethod;
            } else {
                targetFqn = scope.toString() + "." + calledMethod;
            }
        } else {
            // No scope - could be same-class method or static import
            targetFqn = calledMethod;
        }
        
        addReference(contextFqn, targetFqn, "method_call",
            mce.getBegin().map(p -> p.line).orElse(0),
            mce.getBegin().map(p -> p.column).orElse(0));
    }
    
    /**
     * Extract field access reference with proper scope resolution
     */
    private void extractFieldAccessReference(FieldAccessExpr fae, String contextFqn) {
        String fieldName = fae.getNameAsString();
        String scopeName = fae.getScope().toString();
        
        // Try to resolve scope to FQN
        if (!scopeName.contains(".")) {
            scopeName = resolveTypeName(scopeName);
        }
        
        String targetFqn = scopeName + "." + fieldName;
        
        addReference(contextFqn, targetFqn, "field_access",
            fae.getBegin().map(p -> p.line).orElse(0),
            fae.getBegin().map(p -> p.column).orElse(0));
    }
    
    /**
     * Extract all type references from any expression
     */
    private void extractAllExpressionReferences(Expression expr, String contextFqn) {
        if (expr == null) return;
        
        // Object creation
        expr.findAll(ObjectCreationExpr.class).forEach(oce -> {
            extractTypeReference(oce.getType(), contextFqn, "instantiation");
        });
        
        // Method calls
        expr.findAll(MethodCallExpr.class).forEach(mce -> {
            extractMethodCallReference(mce, contextFqn);
        });
        
        // Class literals
        expr.findAll(ClassExpr.class).forEach(ce -> {
            extractTypeReference(ce.getType(), contextFqn, "class_literal");
        });
        
        // Cast expressions
        expr.findAll(CastExpr.class).forEach(ce -> {
            extractTypeReference(ce.getType(), contextFqn, "cast");
        });
        
        // Method references
        expr.findAll(MethodReferenceExpr.class).forEach(mre -> {
            Expression scope = mre.getScope();
            if (scope.isTypeExpr()) {
                extractTypeReference(scope.asTypeExpr().getType(), contextFqn, "method_reference");
            }
        });
    }
    
    /**
     * Add reference with deduplication
     */
    private void addReference(String fromFqn, String toFqn, String kind, int line, int column) {
        if (toFqn == null || toFqn.isEmpty()) return;
        
        // Skip primitive types and common java.lang types
        String baseName = toFqn.contains(".") ? toFqn.substring(toFqn.lastIndexOf('.') + 1) : toFqn;
        if (isPrimitiveType(baseName)) return;
        
        // Create deduplication key
        String key = fromFqn + "->" + toFqn + ":" + kind + "@" + line;
        if (processedRefs.contains(key)) return;
        processedRefs.add(key);
        
        Reference ref = new Reference();
        ref.fromFqn = fromFqn;
        ref.toFqn = toFqn;
        ref.file = filePath;
        ref.line = line;
        ref.column = column;
        ref.kind = kind;
        
        result.references.add(ref);
    }
}
