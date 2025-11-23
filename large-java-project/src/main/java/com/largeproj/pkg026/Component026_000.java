package com.largeproj.pkg026;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component026_000 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component026_000 extends BaseComponent {

  public Component026_000(int id) {
    super(id, "com.largeproj.pkg026");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|026-" + "000";
    ctx.record("com.largeproj.pkg026.Component026_000", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component026_000 handling telemetry fan-out";
  }

  public Component026_001 handoff(Component026_001 neighbor) {
    return neighbor;
  }
}
