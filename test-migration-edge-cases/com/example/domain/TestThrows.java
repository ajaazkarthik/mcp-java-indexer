
package com.example.domain;

public class TestThrows {
    public void riskyMethod() throws CustomException {
        throw new CustomException("error");
    }
}
