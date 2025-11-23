package com.largeproj.core;

import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class ComponentContextImpl implements ComponentContext {
  private final ConcurrentHashMap<String, Integer> metrics = new ConcurrentHashMap<>();

  @Override
  public void record(String componentName, int size) {
    metrics.merge(componentName, size, Integer::sum);
  }

  @Override
  public Map<String, Integer> snapshot() {
    return Collections.unmodifiableMap(metrics);
  }

  public int getTotalRecorded() {
    return metrics.values().stream().mapToInt(Integer::intValue).sum();
  }
}
