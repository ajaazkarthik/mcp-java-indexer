package com.example.demo.util;

/**
 * Edge Case 6: Cross-package inheritance
 * Base class in util package
 */
public abstract class AbstractValidator {
    public static final String VALIDATION_FAILED = "Validation failed";
    public static final String VALIDATION_SUCCESS = "Validation success";
    public static final int MIN_LENGTH = 3;
    public static final int MAX_LENGTH = 255;
    
    public abstract boolean validate(Object obj);
    
    protected void logValidation(String message) {
        System.out.println(message);
    }
}
