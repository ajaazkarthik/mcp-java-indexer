package com.largeproj.pkg011;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component011_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component011_123 extends BaseComponent {

  public Component011_123(int id) {
    super(id, "com.largeproj.pkg011");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|011-" + "123";
    ctx.record("com.largeproj.pkg011.Component011_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component011_123 handling telemetry fan-out";
  }

  public Component011_124 handoff(Component011_124 neighbor) {
    return neighbor;
  }
}
