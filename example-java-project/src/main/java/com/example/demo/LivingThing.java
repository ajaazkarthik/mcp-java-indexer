package com.example.demo;

/**
 * Level 1: Base for all living things
 */
public class LivingThing extends SqlConstant {
    private boolean isAlive;
    
    public LivingThing() {
        this.isAlive = true;
    }
    
    public boolean isAlive() {
        return isAlive;
    }
}
