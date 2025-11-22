package com.example.demo;

/**
 * Level 2: Base for all animals
 */
public class Animal extends LivingThing {
    private String species;
    
    public Animal(String species) {
        super();
        this.species = species;
    }
    
    public String getSpecies() {
        return species;
    }
    
    public void makeSound() {
        System.out.println("Some sound");
    }
}
