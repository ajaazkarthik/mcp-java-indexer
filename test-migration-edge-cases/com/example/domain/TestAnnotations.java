
package com.example.domain;

@Auditable("test")   // same-package annotation
public class TestAnnotations {
    @Auditable
    private String field;
}
