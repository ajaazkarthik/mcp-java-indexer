package com.largeproj.pkg012;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component012_100 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component012_100 extends BaseComponent {

  public Component012_100(int id) {
    super(id, "com.largeproj.pkg012");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|012-" + "100";
    ctx.record("com.largeproj.pkg012.Component012_100", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component012_100 handling telemetry fan-out";
  }

  public Component012_101 handoff(Component012_101 neighbor) {
    return neighbor;
  }
}
