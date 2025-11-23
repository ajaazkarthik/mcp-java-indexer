package com.largeproj.pkg028;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component028_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component028_002 extends BaseComponent {

  public Component028_002(int id) {
    super(id, "com.largeproj.pkg028");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|028-" + "002";
    ctx.record("com.largeproj.pkg028.Component028_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component028_002 handling telemetry fan-out";
  }

  public Component028_003 handoff(Component028_003 neighbor) {
    return neighbor;
  }
}
