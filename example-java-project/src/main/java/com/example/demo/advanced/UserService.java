package com.example.demo.advanced;

/**
 * Edge Case 2: Generic implementation with bounded types
 * Should access Service.MAX_RETRY_COUNT through UserService
 */
public class UserService extends AbstractService<String> {
    
    @Override
    public String process(String input) {
        // Access from interface 2 levels up
        int maxRetries = UserService.MAX_RETRY_COUNT;
        long retryDelay = UserService.RETRY_DELAY_MS;
        String serviceName = UserService.SERVICE_NAME;
        
        // Access from abstract parent
        String version = UserService.IMPL_VERSION;
        boolean debug = UserService.DEBUG_MODE;
        
        log("Processing: " + input);
        return input.toUpperCase();
    }
}
