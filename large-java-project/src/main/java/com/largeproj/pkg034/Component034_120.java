package com.largeproj.pkg034;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component034_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component034_120 extends BaseComponent {

  public Component034_120(int id) {
    super(id, "com.largeproj.pkg034");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|034-" + "120";
    ctx.record("com.largeproj.pkg034.Component034_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component034_120 handling telemetry fan-out";
  }

  public Component034_121 handoff(Component034_121 neighbor) {
    return neighbor;
  }
}
