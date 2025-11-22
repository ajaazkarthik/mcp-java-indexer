package com.example.demo.exception;

/**
 * Edge Case 8: Exception hierarchy
 */
public class BaseException extends RuntimeException {
    public static final String ERROR_PREFIX = "ERR_";
    public static final int DEFAULT_ERROR_CODE = 1000;
    public static final boolean LOG_EXCEPTIONS = true;
    
    protected int errorCode;
    
    public BaseException(String message) {
        super(message);
        this.errorCode = DEFAULT_ERROR_CODE;
    }
    
    public int getErrorCode() {
        return errorCode;
    }
}
