package com.largeproj.pkg072;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component072_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component072_017 extends BaseComponent {

  public Component072_017(int id) {
    super(id, "com.largeproj.pkg072");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|072-" + "017";
    ctx.record("com.largeproj.pkg072.Component072_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component072_017 handling telemetry fan-out";
  }

  public Component072_018 handoff(Component072_018 neighbor) {
    return neighbor;
  }
}
