package com.largeproj.pkg026;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component026_102 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component026_102 extends BaseComponent {

  public Component026_102(int id) {
    super(id, "com.largeproj.pkg026");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|026-" + "102";
    ctx.record("com.largeproj.pkg026.Component026_102", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component026_102 handling telemetry fan-out";
  }

  public Component026_103 handoff(Component026_103 neighbor) {
    return neighbor;
  }
}
