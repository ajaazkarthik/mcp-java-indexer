package com.largeproj.pkg000;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component000_101 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component000_101 extends BaseComponent {

  public Component000_101(int id) {
    super(id, "com.largeproj.pkg000");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|000-" + "101";
    ctx.record("com.largeproj.pkg000.Component000_101", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component000_101 handling telemetry fan-out";
  }

  public Component000_102 handoff(Component000_102 neighbor) {
    return neighbor;
  }
}
