package com.mcp.indexer;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.resolution.TypeSolver;
import com.github.javaparser.symbolsolver.JavaSymbolSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.CombinedTypeSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.JavaParserTypeSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.ReflectionTypeSolver;
import com.mcp.indexer.StubModel.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

public class ParserService {
    
    private final JavaParser javaParser;
    private final List<String> sourceRoots;
    
    public ParserService(List<String> sourceRoots) {
        this.sourceRoots = sourceRoots;
        
        // Setup type solver
        CombinedTypeSolver typeSolver = new CombinedTypeSolver();
        typeSolver.add(new ReflectionTypeSolver());
        
        for (String sourceRoot : sourceRoots) {
            File srcDir = new File(sourceRoot);
            if (srcDir.exists() && srcDir.isDirectory()) {
                typeSolver.add(new JavaParserTypeSolver(srcDir));
            }
        }
        
        // Configure parser with symbol solver
        ParserConfiguration config = new ParserConfiguration();
        config.setSymbolResolver(new JavaSymbolSolver(typeSolver));
        
        this.javaParser = new JavaParser(config);
    }
    
    public IndexResult indexFile(String filePath) {
        IndexResult result = new IndexResult();
        result.file = filePath;
        result.symbols = new ArrayList<>();
        result.references = new ArrayList<>();
        
        try {
            // Parse file
            Path path = Paths.get(filePath);
            if (!Files.exists(path)) {
                result.error = "File not found: " + filePath;
                return result;
            }
            
            ParseResult<CompilationUnit> parseResult = javaParser.parse(path);
            
            if (!parseResult.isSuccessful()) {
                result.error = "Parse failed: " + parseResult.getProblems().toString();
                return result;
            }
            
            CompilationUnit cu = parseResult.getResult().get();
            
            // Extract package name
            String packageName = cu.getPackageDeclaration()
                .map(pd -> pd.getNameAsString())
                .orElse("");
            
            // Extract symbols and references
            ReferenceExtractor refExtractor = new ReferenceExtractor(filePath, result);
            
            // Process classes, interfaces, enums
            cu.findAll(ClassOrInterfaceDeclaration.class).forEach(cid -> {
                extractClassSymbol(cid, packageName, filePath, result);
                refExtractor.extractReferences(cid, getClassFqn(cid, packageName));
            });
            
            cu.findAll(EnumDeclaration.class).forEach(ed -> {
                extractEnumSymbol(ed, packageName, filePath, result);
                refExtractor.extractReferences(ed, getEnumFqn(ed, packageName));
            });
            
        } catch (IOException e) {
            result.error = "IO Error: " + e.getMessage();
        } catch (Exception e) {
            result.error = "Error: " + e.getMessage();
        }
        
        return result;
    }
    
    private void extractClassSymbol(ClassOrInterfaceDeclaration cid, String packageName, 
                                   String filePath, IndexResult result) {
        SymbolStub classStub = new SymbolStub();
        classStub.name = cid.getNameAsString();
        classStub.packageName = packageName;
        classStub.fqn = packageName.isEmpty() ? classStub.name : packageName + "." + classStub.name;
        classStub.kind = cid.isInterface() ? "interface" : "class";
        classStub.file = filePath;
        classStub.line = cid.getBegin().map(pos -> pos.line).orElse(0);
        classStub.column = cid.getBegin().map(pos -> pos.column).orElse(0);
        classStub.modifiers = cid.getModifiers().stream()
            .map(m -> m.getKeyword().asString())
            .collect(Collectors.toList());
        
        // Extends
        if (!cid.isInterface() && !cid.getExtendedTypes().isEmpty()) {
            classStub.extendsClass = cid.getExtendedTypes().get(0).getNameAsString();
        }
        
        // Implements
        if (!cid.getImplementedTypes().isEmpty()) {
            classStub.implementsInterfaces = cid.getImplementedTypes().stream()
                .map(ClassOrInterfaceType::getNameAsString)
                .collect(Collectors.toList());
        }
        
        result.symbols.add(classStub);
        
        // Extract methods
        cid.getMethods().forEach(md -> extractMethodSymbol(md, classStub.fqn, filePath, result));
        
        // Extract fields
        cid.getFields().forEach(fd -> extractFieldSymbols(fd, classStub.fqn, filePath, result));
        
        // Extract constructors
        cid.getConstructors().forEach(cd -> extractConstructorSymbol(cd, classStub.fqn, filePath, result));
    }
    
