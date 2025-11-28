
package com.example.domain;

public class TestStaticAccess {
    public void useStatic() {
        String val = Helper.CONSTANT;   // same-package static field
        Helper.doSomething();           // same-package static method
        Status s = Status.ACTIVE;       // enum constant access
    }
}
