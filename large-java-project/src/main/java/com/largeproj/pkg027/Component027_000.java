package com.largeproj.pkg027;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component027_000 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component027_000 extends BaseComponent {

  public Component027_000(int id) {
    super(id, "com.largeproj.pkg027");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|027-" + "000";
    ctx.record("com.largeproj.pkg027.Component027_000", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component027_000 handling telemetry fan-out";
  }

  public Component027_001 handoff(Component027_001 neighbor) {
    return neighbor;
  }
}
