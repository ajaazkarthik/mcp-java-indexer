package com.example.demo.advanced;

/**
 * Edge Case 7: Builder pattern with inheritance
 */
public abstract class BaseBuilder<T> {
    public static final String BUILDER_VERSION = "2.1";
    public static final boolean VALIDATE_ON_BUILD = true;
    
    public abstract T build();
    
    protected void validateBuild() {
        System.out.println("Validating build");
    }
}
