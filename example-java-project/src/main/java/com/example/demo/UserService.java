package com.example.demo;

import java.util.List;
import java.util.ArrayList;

/**
 * Sample class to demonstrate the MCP Java Indexer
 */
public class UserService implements IUserService {
    
    private UserRepository repository;
    private AuditLogger logger;
    
    public UserService(UserRepository repository, AuditLogger logger) {
        this.repository = repository;
        this.logger = logger;
    }
    
    public User createUser(String name, String email) {
        logger.log("Creating user: " + name);
        
        User user = new User(name, email);
        User savedUser = repository.save(user);
        
        logger.log("User created: " + savedUser.getId());
        return savedUser;
    }
    
    public User getUser(Long id) {
        logger.log("Fetching user: " + id);
        return repository.findById(id);
    }
    
    public List<User> getAllUsers() {
        logger.log("Fetching all users");
        return repository.findAll();
    }
    
    public void deleteUser(Long id) {
        logger.log("Deleting user: " + id);
        repository.delete(id);
    }
    
    private boolean validateUser(User user) {
        return user.getName() != null && user.getEmail() != null;
    }
}
