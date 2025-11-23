package com.largeproj.pkg004;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component004_013 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component004_013 extends BaseComponent {

  public Component004_013(int id) {
    super(id, "com.largeproj.pkg004");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|004-" + "013";
    ctx.record("com.largeproj.pkg004.Component004_013", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component004_013 handling telemetry fan-out";
  }

  public Component004_014 handoff(Component004_014 neighbor) {
    return neighbor;
  }
}
