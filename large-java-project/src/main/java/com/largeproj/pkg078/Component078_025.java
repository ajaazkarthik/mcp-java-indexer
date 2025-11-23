package com.largeproj.pkg078;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component078_025 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component078_025 extends BaseComponent {

  public Component078_025(int id) {
    super(id, "com.largeproj.pkg078");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|078-" + "025";
    ctx.record("com.largeproj.pkg078.Component078_025", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component078_025 handling telemetry fan-out";
  }

  public Component078_026 handoff(Component078_026 neighbor) {
    return neighbor;
  }
}
