package com.largeproj.pkg026;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component026_003 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component026_003 extends BaseComponent {

  public Component026_003(int id) {
    super(id, "com.largeproj.pkg026");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|026-" + "003";
    ctx.record("com.largeproj.pkg026.Component026_003", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component026_003 handling telemetry fan-out";
  }

  public Component026_004 handoff(Component026_004 neighbor) {
    return neighbor;
  }
}
