package com.largeproj.pkg007;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component007_003 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component007_003 extends BaseComponent {

  public Component007_003(int id) {
    super(id, "com.largeproj.pkg007");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|007-" + "003";
    ctx.record("com.largeproj.pkg007.Component007_003", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component007_003 handling telemetry fan-out";
  }

  public Component007_004 handoff(Component007_004 neighbor) {
    return neighbor;
  }
}
