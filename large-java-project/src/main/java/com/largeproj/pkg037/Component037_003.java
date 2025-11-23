package com.largeproj.pkg037;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component037_003 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component037_003 extends BaseComponent {

  public Component037_003(int id) {
    super(id, "com.largeproj.pkg037");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|037-" + "003";
    ctx.record("com.largeproj.pkg037.Component037_003", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component037_003 handling telemetry fan-out";
  }

  public Component037_004 handoff(Component037_004 neighbor) {
    return neighbor;
  }
}
