package com.largeproj.pkg003;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component003_003 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component003_003 extends BaseComponent {

  public Component003_003(int id) {
    super(id, "com.largeproj.pkg003");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|003-" + "003";
    ctx.record("com.largeproj.pkg003.Component003_003", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component003_003 handling telemetry fan-out";
  }

  public Component003_004 handoff(Component003_004 neighbor) {
    return neighbor;
  }
}
