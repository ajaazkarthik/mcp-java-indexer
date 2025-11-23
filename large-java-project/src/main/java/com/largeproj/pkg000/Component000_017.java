package com.largeproj.pkg000;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component000_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component000_017 extends BaseComponent {

  public Component000_017(int id) {
    super(id, "com.largeproj.pkg000");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|000-" + "017";
    ctx.record("com.largeproj.pkg000.Component000_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component000_017 handling telemetry fan-out";
  }

  public Component000_018 handoff(Component000_018 neighbor) {
    return neighbor;
  }
}
