package com.example.demo.edge;

/**
 * Edge Case 3: Mixed Class and Interface Hierarchy
 * BaseEntity has fields, Identifiable interface has fields
 * MixedEntity extends class AND implements interface
 */
public class BaseEntity {
    public static final String ENTITY_TYPE = "ENTITY";
    public static final int DEFAULT_ID = -1;
    
    protected String name;
    
    public BaseEntity(String name) {
        this.name = name;
    }
}
