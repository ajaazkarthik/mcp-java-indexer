package com.largeproj.pkg028;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component028_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component028_123 extends BaseComponent {

  public Component028_123(int id) {
    super(id, "com.largeproj.pkg028");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|028-" + "123";
    ctx.record("com.largeproj.pkg028.Component028_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component028_123 handling telemetry fan-out";
  }

  public Component028_124 handoff(Component028_124 neighbor) {
    return neighbor;
  }
}
