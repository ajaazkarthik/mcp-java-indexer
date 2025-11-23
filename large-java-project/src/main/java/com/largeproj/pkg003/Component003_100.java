package com.largeproj.pkg003;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component003_100 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component003_100 extends BaseComponent {

  public Component003_100(int id) {
    super(id, "com.largeproj.pkg003");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|003-" + "100";
    ctx.record("com.largeproj.pkg003.Component003_100", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component003_100 handling telemetry fan-out";
  }

  public Component003_101 handoff(Component003_101 neighbor) {
    return neighbor;
  }
}
