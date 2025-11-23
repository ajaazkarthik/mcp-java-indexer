package com.largeproj.pkg000;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component000_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component000_002 extends BaseComponent {

  public Component000_002(int id) {
    super(id, "com.largeproj.pkg000");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|000-" + "002";
    ctx.record("com.largeproj.pkg000.Component000_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component000_002 handling telemetry fan-out";
  }

  public Component000_003 handoff(Component000_003 neighbor) {
    return neighbor;
  }
}
