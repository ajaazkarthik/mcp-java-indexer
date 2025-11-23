package com.largeproj.pkg005;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component005_125 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component005_125 extends BaseComponent {

  public Component005_125(int id) {
    super(id, "com.largeproj.pkg005");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|005-" + "125";
    ctx.record("com.largeproj.pkg005.Component005_125", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component005_125 handling telemetry fan-out";
  }

  public Component005_126 handoff(Component005_126 neighbor) {
    return neighbor;
  }
}
