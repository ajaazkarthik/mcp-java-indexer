package com.largeproj.pkg014;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component014_013 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component014_013 extends BaseComponent {

  public Component014_013(int id) {
    super(id, "com.largeproj.pkg014");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|014-" + "013";
    ctx.record("com.largeproj.pkg014.Component014_013", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component014_013 handling telemetry fan-out";
  }

  public Component014_014 handoff(Component014_014 neighbor) {
    return neighbor;
  }
}
