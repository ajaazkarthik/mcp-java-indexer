package com.largeproj.pkg036;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component036_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component036_002 extends BaseComponent {

  public Component036_002(int id) {
    super(id, "com.largeproj.pkg036");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|036-" + "002";
    ctx.record("com.largeproj.pkg036.Component036_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component036_002 handling telemetry fan-out";
  }

  public Component036_003 handoff(Component036_003 neighbor) {
    return neighbor;
  }
}
