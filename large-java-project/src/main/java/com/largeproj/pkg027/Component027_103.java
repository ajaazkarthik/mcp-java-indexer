package com.largeproj.pkg027;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component027_103 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component027_103 extends BaseComponent {

  public Component027_103(int id) {
    super(id, "com.largeproj.pkg027");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|027-" + "103";
    ctx.record("com.largeproj.pkg027.Component027_103", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component027_103 handling telemetry fan-out";
  }

  public Component027_104 handoff(Component027_104 neighbor) {
    return neighbor;
  }
}
