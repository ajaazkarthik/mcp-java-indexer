
package com.test;

public class UserService {
    private UserRepository repo = new UserRepository();
    
    public User createUser(String name) {
        User user = new User(name);
        repo.save(user);
        return user;
    }
}