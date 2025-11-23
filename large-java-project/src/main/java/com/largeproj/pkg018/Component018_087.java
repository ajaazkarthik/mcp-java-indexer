package com.largeproj.pkg018;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component018_087 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component018_087 extends BaseComponent {

  public Component018_087(int id) {
    super(id, "com.largeproj.pkg018");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|018-" + "087";
    ctx.record("com.largeproj.pkg018.Component018_087", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component018_087 handling telemetry fan-out";
  }

  public Component018_088 handoff(Component018_088 neighbor) {
    return neighbor;
  }
}
