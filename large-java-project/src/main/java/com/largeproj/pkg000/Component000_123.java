package com.largeproj.pkg000;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component000_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component000_123 extends BaseComponent {

  public Component000_123(int id) {
    super(id, "com.largeproj.pkg000");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|000-" + "123";
    ctx.record("com.largeproj.pkg000.Component000_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component000_123 handling telemetry fan-out";
  }

  public Component000_124 handoff(Component000_124 neighbor) {
    return neighbor;
  }
}
