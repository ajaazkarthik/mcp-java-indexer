
package com.example.domain;

public class TestTypeBounds<T extends Entity> {  // type bound with same-package type
    private T item;
    
    public <E extends Entity> E process(E input) {
        return input;
    }
}
