package com.largeproj.pkg000;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component000_087 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component000_087 extends BaseComponent {

  public Component000_087(int id) {
    super(id, "com.largeproj.pkg000");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|000-" + "087";
    ctx.record("com.largeproj.pkg000.Component000_087", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component000_087 handling telemetry fan-out";
  }

  public Component000_088 handoff(Component000_088 neighbor) {
    return neighbor;
  }
}
