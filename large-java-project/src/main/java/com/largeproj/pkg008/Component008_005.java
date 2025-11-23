package com.largeproj.pkg008;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component008_005 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component008_005 extends BaseComponent {

  public Component008_005(int id) {
    super(id, "com.largeproj.pkg008");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|008-" + "005";
    ctx.record("com.largeproj.pkg008.Component008_005", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component008_005 handling telemetry fan-out";
  }

  public Component008_006 handoff(Component008_006 neighbor) {
    return neighbor;
  }
}
