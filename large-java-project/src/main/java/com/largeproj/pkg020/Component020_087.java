package com.largeproj.pkg020;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component020_087 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component020_087 extends BaseComponent {

  public Component020_087(int id) {
    super(id, "com.largeproj.pkg020");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|020-" + "087";
    ctx.record("com.largeproj.pkg020.Component020_087", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component020_087 handling telemetry fan-out";
  }

  public Component020_088 handoff(Component020_088 neighbor) {
    return neighbor;
  }
}
