package com.largeproj.pkg037;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component037_102 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component037_102 extends BaseComponent {

  public Component037_102(int id) {
    super(id, "com.largeproj.pkg037");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|037-" + "102";
    ctx.record("com.largeproj.pkg037.Component037_102", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component037_102 handling telemetry fan-out";
  }

  public Component037_103 handoff(Component037_103 neighbor) {
    return neighbor;
  }
}
