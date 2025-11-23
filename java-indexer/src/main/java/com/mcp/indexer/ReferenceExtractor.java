package com.mcp.indexer;

import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.EnumDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.mcp.indexer.StubModel.*;

public class ReferenceExtractor {
    
    private final String filePath;
    private final IndexResult result;
    
    public ReferenceExtractor(String filePath, IndexResult result) {
        this.filePath = filePath;
        this.result = result;
    }
    
    public void extractReferences(ClassOrInterfaceDeclaration cid, String contextFqn) {
        // Extract inheritance references
        if (!cid.getExtendedTypes().isEmpty()) {
            cid.getExtendedTypes().forEach(ext -> {
                addReference(contextFqn, ext.getNameAsString(), "inheritance", 
                    ext.getBegin().map(p -> p.line).orElse(0),
                    ext.getBegin().map(p -> p.column).orElse(0));
            });
        }
        
        if (!cid.getImplementedTypes().isEmpty()) {
            cid.getImplementedTypes().forEach(impl -> {
                addReference(contextFqn, impl.getNameAsString(), "inheritance",
                    impl.getBegin().map(p -> p.line).orElse(0),
                    impl.getBegin().map(p -> p.column).orElse(0));
            });
        }
        
        // Extract references from methods
        cid.getMethods().forEach(md -> {
            // Build method FQN with parameters to match symbol FQN format
            String params = md.getParameters().stream()
                .map(p -> p.getType().asString())
                .collect(java.util.stream.Collectors.joining(", "));
            String methodFqn = contextFqn + "." + md.getNameAsString() + "(" + params + ")";
            extractMethodReferences(md, methodFqn);
        });
        
        // Extract references from constructors
        cid.getConstructors().forEach(cd -> {
            String params = cd.getParameters().stream()
                .map(p -> p.getType().asString())
                .collect(java.util.stream.Collectors.joining(", "));
            String constructorFqn = contextFqn + "." + cd.getNameAsString() + "(" + params + ")";
            extractConstructorReferences(cd, constructorFqn);
        });
    }
    
    public void extractReferences(EnumDeclaration ed, String contextFqn) {
        // Extract interface implementations
        if (!ed.getImplementedTypes().isEmpty()) {
            ed.getImplementedTypes().forEach(impl -> {
                addReference(contextFqn, impl.getNameAsString(), "inheritance",
                    impl.getBegin().map(p -> p.line).orElse(0),
                    impl.getBegin().map(p -> p.column).orElse(0));
            });
        }
    }
    
    private void extractMethodReferences(MethodDeclaration md, String methodFqn) {
        // Extract method calls
        md.findAll(MethodCallExpr.class).forEach(mce -> {
            String calledMethod = mce.getNameAsString();
            
            // Try to resolve scope
            String targetFqn = calledMethod;
            if (mce.getScope().isPresent()) {
                Expression scope = mce.getScope().get();
                if (scope.isNameExpr()) {
                    targetFqn = scope.asNameExpr().getNameAsString() + "." + calledMethod;
                } else if (scope.isFieldAccessExpr()) {
                    targetFqn = scope.asFieldAccessExpr().toString() + "." + calledMethod;
                }
            }
            
            addReference(methodFqn, targetFqn, "method_call",
                mce.getBegin().map(p -> p.line).orElse(0),
                mce.getBegin().map(p -> p.column).orElse(0));
        });
        
        // Extract field accesses
        md.findAll(FieldAccessExpr.class).forEach(fae -> {
            String fieldName = fae.getNameAsString();
            String scopeName = fae.getScope().toString();
            String targetFqn = scopeName + "." + fieldName;
            
            addReference(methodFqn, targetFqn, "field_access",
                fae.getBegin().map(p -> p.line).orElse(0),
                fae.getBegin().map(p -> p.column).orElse(0));
        });
        
        // Extract object creations (new X())
        md.findAll(ObjectCreationExpr.class).forEach(oce -> {
            String typeName = oce.getType().getNameAsString();
            
            addReference(methodFqn, typeName, "instantiation",
                oce.getBegin().map(p -> p.line).orElse(0),
                oce.getBegin().map(p -> p.column).orElse(0));
        });
        
        // Extract variable declarations with types
        md.findAll(VariableDeclarator.class).forEach(vd -> {
            String typeName = vd.getType().asString();
            if (!isPrimitiveType(typeName)) {
                addReference(methodFqn, typeName, "type_reference",
                    vd.getBegin().map(p -> p.line).orElse(0),
                    vd.getBegin().map(p -> p.column).orElse(0));
            }
        });
    }
    
    private void extractConstructorReferences(com.github.javaparser.ast.body.ConstructorDeclaration cd, String constructorFqn) {
        // Extract method calls
        cd.findAll(MethodCallExpr.class).forEach(mce -> {
            String calledMethod = mce.getNameAsString();
            
            // Try to resolve scope
            String targetFqn = calledMethod;
            if (mce.getScope().isPresent()) {
                Expression scope = mce.getScope().get();
                if (scope.isNameExpr()) {
                    targetFqn = scope.asNameExpr().getNameAsString() + "." + calledMethod;
                } else if (scope.isFieldAccessExpr()) {
                    targetFqn = scope.asFieldAccessExpr().toString() + "." + calledMethod;
                }
            }
            
            addReference(constructorFqn, targetFqn, "method_call",
                mce.getBegin().map(p -> p.line).orElse(0),
                mce.getBegin().map(p -> p.column).orElse(0));
        });
        
        // Extract field accesses
        cd.findAll(FieldAccessExpr.class).forEach(fae -> {
            String fieldName = fae.getNameAsString();
            String scopeName = fae.getScope().toString();
            String targetFqn = scopeName + "." + fieldName;
            
            addReference(constructorFqn, targetFqn, "field_access",
                fae.getBegin().map(p -> p.line).orElse(0),
                fae.getBegin().map(p -> p.column).orElse(0));
        });
        
        // Extract object creations (new X())
        cd.findAll(ObjectCreationExpr.class).forEach(oce -> {
            String typeName = oce.getType().getNameAsString();
            
            addReference(constructorFqn, typeName, "instantiation",
                oce.getBegin().map(p -> p.line).orElse(0),
                oce.getBegin().map(p -> p.column).orElse(0));
        });
        
        // Extract variable declarations with types
        cd.findAll(VariableDeclarator.class).forEach(vd -> {
            String typeName = vd.getType().asString();
            if (!isPrimitiveType(typeName)) {
                addReference(constructorFqn, typeName, "type_reference",
                    vd.getBegin().map(p -> p.line).orElse(0),
                    vd.getBegin().map(p -> p.column).orElse(0));
            }
        });
    }
    
    private void addReference(String fromFqn, String toFqn, String kind, int line, int column) {
        Reference ref = new Reference();
        ref.fromFqn = fromFqn;
        ref.toFqn = toFqn;
        ref.file = filePath;
        ref.line = line;
        ref.column = column;
        ref.kind = kind;
        
        result.references.add(ref);
    }
    
    private boolean isPrimitiveType(String type) {
        return type.equals("int") || type.equals("long") || type.equals("double") || 
               type.equals("float") || type.equals("boolean") || type.equals("char") || 
               type.equals("byte") || type.equals("short") || type.equals("void");
    }
}
