package com.largeproj.pkg071;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component071_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component071_120 extends BaseComponent {

  public Component071_120(int id) {
    super(id, "com.largeproj.pkg071");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|071-" + "120";
    ctx.record("com.largeproj.pkg071.Component071_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component071_120 handling telemetry fan-out";
  }

  public Component071_121 handoff(Component071_121 neighbor) {
    return neighbor;
  }
}
