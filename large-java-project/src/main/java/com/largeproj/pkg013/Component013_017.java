package com.largeproj.pkg013;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component013_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component013_017 extends BaseComponent {

  public Component013_017(int id) {
    super(id, "com.largeproj.pkg013");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|013-" + "017";
    ctx.record("com.largeproj.pkg013.Component013_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component013_017 handling telemetry fan-out";
  }

  public Component013_018 handoff(Component013_018 neighbor) {
    return neighbor;
  }
}
