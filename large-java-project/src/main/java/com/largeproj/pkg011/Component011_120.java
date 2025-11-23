package com.largeproj.pkg011;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component011_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component011_120 extends BaseComponent {

  public Component011_120(int id) {
    super(id, "com.largeproj.pkg011");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|011-" + "120";
    ctx.record("com.largeproj.pkg011.Component011_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component011_120 handling telemetry fan-out";
  }

  public Component011_121 handoff(Component011_121 neighbor) {
    return neighbor;
  }
}
