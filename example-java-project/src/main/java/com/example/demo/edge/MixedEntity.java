package com.example.demo.edge;

/**
 * Edge Case 3: Extends class and implements interface
 * Should access static fields from both
 */
public class MixedEntity extends BaseEntity implements Identifiable {
    
    public MixedEntity(String name) {
        super(name);
    }
    
    public void testMixedAccess() {
        // From parent class
        String entityType = MixedEntity.ENTITY_TYPE;  // From BaseEntity
        int defaultId = MixedEntity.DEFAULT_ID;       // From BaseEntity
        
        // From interface
        String prefix = MixedEntity.ID_PREFIX;        // From Identifiable
        String suffix = MixedEntity.ID_SUFFIX;        // From Identifiable
        int maxLen = MixedEntity.MAX_ID_LENGTH;       // From Identifiable
    }
}
