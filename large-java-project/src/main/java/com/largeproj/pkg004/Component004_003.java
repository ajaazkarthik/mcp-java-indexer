package com.largeproj.pkg004;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component004_003 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component004_003 extends BaseComponent {

  public Component004_003(int id) {
    super(id, "com.largeproj.pkg004");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|004-" + "003";
    ctx.record("com.largeproj.pkg004.Component004_003", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component004_003 handling telemetry fan-out";
  }

  public Component004_004 handoff(Component004_004 neighbor) {
    return neighbor;
  }
}
