package com.largeproj.pkg062;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component062_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component062_120 extends BaseComponent {

  public Component062_120(int id) {
    super(id, "com.largeproj.pkg062");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|062-" + "120";
    ctx.record("com.largeproj.pkg062.Component062_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component062_120 handling telemetry fan-out";
  }

  public Component062_121 handoff(Component062_121 neighbor) {
    return neighbor;
  }
}
