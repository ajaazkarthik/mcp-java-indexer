package com.example.demo.advanced;

/**
 * Edge Case 9: Chain of Responsibility pattern
 */
public abstract class Handler {
    public static final String HANDLER_TYPE = "BASE_HANDLER";
    public static final int MAX_CHAIN_LENGTH = 10;
    public static final boolean LOG_CHAIN = true;
    
    protected Handler nextHandler;
    
    public void setNext(Handler handler) {
        this.nextHandler = handler;
    }
    
    public abstract void handle(String request);
}
