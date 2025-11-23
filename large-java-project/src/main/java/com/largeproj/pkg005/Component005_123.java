package com.largeproj.pkg005;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component005_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component005_123 extends BaseComponent {

  public Component005_123(int id) {
    super(id, "com.largeproj.pkg005");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|005-" + "123";
    ctx.record("com.largeproj.pkg005.Component005_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component005_123 handling telemetry fan-out";
  }

  public Component005_124 handoff(Component005_124 neighbor) {
    return neighbor;
  }
}
