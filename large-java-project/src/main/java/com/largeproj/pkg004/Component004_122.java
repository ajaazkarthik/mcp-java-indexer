package com.largeproj.pkg004;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component004_122 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component004_122 extends BaseComponent {

  public Component004_122(int id) {
    super(id, "com.largeproj.pkg004");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|004-" + "122";
    ctx.record("com.largeproj.pkg004.Component004_122", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component004_122 handling telemetry fan-out";
  }

  public Component004_123 handoff(Component004_123 neighbor) {
    return neighbor;
  }
}
