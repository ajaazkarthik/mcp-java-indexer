
package com.example.domain;

import java.util.List;
import java.util.ArrayList;

/**
 * This class has NO dependencies on other classes in com.example.domain
 * It should be marked as SAFE for migration
 */
public class TrulyPure {
    private String name;
    private int value;
    private List<String> items;
    
    public TrulyPure() {
        this.items = new ArrayList<>();
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public void process() {
        // Only uses java.* types
        System.out.println("Processing: " + name);
    }
}
