package com.example.demo.advanced;

public abstract class AbstractHandler extends Handler {
    public static final String PROCESSING_STATUS = "PROCESSING";
    public static final String COMPLETED_STATUS = "COMPLETED";
    
    protected void logHandling(String message) {
        System.out.println(message);
    }
    
    protected boolean canHandle(String request) {
        return request != null && !request.isEmpty();
    }
}
