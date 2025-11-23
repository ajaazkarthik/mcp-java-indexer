package com.largeproj.pkg015;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component015_102 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component015_102 extends BaseComponent {

  public Component015_102(int id) {
    super(id, "com.largeproj.pkg015");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|015-" + "102";
    ctx.record("com.largeproj.pkg015.Component015_102", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component015_102 handling telemetry fan-out";
  }

  public Component015_103 handoff(Component015_103 neighbor) {
    return neighbor;
  }
}
