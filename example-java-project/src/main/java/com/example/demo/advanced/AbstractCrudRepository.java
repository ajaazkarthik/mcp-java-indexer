package com.example.demo.advanced;

import java.util.List;

public abstract class AbstractCrudRepository<T> extends BaseRepository<T> {
    public static final String CRUD_VERSION = "2.0";
    public static final boolean ENABLE_CACHING = true;
    
    public abstract List<T> findAll();
    public abstract void saveAll(List<T> entities);
    
    protected void logOperation(String operation) {
        System.out.println(operation);
    }
}
