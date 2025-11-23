package com.largeproj.core;

public interface TelemetryService {
  String streamMetrics(ComponentContext ctx);
  String analyticsReport(ComponentContext ctx);
}
