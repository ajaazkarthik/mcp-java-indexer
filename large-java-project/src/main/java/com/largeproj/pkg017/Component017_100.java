package com.largeproj.pkg017;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component017_100 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component017_100 extends BaseComponent {

  public Component017_100(int id) {
    super(id, "com.largeproj.pkg017");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|017-" + "100";
    ctx.record("com.largeproj.pkg017.Component017_100", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component017_100 handling telemetry fan-out";
  }

  public Component017_101 handoff(Component017_101 neighbor) {
    return neighbor;
  }
}
