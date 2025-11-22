package com.example.demo.edge;

/**
 * Edge Case 1: ServiceManager implements 3 interfaces
 * Should be able to access fields from all interfaces
 */
public class ServiceManager implements Auditable, Loggable, Trackable {
    
    public void logActivity() {
        // Access fields from all 3 interfaces
        String auditFlag = ServiceManager.AUDIT_ENABLED;  // From Auditable
        String logLevel = ServiceManager.LOG_LEVEL_INFO;   // From Loggable
        int maxSize = ServiceManager.MAX_TRACK_SIZE;       // From Trackable
        
        System.out.println("Audit: " + auditFlag + ", Log: " + logLevel + ", Max: " + maxSize);
    }
}
