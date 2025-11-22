package com.example.demo.advanced;

/**
 * Edge Case 10: Mixin-style multiple interface implementation
 * Class implements 5+ interfaces with potentially overlapping constants
 */
public interface Serializable {
    String SERIAL_VERSION = "1.0";
}

interface Cloneable {
    String CLONE_STRATEGY = "DEEP";
}

interface Comparable {
    int COMPARE_EQUAL = 0;
    int COMPARE_LESS = -1;
    int COMPARE_GREATER = 1;
}

interface Cacheable {
    String CACHE_KEY_PREFIX = "cache_";
    long CACHE_TTL_MS = 60000L;
}

interface Auditable {
    String AUDIT_USER = "system";
    boolean AUDIT_ENABLED = true;
}

/**
 * ComplexEntity implements 5 interfaces - mixin pattern
 * Should access constants from all 5 interfaces
 */
public class ComplexEntity implements Serializable, Cloneable, Comparable, Cacheable, Auditable {
    
    private String data;
    
    public void displayMetadata() {
        // From Serializable
        String version = ComplexEntity.SERIAL_VERSION;
        
        // From Cloneable
        String cloneStrategy = ComplexEntity.CLONE_STRATEGY;
        
        // From Comparable
        int equal = ComplexEntity.COMPARE_EQUAL;
        int less = ComplexEntity.COMPARE_LESS;
        int greater = ComplexEntity.COMPARE_GREATER;
        
        // From Cacheable
        String cachePrefix = ComplexEntity.CACHE_KEY_PREFIX;
        long cacheTTL = ComplexEntity.CACHE_TTL_MS;
        
        // From Auditable
        String auditUser = ComplexEntity.AUDIT_USER;
        boolean auditEnabled = ComplexEntity.AUDIT_ENABLED;
        
        System.out.println("Metadata loaded from 5 interfaces");
    }
}
