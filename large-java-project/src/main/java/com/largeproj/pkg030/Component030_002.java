package com.largeproj.pkg030;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component030_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component030_002 extends BaseComponent {

  public Component030_002(int id) {
    super(id, "com.largeproj.pkg030");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|030-" + "002";
    ctx.record("com.largeproj.pkg030.Component030_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component030_002 handling telemetry fan-out";
  }

  public Component030_003 handoff(Component030_003 neighbor) {
    return neighbor;
  }
}
