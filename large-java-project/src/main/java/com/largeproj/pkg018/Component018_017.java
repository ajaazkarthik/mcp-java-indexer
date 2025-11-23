package com.largeproj.pkg018;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component018_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component018_017 extends BaseComponent {

  public Component018_017(int id) {
    super(id, "com.largeproj.pkg018");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|018-" + "017";
    ctx.record("com.largeproj.pkg018.Component018_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component018_017 handling telemetry fan-out";
  }

  public Component018_018 handoff(Component018_018 neighbor) {
    return neighbor;
  }
}
