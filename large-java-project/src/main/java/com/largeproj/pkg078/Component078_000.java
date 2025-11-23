package com.largeproj.pkg078;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component078_000 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component078_000 extends BaseComponent {

  public Component078_000(int id) {
    super(id, "com.largeproj.pkg078");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|078-" + "000";
    ctx.record("com.largeproj.pkg078.Component078_000", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component078_000 handling telemetry fan-out";
  }

  public Component078_001 handoff(Component078_001 neighbor) {
    return neighbor;
  }
}
