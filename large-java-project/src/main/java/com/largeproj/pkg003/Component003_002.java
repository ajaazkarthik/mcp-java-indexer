package com.largeproj.pkg003;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component003_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component003_002 extends BaseComponent {

  public Component003_002(int id) {
    super(id, "com.largeproj.pkg003");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|003-" + "002";
    ctx.record("com.largeproj.pkg003.Component003_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component003_002 handling telemetry fan-out";
  }

  public Component003_003 handoff(Component003_003 neighbor) {
    return neighbor;
  }
}
