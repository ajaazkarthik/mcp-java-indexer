package com.example.demo.legacy;

import java.io.Serializable;
import java.rmi.Remote;
import java.rmi.RemoteException;
import java.util.Observable;
import java.util.Observer;

/**
 * Test case: Old Java technologies (pre-Java 8)
 * Tests: RMI, Serialization, Observer pattern, deprecated APIs
 */
public class LegacyJavaFeatures {
    
    // Serialization (Java 1.1+)
    public static class SerializableEntity implements Serializable {
        private static final long serialVersionUID = 1L;
        public static final String ENTITY_TYPE = "LEGACY";
        
        private String name;
        private int version;
        
        public SerializableEntity(String name, int version) {
            this.name = name;
            this.version = version;
        }
    }
    
    // RMI (Java 1.1+)
    public interface RemoteService extends Remote {
        String REMOTE_VERSION = "1.0";
        int DEFAULT_PORT = 1099;
        
        String processRequest(String request) throws RemoteException;
        int getStatus() throws RemoteException;
    }
    
    // Observer pattern (deprecated in Java 9, but widely used)
    public static class LegacyObservable extends Observable {
        public static final String OBSERVER_TYPE = "LEGACY";
        public static final int MAX_OBSERVERS = 100;
        
        private String state;
        
        public void setState(String state) {
            this.state = state;
            setChanged();
            notifyObservers(state);
        }
        
        public String getState() {
            return state;
        }
    }
    
    public static class LegacyObserver implements Observer {
        public static final String OBSERVER_VERSION = "1.0";
        
        @Override
        public void update(Observable o, Object arg) {
            System.out.println("State changed: " + arg);
        }
    }
    
    // Enumeration (pre-generics style)
    public static class LegacyEnumeration {
        public static final int FIRST = 0;
        public static final int SECOND = 1;
        public static final int THIRD = 2;
        public static final String ENUM_TYPE = "LEGACY";
    }
    
    // Thread-based (old concurrency)
    public static class LegacyThread extends Thread {
        public static final String THREAD_VERSION = "1.0";
        public static final int DEFAULT_PRIORITY = 5;
        
        private volatile boolean running = true;
        
        @Override
        public void run() {
            while (running) {
                // Legacy synchronization
                synchronized (this) {
                    try {
                        wait(1000);
                    } catch (InterruptedException e) {
                        break;
                    }
                }
            }
        }
        
        public void stopThread() {
            running = false;
            synchronized (this) {
                notify();
            }
        }
    }
}
