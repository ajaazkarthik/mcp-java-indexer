package com.largeproj.pkg004;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component004_020 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component004_020 extends BaseComponent {

  public Component004_020(int id) {
    super(id, "com.largeproj.pkg004");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|004-" + "020";
    ctx.record("com.largeproj.pkg004.Component004_020", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component004_020 handling telemetry fan-out";
  }

  public Component004_021 handoff(Component004_021 neighbor) {
    return neighbor;
  }
}
