package com.largeproj.pkg062;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component062_102 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component062_102 extends BaseComponent {

  public Component062_102(int id) {
    super(id, "com.largeproj.pkg062");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|062-" + "102";
    ctx.record("com.largeproj.pkg062.Component062_102", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component062_102 handling telemetry fan-out";
  }

  public Component062_103 handoff(Component062_103 neighbor) {
    return neighbor;
  }
}
