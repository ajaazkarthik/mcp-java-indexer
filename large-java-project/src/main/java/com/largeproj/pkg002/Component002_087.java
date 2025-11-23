package com.largeproj.pkg002;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component002_087 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component002_087 extends BaseComponent {

  public Component002_087(int id) {
    super(id, "com.largeproj.pkg002");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|002-" + "087";
    ctx.record("com.largeproj.pkg002.Component002_087", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component002_087 handling telemetry fan-out";
  }

  public Component002_088 handoff(Component002_088 neighbor) {
    return neighbor;
  }
}
