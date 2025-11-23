package com.largeproj.pkg018;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component018_000 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component018_000 extends BaseComponent {

  public Component018_000(int id) {
    super(id, "com.largeproj.pkg018");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|018-" + "000";
    ctx.record("com.largeproj.pkg018.Component018_000", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component018_000 handling telemetry fan-out";
  }

  public Component018_001 handoff(Component018_001 neighbor) {
    return neighbor;
  }
}
