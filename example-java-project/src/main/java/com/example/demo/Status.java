package com.example.demo;

public enum Status {
    ACTIVE,
    INACTIVE,
    PENDING,
    DELETED;
    
    public boolean isActive() {
        return this == ACTIVE;
    }
}
