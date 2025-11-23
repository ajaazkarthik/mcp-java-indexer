package com.largeproj.pkg002;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component002_005 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component002_005 extends BaseComponent {

  public Component002_005(int id) {
    super(id, "com.largeproj.pkg002");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|002-" + "005";
    ctx.record("com.largeproj.pkg002.Component002_005", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component002_005 handling telemetry fan-out";
  }

  public Component002_006 handoff(Component002_006 neighbor) {
    return neighbor;
  }
}
