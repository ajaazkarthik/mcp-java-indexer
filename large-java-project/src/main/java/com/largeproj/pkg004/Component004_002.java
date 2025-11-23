package com.largeproj.pkg004;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component004_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component004_002 extends BaseComponent {

  public Component004_002(int id) {
    super(id, "com.largeproj.pkg004");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|004-" + "002";
    ctx.record("com.largeproj.pkg004.Component004_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component004_002 handling telemetry fan-out";
  }

  public Component004_003 handoff(Component004_003 neighbor) {
    return neighbor;
  }
}
