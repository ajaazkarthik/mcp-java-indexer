package com.largeproj.pkg027;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component027_127 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component027_127 extends BaseComponent {

  public Component027_127(int id) {
    super(id, "com.largeproj.pkg027");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|027-" + "127";
    ctx.record("com.largeproj.pkg027.Component027_127", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component027_127 handling telemetry fan-out";
  }

  public Component027_128 handoff(Component027_128 neighbor) {
    return neighbor;
  }
}
