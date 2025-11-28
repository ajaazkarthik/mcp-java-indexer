
package com.example.domain;

import java.util.List;
import java.util.Map;

public class TestGenerics {
    private List<Entity> entities;              // generic with same-package type
    private Map<String, Status> statusMap;      // generic value type
    
    public List<Entity> getEntities() {
        return entities;
    }
}
