package com.largeproj.pkg021;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component021_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component021_017 extends BaseComponent {

  public Component021_017(int id) {
    super(id, "com.largeproj.pkg021");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|021-" + "017";
    ctx.record("com.largeproj.pkg021.Component021_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component021_017 handling telemetry fan-out";
  }

  public Component021_018 handoff(Component021_018 neighbor) {
    return neighbor;
  }
}
