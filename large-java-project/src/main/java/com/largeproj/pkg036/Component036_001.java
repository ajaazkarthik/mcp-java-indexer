package com.largeproj.pkg036;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component036_001 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component036_001 extends BaseComponent {

  public Component036_001(int id) {
    super(id, "com.largeproj.pkg036");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|036-" + "001";
    ctx.record("com.largeproj.pkg036.Component036_001", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component036_001 handling telemetry fan-out";
  }

  public Component036_002 handoff(Component036_002 neighbor) {
    return neighbor;
  }
}
