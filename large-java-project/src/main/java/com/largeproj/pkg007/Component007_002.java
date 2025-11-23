package com.largeproj.pkg007;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component007_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component007_002 extends BaseComponent {

  public Component007_002(int id) {
    super(id, "com.largeproj.pkg007");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|007-" + "002";
    ctx.record("com.largeproj.pkg007.Component007_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component007_002 handling telemetry fan-out";
  }

  public Component007_003 handoff(Component007_003 neighbor) {
    return neighbor;
  }
}
