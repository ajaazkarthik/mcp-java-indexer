
package com.example;

import java.util.HashMap;
import java.util.Map;

public class UserRepository {
    private Map<String, User> users = new HashMap<>();
    
    public void save(User user) {
        users.put(user.getName(), user);
    }
    
    public User findByName(String name) {
        return users.get(name);
    }
}