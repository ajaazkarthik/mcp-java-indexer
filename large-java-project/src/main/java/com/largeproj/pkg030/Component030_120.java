package com.largeproj.pkg030;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component030_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component030_120 extends BaseComponent {

  public Component030_120(int id) {
    super(id, "com.largeproj.pkg030");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|030-" + "120";
    ctx.record("com.largeproj.pkg030.Component030_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component030_120 handling telemetry fan-out";
  }

  public Component030_121 handoff(Component030_121 neighbor) {
    return neighbor;
  }
}
