package com.largeproj.pkg008;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component008_124 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component008_124 extends BaseComponent {

  public Component008_124(int id) {
    super(id, "com.largeproj.pkg008");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|008-" + "124";
    ctx.record("com.largeproj.pkg008.Component008_124", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component008_124 handling telemetry fan-out";
  }

  public Component008_125 handoff(Component008_125 neighbor) {
    return neighbor;
  }
}
