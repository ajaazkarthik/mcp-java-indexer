package com.largeproj.pkg002;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component002_104 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component002_104 extends BaseComponent {

  public Component002_104(int id) {
    super(id, "com.largeproj.pkg002");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|002-" + "104";
    ctx.record("com.largeproj.pkg002.Component002_104", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component002_104 handling telemetry fan-out";
  }

  public Component002_105 handoff(Component002_105 neighbor) {
    return neighbor;
  }
}
