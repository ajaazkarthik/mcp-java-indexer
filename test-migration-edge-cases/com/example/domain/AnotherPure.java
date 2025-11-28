
package com.example.domain;

/**
 * Another truly pure class with no same-package deps
 */
public final class AnotherPure {
    private final String id;
    
    public AnotherPure(String id) {
        this.id = id;
    }
    
    public String getId() {
        return id;
    }
    
    @Override
    public String toString() {
        return "AnotherPure{id='" + id + "'}";
    }
}
