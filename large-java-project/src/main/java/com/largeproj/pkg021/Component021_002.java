package com.largeproj.pkg021;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component021_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component021_002 extends BaseComponent {

  public Component021_002(int id) {
    super(id, "com.largeproj.pkg021");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|021-" + "002";
    ctx.record("com.largeproj.pkg021.Component021_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component021_002 handling telemetry fan-out";
  }

  public Component021_003 handoff(Component021_003 neighbor) {
    return neighbor;
  }
}
