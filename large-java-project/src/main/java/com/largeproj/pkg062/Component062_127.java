package com.largeproj.pkg062;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component062_127 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component062_127 extends BaseComponent {

  public Component062_127(int id) {
    super(id, "com.largeproj.pkg062");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|062-" + "127";
    ctx.record("com.largeproj.pkg062.Component062_127", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component062_127 handling telemetry fan-out";
  }

  public Component062_128 handoff(Component062_128 neighbor) {
    return neighbor;
  }
}
