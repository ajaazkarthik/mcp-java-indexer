package com.largeproj.pkg012;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component012_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component012_123 extends BaseComponent {

  public Component012_123(int id) {
    super(id, "com.largeproj.pkg012");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|012-" + "123";
    ctx.record("com.largeproj.pkg012.Component012_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component012_123 handling telemetry fan-out";
  }

  public Component012_124 handoff(Component012_124 neighbor) {
    return neighbor;
  }
}
