package com.example.demo;

/**
 * Level 3: Base for domestic animals
 */
public class DomesticAnimal extends Animal {
    private String owner;
    
    public DomesticAnimal(String species, String owner) {
        super(species);
        this.owner = owner;
    }
    
    public String getOwner() {
        return owner;
    }
    
    public void setOwner(String owner) {
        this.owner = owner;
    }
}
