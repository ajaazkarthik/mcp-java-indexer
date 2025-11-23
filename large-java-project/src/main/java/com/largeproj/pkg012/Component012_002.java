package com.largeproj.pkg012;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component012_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component012_002 extends BaseComponent {

  public Component012_002(int id) {
    super(id, "com.largeproj.pkg012");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|012-" + "002";
    ctx.record("com.largeproj.pkg012.Component012_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component012_002 handling telemetry fan-out";
  }

  public Component012_003 handoff(Component012_003 neighbor) {
    return neighbor;
  }
}
