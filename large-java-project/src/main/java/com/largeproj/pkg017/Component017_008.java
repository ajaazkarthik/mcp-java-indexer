package com.largeproj.pkg017;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component017_008 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component017_008 extends BaseComponent {

  public Component017_008(int id) {
    super(id, "com.largeproj.pkg017");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|017-" + "008";
    ctx.record("com.largeproj.pkg017.Component017_008", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component017_008 handling telemetry fan-out";
  }

  public Component017_009 handoff(Component017_009 neighbor) {
    return neighbor;
  }
}
