package com.largeproj.pkg013;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component013_107 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component013_107 extends BaseComponent {

  public Component013_107(int id) {
    super(id, "com.largeproj.pkg013");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|013-" + "107";
    ctx.record("com.largeproj.pkg013.Component013_107", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component013_107 handling telemetry fan-out";
  }

  public Component013_108 handoff(Component013_108 neighbor) {
    return neighbor;
  }
}
