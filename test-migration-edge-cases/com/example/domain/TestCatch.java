
package com.example.domain;

public class TestCatch {
    public void handleError() {
        try {
            // some code
        } catch (CustomException e) {   // same-package exception
            e.printStackTrace();
        }
    }
}
