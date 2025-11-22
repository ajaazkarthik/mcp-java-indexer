package com.example.demo.edge;

/**
 * Edge Case 4: Enum implementing interface
 * Should be able to access interface constants
 */
public enum HttpStatus implements StatusCode {
    OK(SUCCESS_CODE),
    ERROR(ERROR_CODE),
    NOT_FOUND(NOT_FOUND_CODE);
    
    private final int code;
    
    HttpStatus(int code) {
        this.code = code;
    }
    
    public int getCode() {
        return code;
    }
    
    public static void testEnumAccess() {
        // Enum should access interface constants
        int success = HttpStatus.SUCCESS_CODE;     // From StatusCode interface
        int error = HttpStatus.ERROR_CODE;         // From StatusCode interface
        int notFound = HttpStatus.NOT_FOUND_CODE;  // From StatusCode interface
    }
}
