package com.largeproj.pkg022;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component022_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component022_017 extends BaseComponent {

  public Component022_017(int id) {
    super(id, "com.largeproj.pkg022");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|022-" + "017";
    ctx.record("com.largeproj.pkg022.Component022_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component022_017 handling telemetry fan-out";
  }

  public Component022_018 handoff(Component022_018 neighbor) {
    return neighbor;
  }
}
