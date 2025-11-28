
package com.example.domain;

public class TestCast {
    public Entity castToEntity(Object obj) {
        return (Entity) obj;   // same-package type in cast
    }
}
