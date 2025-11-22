package com.example.demo;

/**
 * Level 4: Dog class - deepest level in hierarchy
 */
public class Dog extends DomesticAnimal {
    private String breed;
    
    public Dog(String breed, String owner) {
        super("Canine", owner);
        this.breed = breed;
    }
    
    @Override
    public void makeSound() {
        System.out.println("Woof!");
    }
    
    public String getBreed() {
        return breed;
    }
    
    public void setBreed(String breed) {
        this.breed = breed;
    }
}
