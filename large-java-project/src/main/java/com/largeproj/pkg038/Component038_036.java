package com.largeproj.pkg038;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component038_036 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component038_036 extends BaseComponent {

  public Component038_036(int id) {
    super(id, "com.largeproj.pkg038");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|038-" + "036";
    ctx.record("com.largeproj.pkg038.Component038_036", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component038_036 handling telemetry fan-out";
  }

  public Component038_037 handoff(Component038_037 neighbor) {
    return neighbor;
  }
}
