package com.mcp.indexer;

import java.util.List;

public class StubModel {
    
    public static class SymbolStub {
        public String fqn;
        public String name;
        public String kind; // class, interface, enum, method, field, constructor
        public String file;
        public int line;
        public int column;
        public String packageName;
        public List<String> modifiers;
        public String signature; // For methods
        public String extendsClass;
        public List<String> implementsInterfaces;
        public String declaringClass; // For methods/fields
        
        public SymbolStub() {}
    }
    
    public static class Reference {
        public String fromFqn;
        public String toFqn;
        public String file;
        public int line;
        public int column;
        public String kind; // method_call, field_access, instantiation, inheritance, type_reference
        
        public Reference() {}
    }
    
    public static class IndexResult {
        public String file;
        public List<SymbolStub> symbols;
        public List<Reference> references;
        public String error;
        
        public IndexResult() {}
    }
}
