
package com.test;

public class UserService {
    private UserRepository repo = new UserRepository();
    
    public User createUser(String name) {
        User user = new User(name);
        repo.save(user);
        return user;
    }
    
    public User findUser(String name) {
        return repo.findByName(name);
    }
    
    public void deleteUser(String name) {
        repo.delete(name);
    }
}