package com.largeproj.pkg078;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component078_125 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component078_125 extends BaseComponent {

  public Component078_125(int id) {
    super(id, "com.largeproj.pkg078");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|078-" + "125";
    ctx.record("com.largeproj.pkg078.Component078_125", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component078_125 handling telemetry fan-out";
  }

  public Component078_126 handoff(Component078_126 neighbor) {
    return neighbor;
  }
}
