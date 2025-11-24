
package com.test;

public class Main {
    public static void main(String[] args) {
        UserService service = new UserService();
        User user = service.createUser("Alice");
        System.out.println("Created: " + user.getName());
    }
}