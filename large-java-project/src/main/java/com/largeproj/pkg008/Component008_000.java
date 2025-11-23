package com.largeproj.pkg008;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component008_000 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component008_000 extends BaseComponent {

  public Component008_000(int id) {
    super(id, "com.largeproj.pkg008");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|008-" + "000";
    ctx.record("com.largeproj.pkg008.Component008_000", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component008_000 handling telemetry fan-out";
  }

  public Component008_001 handoff(Component008_001 neighbor) {
    return neighbor;
  }
}
