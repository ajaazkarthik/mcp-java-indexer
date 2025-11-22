package com.example.demo.advanced;

public abstract class AbstractService<T> implements Service<T> {
    public static final String IMPL_VERSION = "1.5";
    public static final boolean DEBUG_MODE = false;
    
    @Override
    public void validate(T input) {
        if (input == null) {
            throw new IllegalArgumentException("Input cannot be null");
        }
    }
    
    protected void log(String message) {
        System.out.println(message);
    }
}
