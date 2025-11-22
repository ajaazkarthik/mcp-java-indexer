package com.example.demo.edge;

/**
 * Edge Case 5: Inner Classes with Inheritance
 * Testing static nested classes and their inheritance
 */
public class OuterClass {
    public static final String OUTER_FIELD = "OUTER";
    public static final int OUTER_NUMBER = 999;
    
    public static class BaseInner {
        public static final String BASE_INNER = "BASE_INNER";
        public static final int BASE_VALUE = 111;
    }
    
    /**
     * Inner class extends another inner class
     * Should access fields from parent inner class
     */
    public static class ChildInner extends BaseInner {
        public static final String CHILD_INNER = "CHILD_INNER";
        
        public void testInnerAccess() {
            // Access from parent inner class
            String baseInner = ChildInner.BASE_INNER;   // From BaseInner
            int baseValue = ChildInner.BASE_VALUE;      // From BaseInner
            
            // Access own field
            String childInner = ChildInner.CHILD_INNER;
            
            // Access outer class field (if static nested class)
            String outer = OuterClass.OUTER_FIELD;
            int outerNum = OuterClass.OUTER_NUMBER;
        }
    }
}
