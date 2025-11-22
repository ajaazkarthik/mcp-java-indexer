package com.example.demo.model;

/**
 * Edge Case 5: Annotation inheritance (simulated with fields)
 * Base entity class that other entities extend
 */
public abstract class BaseEntity {
    public static final String TABLE_PREFIX = "tbl_";
    public static final String ID_COLUMN = "id";
    public static final String CREATED_AT = "created_at";
    public static final String UPDATED_AT = "updated_at";
    
    protected Long id;
    protected java.util.Date createdAt;
    protected java.util.Date updatedAt;
    
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
}
