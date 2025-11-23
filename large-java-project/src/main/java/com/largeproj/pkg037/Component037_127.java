package com.largeproj.pkg037;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component037_127 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component037_127 extends BaseComponent {

  public Component037_127(int id) {
    super(id, "com.largeproj.pkg037");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|037-" + "127";
    ctx.record("com.largeproj.pkg037.Component037_127", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component037_127 handling telemetry fan-out";
  }

  public Component037_128 handoff(Component037_128 neighbor) {
    return neighbor;
  }
}
