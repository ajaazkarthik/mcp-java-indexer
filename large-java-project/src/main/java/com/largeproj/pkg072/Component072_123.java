package com.largeproj.pkg072;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component072_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component072_123 extends BaseComponent {

  public Component072_123(int id) {
    super(id, "com.largeproj.pkg072");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|072-" + "123";
    ctx.record("com.largeproj.pkg072.Component072_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component072_123 handling telemetry fan-out";
  }

  public Component072_124 handoff(Component072_124 neighbor) {
    return neighbor;
  }
}
