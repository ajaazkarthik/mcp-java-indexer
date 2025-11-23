package com.largeproj.pkg027;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component027_101 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component027_101 extends BaseComponent {

  public Component027_101(int id) {
    super(id, "com.largeproj.pkg027");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|027-" + "101";
    ctx.record("com.largeproj.pkg027.Component027_101", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component027_101 handling telemetry fan-out";
  }

  public Component027_102 handoff(Component027_102 neighbor) {
    return neighbor;
  }
}
