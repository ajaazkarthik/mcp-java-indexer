package com.example.demo.advanced;

/**
 * Edge Case 9: Concrete handler in chain
 * Should access Handler.MAX_CHAIN_LENGTH through 2 levels
 */
public class AuthenticationHandler extends AbstractHandler {
    public static final String AUTH_REQUIRED = "AUTH_REQUIRED";
    
    @Override
    public void handle(String request) {
        // Access from 2 levels up
        int maxChain = AuthenticationHandler.MAX_CHAIN_LENGTH;
        boolean shouldLog = AuthenticationHandler.LOG_CHAIN;
        String handlerType = AuthenticationHandler.HANDLER_TYPE;
        
        // Access from direct parent
        String processing = AuthenticationHandler.PROCESSING_STATUS;
        String completed = AuthenticationHandler.COMPLETED_STATUS;
        
        if (canHandle(request)) {
            logHandling("Authenticating: " + request);
            
            if (nextHandler != null) {
                nextHandler.handle(request);
            }
        }
    }
}
