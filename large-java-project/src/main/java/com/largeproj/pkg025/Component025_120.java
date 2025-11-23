package com.largeproj.pkg025;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component025_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component025_120 extends BaseComponent {

  public Component025_120(int id) {
    super(id, "com.largeproj.pkg025");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|025-" + "120";
    ctx.record("com.largeproj.pkg025.Component025_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component025_120 handling telemetry fan-out";
  }

  public Component025_121 handoff(Component025_121 neighbor) {
    return neighbor;
  }
}
