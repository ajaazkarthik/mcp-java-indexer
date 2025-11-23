package com.largeproj.pkg002;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component002_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component002_123 extends BaseComponent {

  public Component002_123(int id) {
    super(id, "com.largeproj.pkg002");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|002-" + "123";
    ctx.record("com.largeproj.pkg002.Component002_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component002_123 handling telemetry fan-out";
  }

  public Component002_124 handoff(Component002_124 neighbor) {
    return neighbor;
  }
}
