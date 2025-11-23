package com.largeproj.pkg013;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component013_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component013_123 extends BaseComponent {

  public Component013_123(int id) {
    super(id, "com.largeproj.pkg013");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|013-" + "123";
    ctx.record("com.largeproj.pkg013.Component013_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component013_123 handling telemetry fan-out";
  }

  public Component013_124 handoff(Component013_124 neighbor) {
    return neighbor;
  }
}
