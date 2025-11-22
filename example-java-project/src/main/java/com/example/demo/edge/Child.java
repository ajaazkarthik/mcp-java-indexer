package com.example.demo.edge;

/**
 * Edge Case 2: Diamond-like structure
 * Child extends MiddleA and implements MiddleB
 * Should access Base.BASE_VALUE through MiddleA
 */
public class Child extends MiddleA implements MiddleB {
    
    public void testAccess() {
        // Access from grandparent through class hierarchy
        String baseValue = Child.BASE_VALUE;      // From Base through MiddleA
        int baseNumber = Child.BASE_NUMBER;       // From Base through MiddleA
        
        // Access from direct parent
        String middleA = Child.MIDDLE_A;          // From MiddleA
        
        // Access from interface
        String middleB = Child.MIDDLE_B;          // From MiddleB
        String shared = Child.SHARED_CONSTANT;    // From MiddleB
    }
}
