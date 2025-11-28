
package com.example.domain;

public class TestInstanceof {
    public boolean isEntity(Object obj) {
        return obj instanceof Entity;   // same-package type in instanceof
    }
}
