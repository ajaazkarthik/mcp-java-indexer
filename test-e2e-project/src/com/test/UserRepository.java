
package com.test;

import java.util.HashMap;
import java.util.Map;

public class UserRepository {
    private Map<String, User> storage = new HashMap<>();
    
    public void save(User user) {
        storage.put(user.getName(), user);
    }
    
    public User findByName(String name) {
        return storage.get(name);
    }
    
    public void delete(String name) {
        storage.remove(name);
    }
}