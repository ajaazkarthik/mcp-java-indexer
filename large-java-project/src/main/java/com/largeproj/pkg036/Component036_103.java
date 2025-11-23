package com.largeproj.pkg036;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component036_103 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component036_103 extends BaseComponent {

  public Component036_103(int id) {
    super(id, "com.largeproj.pkg036");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|036-" + "103";
    ctx.record("com.largeproj.pkg036.Component036_103", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component036_103 handling telemetry fan-out";
  }

  public Component036_104 handoff(Component036_104 neighbor) {
    return neighbor;
  }
}
