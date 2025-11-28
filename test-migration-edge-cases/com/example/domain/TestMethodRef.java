
package com.example.domain;

import java.util.function.Supplier;

public class TestMethodRef {
    public void useMethodRef() {
        Runnable r = Helper::doSomething;  // same-package type in method ref
    }
}
