package com.largeproj.pkg036;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component036_015 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component036_015 extends BaseComponent {

  public Component036_015(int id) {
    super(id, "com.largeproj.pkg036");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|036-" + "015";
    ctx.record("com.largeproj.pkg036.Component036_015", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component036_015 handling telemetry fan-out";
  }

  public Component036_016 handoff(Component036_016 neighbor) {
    return neighbor;
  }
}
