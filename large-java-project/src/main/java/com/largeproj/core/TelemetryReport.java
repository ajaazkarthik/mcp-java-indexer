package com.largeproj.core;

import java.time.Instant;
import java.util.Map;

public record TelemetryReport(String packageName, String payload, Instant timestamp, Map<String, Integer> metrics) {
  public String summary() {
    return packageName + "@" + timestamp + " -> " + metrics.size() + " metrics";
  }
}
