package com.largeproj.pkg008;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component008_087 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component008_087 extends BaseComponent {

  public Component008_087(int id) {
    super(id, "com.largeproj.pkg008");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|008-" + "087";
    ctx.record("com.largeproj.pkg008.Component008_087", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component008_087 handling telemetry fan-out";
  }

  public Component008_088 handoff(Component008_088 neighbor) {
    return neighbor;
  }
}
