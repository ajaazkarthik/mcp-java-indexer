package com.largeproj.pkg002;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component002_129 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component002_129 extends BaseComponent {

  public Component002_129(int id) {
    super(id, "com.largeproj.pkg002");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|002-" + "129";
    ctx.record("com.largeproj.pkg002.Component002_129", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component002_129 handling telemetry fan-out";
  }

  public Component002_130 handoff(Component002_130 neighbor) {
    return neighbor;
  }
}
