
package com.example.domain;

public class TestClassLiteral {
    public Class<?> getEntityClass() {
        return Entity.class;   // same-package type in class literal
    }
    
    public boolean isType(Class<?> clazz) {
        return clazz == Status.class;
    }
}
