package com.example.demo.advanced;

/**
 * Edge Case 1: Abstract Repository Pattern
 * Common in Spring/JPA applications
 */
public abstract class BaseRepository<T> {
    public static final String DEFAULT_SCHEMA = "public";
    public static final int DEFAULT_BATCH_SIZE = 100;
    public static final long DEFAULT_TIMEOUT_MS = 5000L;
    
    protected String tableName;
    
    public abstract void save(T entity);
    public abstract T findById(Long id);
    public abstract void delete(T entity);
}
