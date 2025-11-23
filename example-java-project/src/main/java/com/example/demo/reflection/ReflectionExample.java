package com.example.demo.reflection;

import java.lang.reflect.Method;
import java.lang.reflect.Field;
import java.lang.reflect.Constructor;

/**
 * Test case: Classic Java Reflection API usage
 * Tests if indexer can track reflection-related code
 */
public class ReflectionExample {
    public static final String REFLECTION_VERSION = "1.0";
    public static final int MAX_DEPTH = 10;
    
    private String className;
    private Class<?> targetClass;
    
    public ReflectionExample(String className) throws ClassNotFoundException {
        this.className = className;
        this.targetClass = Class.forName(className);
    }
    
    /**
     * Get all methods using reflection
     */
    public Method[] getAllMethods() {
        return targetClass.getDeclaredMethods();
    }
    
    /**
     * Get all fields using reflection
     */
    public Field[] getAllFields() {
        return targetClass.getDeclaredFields();
    }
    
    /**
     * Get all constructors using reflection
     */
    public Constructor<?>[] getAllConstructors() {
        return targetClass.getDeclaredConstructors();
    }
    
    /**
     * Invoke method dynamically
     */
    public Object invokeMethod(String methodName, Object instance, Object... args) 
            throws Exception {
        Method method = targetClass.getMethod(methodName, getParameterTypes(args));
        method.setAccessible(true);
        return method.invoke(instance, args);
    }
    
    /**
     * Get field value using reflection
     */
    public Object getFieldValue(String fieldName, Object instance) throws Exception {
        Field field = targetClass.getDeclaredField(fieldName);
        field.setAccessible(true);
        return field.get(instance);
    }
    
    /**
     * Set field value using reflection
     */
    public void setFieldValue(String fieldName, Object instance, Object value) 
            throws Exception {
        Field field = targetClass.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(instance, value);
    }
    
    /**
     * Create instance using reflection
     */
    public Object createInstance(Object... args) throws Exception {
        Constructor<?> constructor = targetClass.getConstructor(getParameterTypes(args));
        return constructor.newInstance(args);
    }
    
    private Class<?>[] getParameterTypes(Object... args) {
        Class<?>[] types = new Class<?>[args.length];
        for (int i = 0; i < args.length; i++) {
            types[i] = args[i].getClass();
        }
        return types;
    }
}
