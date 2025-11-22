package com.example.demo.advanced;

/**
 * Edge Case 7: Fluent builder with method chaining
 * Should access BaseBuilder.VALIDATE_ON_BUILD
 */
public class UserBuilder extends BaseBuilder<String> {
    public static final int DEFAULT_AGE = 18;
    public static final String DEFAULT_ROLE = "USER";
    
    private String name;
    private int age;
    
    public UserBuilder withName(String name) {
        this.name = name;
        return this;
    }
    
    public UserBuilder withAge(int age) {
        this.age = age;
        return this;
    }
    
    @Override
    public String build() {
        // Access parent builder constants
        String version = UserBuilder.BUILDER_VERSION;
        boolean validate = UserBuilder.VALIDATE_ON_BUILD;
        
        if (validate) {
            validateBuild();
        }
        
        return name + ":" + age;
    }
}
