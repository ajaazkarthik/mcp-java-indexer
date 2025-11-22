package com.example.demo;

public class Employee extends Person {
    private String employeeId;
    private String department;
    
    public static final String NO = "N/A";
    public static final int MAX_EMPLOYEES = 1000;
    
    public Employee(String name, String employeeId) {
        super(name);
        this.employeeId = employeeId;
    }
    
    public String getEmployeeId() {
        return employeeId;
    }
    
    public void setDepartment(String department) {
        this.department = department;
    }
    
    public String getDepartment() {
        return department;
    }
}
