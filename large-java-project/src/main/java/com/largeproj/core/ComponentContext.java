package com.largeproj.core;

import java.util.Map;

public interface ComponentContext {
  void record(String componentName, int size);
  Map<String, Integer> snapshot();
}
