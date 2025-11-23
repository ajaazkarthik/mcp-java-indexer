package com.largeproj.pkg062;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component062_001 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component062_001 extends BaseComponent {

  public Component062_001(int id) {
    super(id, "com.largeproj.pkg062");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|062-" + "001";
    ctx.record("com.largeproj.pkg062.Component062_001", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component062_001 handling telemetry fan-out";
  }

  public Component062_002 handoff(Component062_002 neighbor) {
    return neighbor;
  }
}
