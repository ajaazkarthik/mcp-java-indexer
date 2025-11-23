package com.largeproj.pkg014;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component014_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component014_002 extends BaseComponent {

  public Component014_002(int id) {
    super(id, "com.largeproj.pkg014");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|014-" + "002";
    ctx.record("com.largeproj.pkg014.Component014_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component014_002 handling telemetry fan-out";
  }

  public Component014_003 handoff(Component014_003 neighbor) {
    return neighbor;
  }
}
