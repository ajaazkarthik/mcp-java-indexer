package com.largeproj.pkg024;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component024_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component024_120 extends BaseComponent {

  public Component024_120(int id) {
    super(id, "com.largeproj.pkg024");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|024-" + "120";
    ctx.record("com.largeproj.pkg024.Component024_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component024_120 handling telemetry fan-out";
  }

  public Component024_121 handoff(Component024_121 neighbor) {
    return neighbor;
  }
}
