
package com.example;

public class UserService {
    private UserRepository repository = new UserRepository();
    
    public void createUser(String name) {
        User user = new User(name);
        repository.save(user);
    }
    
    public User findUser(String name) {
        return repository.findByName(name);
    }
}