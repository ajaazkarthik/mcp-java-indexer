package com.example.demo.exception;

/**
 * Edge Case 8: Custom exception extends BaseException
 * Should access BaseException.ERROR_PREFIX
 */
public class ValidationException extends BaseException {
    public static final int VALIDATION_ERROR_CODE = 4001;
    public static final String VALIDATION_TYPE = "VALIDATION";
    
    private String fieldName;
    
    public ValidationException(String message, String fieldName) {
        super(message);
        this.fieldName = fieldName;
        this.errorCode = VALIDATION_ERROR_CODE;
    }
    
    public String getFullErrorCode() {
        // Access parent exception constants
        String prefix = ValidationException.ERROR_PREFIX;
        int defaultCode = ValidationException.DEFAULT_ERROR_CODE;
        boolean shouldLog = ValidationException.LOG_EXCEPTIONS;
        
        return prefix + errorCode;
    }
}
