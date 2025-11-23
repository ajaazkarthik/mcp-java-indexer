package com.largeproj.pkg067;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component067_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component067_123 extends BaseComponent {

  public Component067_123(int id) {
    super(id, "com.largeproj.pkg067");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|067-" + "123";
    ctx.record("com.largeproj.pkg067.Component067_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component067_123 handling telemetry fan-out";
  }

  public Component067_124 handoff(Component067_124 neighbor) {
    return neighbor;
  }
}
