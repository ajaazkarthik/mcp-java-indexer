package com.example.demo.advanced;

/**
 * Edge Case 3: 5 levels deep - should access Level1.L1_CONSTANT
 */
public class Level5 extends Level4 {
    public static final String L5_CONSTANT = "LEVEL5";
    public static final int L5_VALUE = 5;
    
    @Override
    public void method() {
        // Access all levels
        String l1 = Level5.L1_CONSTANT;
        String l2 = Level5.L2_CONSTANT;
        String l3 = Level5.L3_CONSTANT;
        String l4 = Level5.L4_CONSTANT;
        
        int v1 = Level5.L1_VALUE;
        int v5 = Level5.L5_VALUE;
        
        System.out.println("Level5");
    }
}
