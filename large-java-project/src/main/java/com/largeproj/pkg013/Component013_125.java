package com.largeproj.pkg013;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component013_125 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component013_125 extends BaseComponent {

  public Component013_125(int id) {
    super(id, "com.largeproj.pkg013");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|013-" + "125";
    ctx.record("com.largeproj.pkg013.Component013_125", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component013_125 handling telemetry fan-out";
  }

  public Component013_126 handoff(Component013_126 neighbor) {
    return neighbor;
  }
}
