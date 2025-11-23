package com.largeproj.pkg050;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component050_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component050_002 extends BaseComponent {

  public Component050_002(int id) {
    super(id, "com.largeproj.pkg050");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|050-" + "002";
    ctx.record("com.largeproj.pkg050.Component050_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component050_002 handling telemetry fan-out";
  }

  public Component050_003 handoff(Component050_003 neighbor) {
    return neighbor;
  }
}
