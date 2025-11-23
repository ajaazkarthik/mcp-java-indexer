package com.largeproj.pkg018;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component018_120 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component018_120 extends BaseComponent {

  public Component018_120(int id) {
    super(id, "com.largeproj.pkg018");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|018-" + "120";
    ctx.record("com.largeproj.pkg018.Component018_120", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component018_120 handling telemetry fan-out";
  }

  public Component018_121 handoff(Component018_121 neighbor) {
    return neighbor;
  }
}
