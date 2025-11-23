package com.largeproj.pkg008;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component008_020 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component008_020 extends BaseComponent {

  public Component008_020(int id) {
    super(id, "com.largeproj.pkg008");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|008-" + "020";
    ctx.record("com.largeproj.pkg008.Component008_020", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component008_020 handling telemetry fan-out";
  }

  public Component008_021 handoff(Component008_021 neighbor) {
    return neighbor;
  }
}
