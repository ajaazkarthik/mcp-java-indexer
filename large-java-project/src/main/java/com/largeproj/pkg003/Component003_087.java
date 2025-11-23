package com.largeproj.pkg003;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component003_087 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component003_087 extends BaseComponent {

  public Component003_087(int id) {
    super(id, "com.largeproj.pkg003");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|003-" + "087";
    ctx.record("com.largeproj.pkg003.Component003_087", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component003_087 handling telemetry fan-out";
  }

  public Component003_088 handoff(Component003_088 neighbor) {
    return neighbor;
  }
}
