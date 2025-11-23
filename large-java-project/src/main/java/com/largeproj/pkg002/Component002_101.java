package com.largeproj.pkg002;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component002_101 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component002_101 extends BaseComponent {

  public Component002_101(int id) {
    super(id, "com.largeproj.pkg002");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|002-" + "101";
    ctx.record("com.largeproj.pkg002.Component002_101", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component002_101 handling telemetry fan-out";
  }

  public Component002_102 handoff(Component002_102 neighbor) {
    return neighbor;
  }
}
