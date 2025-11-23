package com.largeproj.pkg078;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component078_003 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component078_003 extends BaseComponent {

  public Component078_003(int id) {
    super(id, "com.largeproj.pkg078");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|078-" + "003";
    ctx.record("com.largeproj.pkg078.Component078_003", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component078_003 handling telemetry fan-out";
  }

  public Component078_004 handoff(Component078_004 neighbor) {
    return neighbor;
  }
}