    private void extractMethodSymbol(MethodDeclaration md, String declaringClass, 
                                    String filePath, IndexResult result) {
        SymbolStub methodStub = new SymbolStub();
        methodStub.name = md.getNameAsString();
        methodStub.declaringClass = declaringClass;
        methodStub.packageName = declaringClass.contains(".") ? 
            declaringClass.substring(0, declaringClass.lastIndexOf(".")) : "";
        
        // Build method signature
        String params = md.getParameters().stream()
            .map(p -> p.getType().asString())
            .collect(Collectors.joining(", "));
        methodStub.signature = md.getType().asString() + " " + md.getNameAsString() + "(" + params + ")";
        methodStub.fqn = declaringClass + "." + md.getNameAsString() + "(" + params + ")";
        
        methodStub.kind = "method";
        methodStub.file = filePath;
        methodStub.line = md.getBegin().map(pos -> pos.line).orElse(0);
        methodStub.column = md.getBegin().map(pos -> pos.column).orElse(0);
        methodStub.modifiers = md.getModifiers().stream()
            .map(m -> m.getKeyword().asString())
            .collect(Collectors.toList());
        
        result.symbols.add(methodStub);
    }
    
    private void extractConstructorSymbol(ConstructorDeclaration cd, String declaringClass, 
                                         String filePath, IndexResult result) {
        SymbolStub constructorStub = new SymbolStub();
        constructorStub.name = cd.getNameAsString();
        constructorStub.declaringClass = declaringClass;
        constructorStub.packageName = declaringClass.contains(".") ? 
            declaringClass.substring(0, declaringClass.lastIndexOf(".")) : "";
        
        String params = cd.getParameters().stream()
            .map(p -> p.getType().asString())
            .collect(Collectors.joining(", "));
        constructorStub.signature = cd.getNameAsString() + "(" + params + ")";
        constructorStub.fqn = declaringClass + "." + cd.getNameAsString() + "(" + params + ")";
        
        constructorStub.kind = "constructor";
        constructorStub.file = filePath;
        constructorStub.line = cd.getBegin().map(pos -> pos.line).orElse(0);
        constructorStub.column = cd.getBegin().map(pos -> pos.column).orElse(0);
        constructorStub.modifiers = cd.getModifiers().stream()
            .map(m -> m.getKeyword().asString())
            .collect(Collectors.toList());
        
        result.symbols.add(constructorStub);
    }
    
    private void extractFieldSymbols(FieldDeclaration fd, String declaringClass, 
                                    String filePath, IndexResult result) {
        fd.getVariables().forEach(vd -> {
            SymbolStub fieldStub = new SymbolStub();
            fieldStub.name = vd.getNameAsString();
            fieldStub.declaringClass = declaringClass;
            fieldStub.packageName = declaringClass.contains(".") ? 
                declaringClass.substring(0, declaringClass.lastIndexOf(".")) : "";
            fieldStub.fqn = declaringClass + "." + vd.getNameAsString();
            fieldStub.kind = "field";
            fieldStub.file = filePath;
            fieldStub.line = vd.getBegin().map(pos -> pos.line).orElse(0);
            fieldStub.column = vd.getBegin().map(pos -> pos.column).orElse(0);
            fieldStub.modifiers = fd.getModifiers().stream()
                .map(m -> m.getKeyword().asString())
                .collect(Collectors.toList());
            fieldStub.signature = fd.getElementType().asString() + " " + vd.getNameAsString();
            
            result.symbols.add(fieldStub);
        });
    }
    
    private void extractEnumSymbol(EnumDeclaration ed, String packageName, 
                                  String filePath, IndexResult result) {
        SymbolStub enumStub = new SymbolStub();
        enumStub.name = ed.getNameAsString();
        enumStub.packageName = packageName;
        enumStub.fqn = packageName.isEmpty() ? enumStub.name : packageName + "." + enumStub.name;
        enumStub.kind = "enum";
        enumStub.file = filePath;
        enumStub.line = ed.getBegin().map(pos -> pos.line).orElse(0);
        enumStub.column = ed.getBegin().map(pos -> pos.column).orElse(0);
        enumStub.modifiers = ed.getModifiers().stream()
            .map(m -> m.getKeyword().asString())
            .collect(Collectors.toList());
        
        if (!ed.getImplementedTypes().isEmpty()) {
            enumStub.implementsInterfaces = ed.getImplementedTypes().stream()
                .map(ClassOrInterfaceType::getNameAsString)
                .collect(Collectors.toList());
        }
        
        result.symbols.add(enumStub);
    }
    
    private String getClassFqn(ClassOrInterfaceDeclaration cid, String packageName) {
        return packageName.isEmpty() ? cid.getNameAsString() : packageName + "." + cid.getNameAsString();
    }
    
    private String getEnumFqn(EnumDeclaration ed, String packageName) {
        return packageName.isEmpty() ? ed.getNameAsString() : packageName + "." + ed.getNameAsString();
    }
}
