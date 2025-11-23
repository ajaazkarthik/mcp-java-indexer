package com.largeproj.pkg014;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component014_003 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component014_003 extends BaseComponent {

  public Component014_003(int id) {
    super(id, "com.largeproj.pkg014");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|014-" + "003";
    ctx.record("com.largeproj.pkg014.Component014_003", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component014_003 handling telemetry fan-out";
  }

  public Component014_004 handoff(Component014_004 neighbor) {
    return neighbor;
  }
}
