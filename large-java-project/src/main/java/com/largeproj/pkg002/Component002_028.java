package com.largeproj.pkg002;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component002_028 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component002_028 extends BaseComponent {

  public Component002_028(int id) {
    super(id, "com.largeproj.pkg002");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|002-" + "028";
    ctx.record("com.largeproj.pkg002.Component002_028", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component002_028 handling telemetry fan-out";
  }

  public Component002_029 handoff(Component002_029 neighbor) {
    return neighbor;
  }
}
