package com.largeproj.pkg004;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component004_001 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component004_001 extends BaseComponent {

  public Component004_001(int id) {
    super(id, "com.largeproj.pkg004");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|004-" + "001";
    ctx.record("com.largeproj.pkg004.Component004_001", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component004_001 handling telemetry fan-out";
  }

  public Component004_002 handoff(Component004_002 neighbor) {
    return neighbor;
  }
}
