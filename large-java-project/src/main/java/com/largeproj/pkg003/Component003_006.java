package com.largeproj.pkg003;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component003_006 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component003_006 extends BaseComponent {

  public Component003_006(int id) {
    super(id, "com.largeproj.pkg003");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|003-" + "006";
    ctx.record("com.largeproj.pkg003.Component003_006", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component003_006 handling telemetry fan-out";
  }

  public Component003_007 handoff(Component003_007 neighbor) {
    return neighbor;
  }
}
