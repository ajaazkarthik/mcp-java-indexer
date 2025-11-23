package com.largeproj.pkg021;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component021_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component021_120 extends BaseComponent {

  public Component021_120(int id) {
    super(id, "com.largeproj.pkg021");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|021-" + "120";
    ctx.record("com.largeproj.pkg021.Component021_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component021_120 handling telemetry fan-out";
  }

  public Component021_121 handoff(Component021_121 neighbor) {
    return neighbor;
  }
}
