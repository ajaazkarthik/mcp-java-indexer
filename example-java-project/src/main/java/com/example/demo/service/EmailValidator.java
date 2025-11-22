package com.example.demo.service;

import com.example.demo.util.AbstractValidator;

/**
 * Edge Case 6: Cross-package - service extends util class
 * Should access AbstractValidator.MIN_LENGTH from different package
 */
public class EmailValidator extends AbstractValidator {
    public static final String EMAIL_PATTERN = "^[A-Za-z0-9+_.-]+@(.+)$";
    
    @Override
    public boolean validate(Object obj) {
        String email = (String) obj;
        
        // Access parent constants from different package
        int minLen = EmailValidator.MIN_LENGTH;
        int maxLen = EmailValidator.MAX_LENGTH;
        String failMsg = EmailValidator.VALIDATION_FAILED;
        String successMsg = EmailValidator.VALIDATION_SUCCESS;
        
        if (email.length() < minLen || email.length() > maxLen) {
            logValidation(failMsg);
            return false;
        }
        
        logValidation(successMsg);
        return true;
    }
}
