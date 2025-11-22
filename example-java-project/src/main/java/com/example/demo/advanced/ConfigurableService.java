package com.example.demo.advanced;

/**
 * Edge Case 4: Should access interface default method constants
 */
public class ConfigurableService implements Configurable {
    
    public void configure() {
        // Access interface constants
        String key = ConfigurableService.CONFIG_KEY;
        int timeout = ConfigurableService.CONFIG_TIMEOUT;
        boolean enabled = ConfigurableService.CONFIG_ENABLED;
        
        // Call default methods
        String value = getConfigValue();
        int t = getTimeout();
    }
}
