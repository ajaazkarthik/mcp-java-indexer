package com.largeproj.pkg024;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component024_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component024_123 extends BaseComponent {

  public Component024_123(int id) {
    super(id, "com.largeproj.pkg024");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|024-" + "123";
    ctx.record("com.largeproj.pkg024.Component024_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component024_123 handling telemetry fan-out";
  }

  public Component024_124 handoff(Component024_124 neighbor) {
    return neighbor;
  }
}
