package com.largeproj.pkg020;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component020_121 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component020_121 extends BaseComponent {

  public Component020_121(int id) {
    super(id, "com.largeproj.pkg020");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|020-" + "121";
    ctx.record("com.largeproj.pkg020.Component020_121", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component020_121 handling telemetry fan-out";
  }

  public Component020_122 handoff(Component020_122 neighbor) {
    return neighbor;
  }
}
