package com.largeproj.pkg000;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component000_125 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component000_125 extends BaseComponent {

  public Component000_125(int id) {
    super(id, "com.largeproj.pkg000");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|000-" + "125";
    ctx.record("com.largeproj.pkg000.Component000_125", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component000_125 handling telemetry fan-out";
  }

  public Component000_126 handoff(Component000_126 neighbor) {
    return neighbor;
  }
}
