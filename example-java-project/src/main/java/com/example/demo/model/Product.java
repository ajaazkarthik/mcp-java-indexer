package com.example.demo.model;

/**
 * Edge Case 5: Subclass should access BaseEntity constants
 */
public class Product extends BaseEntity {
    public static final String PRODUCT_TABLE = "products";
    public static final String NAME_COLUMN = "product_name";
    
    private String name;
    private Double price;
    
    public void printMetadata() {
        // Access parent entity metadata
        String prefix = Product.TABLE_PREFIX;
        String idCol = Product.ID_COLUMN;
        String createdCol = Product.CREATED_AT;
        String updatedCol = Product.UPDATED_AT;
        
        System.out.println("Table: " + prefix + PRODUCT_TABLE);
    }
}
