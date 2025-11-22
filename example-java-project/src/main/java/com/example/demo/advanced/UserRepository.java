package com.example.demo.advanced;

import java.util.List;
import java.util.ArrayList;

/**
 * Edge Case 1: Concrete implementation 3 levels deep
 * Should access BaseRepository.DEFAULT_BATCH_SIZE
 */
public class UserRepository extends AbstractCrudRepository<String> {
    
    @Override
    public void save(String entity) {
        // Should access field from 2 levels up
        int batchSize = UserRepository.DEFAULT_BATCH_SIZE;
        long timeout = UserRepository.DEFAULT_TIMEOUT_MS;
        String schema = UserRepository.DEFAULT_SCHEMA;
        System.out.println("Saving with batch size: " + batchSize);
    }
    
    @Override
    public String findById(Long id) {
        return "User" + id;
    }
    
    @Override
    public void delete(String entity) {
        logOperation("DELETE");
    }
    
    @Override
    public List<String> findAll() {
        return new ArrayList<>();
    }
    
    @Override
    public void saveAll(List<String> entities) {
        // Access from direct parent
        boolean caching = UserRepository.ENABLE_CACHING;
        String version = UserRepository.CRUD_VERSION;
    }
}
