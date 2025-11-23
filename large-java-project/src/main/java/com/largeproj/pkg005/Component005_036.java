package com.largeproj.pkg005;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component005_036 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component005_036 extends BaseComponent {

  public Component005_036(int id) {
    super(id, "com.largeproj.pkg005");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|005-" + "036";
    ctx.record("com.largeproj.pkg005.Component005_036", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component005_036 handling telemetry fan-out";
  }

  public Component005_037 handoff(Component005_037 neighbor) {
    return neighbor;
  }
}
