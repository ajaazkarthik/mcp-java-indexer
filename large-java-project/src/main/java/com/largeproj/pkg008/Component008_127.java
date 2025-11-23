package com.largeproj.pkg008;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component008_127 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component008_127 extends BaseComponent {

  public Component008_127(int id) {
    super(id, "com.largeproj.pkg008");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|008-" + "127";
    ctx.record("com.largeproj.pkg008.Component008_127", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component008_127 handling telemetry fan-out";
  }

  public Component008_128 handoff(Component008_128 neighbor) {
    return neighbor;
  }
}
