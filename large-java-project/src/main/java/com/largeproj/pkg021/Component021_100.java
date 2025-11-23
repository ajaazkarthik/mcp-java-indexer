package com.largeproj.pkg021;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component021_100 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component021_100 extends BaseComponent {

  public Component021_100(int id) {
    super(id, "com.largeproj.pkg021");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|021-" + "100";
    ctx.record("com.largeproj.pkg021.Component021_100", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component021_100 handling telemetry fan-out";
  }

  public Component021_101 handoff(Component021_101 neighbor) {
    return neighbor;
  }
}
