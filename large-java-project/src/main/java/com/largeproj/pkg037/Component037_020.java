package com.largeproj.pkg037;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component037_020 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component037_020 extends BaseComponent {

  public Component037_020(int id) {
    super(id, "com.largeproj.pkg037");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|037-" + "020";
    ctx.record("com.largeproj.pkg037.Component037_020", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component037_020 handling telemetry fan-out";
  }

  public Component037_021 handoff(Component037_021 neighbor) {
    return neighbor;
  }
}
