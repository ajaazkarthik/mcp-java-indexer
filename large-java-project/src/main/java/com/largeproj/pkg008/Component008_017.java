package com.largeproj.pkg008;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component008_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component008_017 extends BaseComponent {

  public Component008_017(int id) {
    super(id, "com.largeproj.pkg008");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|008-" + "017";
    ctx.record("com.largeproj.pkg008.Component008_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component008_017 handling telemetry fan-out";
  }

  public Component008_018 handoff(Component008_018 neighbor) {
    return neighbor;
  }
}
