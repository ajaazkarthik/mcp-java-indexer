package com.largeproj.pkg015;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component015_124 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component015_124 extends BaseComponent {

  public Component015_124(int id) {
    super(id, "com.largeproj.pkg015");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|015-" + "124";
    ctx.record("com.largeproj.pkg015.Component015_124", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component015_124 handling telemetry fan-out";
  }

  public Component015_125 handoff(Component015_125 neighbor) {
    return neighbor;
  }
}
