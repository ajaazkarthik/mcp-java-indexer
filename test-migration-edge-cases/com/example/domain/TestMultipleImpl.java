
package com.example.domain;

import java.io.Serializable;

public class TestMultipleImpl implements Entity, Serializable {
    @Override
    public Long getId() { return 1L; }
}
