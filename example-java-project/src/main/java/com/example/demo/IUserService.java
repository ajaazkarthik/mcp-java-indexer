package com.example.demo;

public interface IUserService {
    User createUser(String name, String email);
    User getUser(Long id);
    void deleteUser(Long id);
}
