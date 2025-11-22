package com.example.demo;

/**
 * Test class that uses Dog.NO field from SqlConstant (4 levels up!)
 */
public class AnimalTest {
    
    public void testDogField() {
        // This should resolve to SqlConstant.NO through the inheritance chain:
        // Dog -> DomesticAnimal -> Animal -> LivingThing -> SqlConstant
        String value = Dog.NO;
        
        if (value.equals("N")) {
            System.out.println("Field resolved correctly!");
        }
    }
    
    public void testDogYes() {
        // Also test Dog.YES
        String yes = Dog.YES;
        System.out.println("YES value: " + yes);
    }
    
    public void testDogUnknown() {
        // And Dog.UNKNOWN
        String unknown = Dog.UNKNOWN;
        System.out.println("UNKNOWN value: " + unknown);
    }
}
