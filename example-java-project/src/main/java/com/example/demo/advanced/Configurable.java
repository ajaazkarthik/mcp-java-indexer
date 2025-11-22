package com.example.demo.advanced;

/**
 * Edge Case 4: Interface with default methods (Java 8+)
 */
public interface Configurable {
    String CONFIG_KEY = "default.config";
    int CONFIG_TIMEOUT = 30;
    boolean CONFIG_ENABLED = true;
    
    default String getConfigValue() {
        return CONFIG_KEY;
    }
    
    default int getTimeout() {
        return CONFIG_TIMEOUT;
    }
}
