package com.largeproj.pkg035;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component035_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component035_123 extends BaseComponent {

  public Component035_123(int id) {
    super(id, "com.largeproj.pkg035");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|035-" + "123";
    ctx.record("com.largeproj.pkg035.Component035_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component035_123 handling telemetry fan-out";
  }

  public Component035_124 handoff(Component035_124 neighbor) {
    return neighbor;
  }
}
