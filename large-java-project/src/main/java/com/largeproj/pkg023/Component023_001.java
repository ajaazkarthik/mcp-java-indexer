package com.largeproj.pkg023;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component023_001 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component023_001 extends BaseComponent {

  public Component023_001(int id) {
    super(id, "com.largeproj.pkg023");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|023-" + "001";
    ctx.record("com.largeproj.pkg023.Component023_001", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component023_001 handling telemetry fan-out";
  }

  public Component023_002 handoff(Component023_002 neighbor) {
    return neighbor;
  }
}
