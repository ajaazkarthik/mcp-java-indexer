package com.largeproj.pkg004;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component004_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component004_120 extends BaseComponent {

  public Component004_120(int id) {
    super(id, "com.largeproj.pkg004");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|004-" + "120";
    ctx.record("com.largeproj.pkg004.Component004_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component004_120 handling telemetry fan-out";
  }

  public Component004_121 handoff(Component004_121 neighbor) {
    return neighbor;
  }
}
