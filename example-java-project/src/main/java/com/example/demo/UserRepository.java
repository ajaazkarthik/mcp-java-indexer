package com.example.demo;

import java.util.List;

public class UserRepository {
    
    public User save(User user) {
        // Simulate database save
        user.setId(System.currentTimeMillis());
        return user;
    }
    
    public User findById(Long id) {
        // Simulate database lookup
        return new User("Mock User", "mock@example.com");
    }
    
    public List<User> findAll() {
        // Simulate database query
        return List.of(
            new User("Alice", "alice@example.com"),
            new User("Bob", "bob@example.com")
        );
    }
    
    public void delete(Long id) {
        // Simulate database delete
    }
}
