package com.largeproj.pkg036;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component036_004 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component036_004 extends BaseComponent {

  public Component036_004(int id) {
    super(id, "com.largeproj.pkg036");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|036-" + "004";
    ctx.record("com.largeproj.pkg036.Component036_004", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component036_004 handling telemetry fan-out";
  }

  public Component036_005 handoff(Component036_005 neighbor) {
    return neighbor;
  }
}
