package com.largeproj.pkg017;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component017_126 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component017_126 extends BaseComponent {

  public Component017_126(int id) {
    super(id, "com.largeproj.pkg017");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|017-" + "126";
    ctx.record("com.largeproj.pkg017.Component017_126", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component017_126 handling telemetry fan-out";
  }

  public Component017_127 handoff(Component017_127 neighbor) {
    return neighbor;
  }
}
