package com.example.demo.advanced;

/**
 * Edge Case 2: Generic Service Pattern
 */
public interface Service<T> {
    String SERVICE_NAME = "GenericService";
    int MAX_RETRY_COUNT = 3;
    long RETRY_DELAY_MS = 1000L;
    
    T process(T input);
    void validate(T input);
}
