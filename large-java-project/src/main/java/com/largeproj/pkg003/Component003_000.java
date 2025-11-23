package com.largeproj.pkg003;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component003_000 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component003_000 extends BaseComponent {

  public Component003_000(int id) {
    super(id, "com.largeproj.pkg003");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|003-" + "000";
    ctx.record("com.largeproj.pkg003.Component003_000", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component003_000 handling telemetry fan-out";
  }

  public Component003_001 handoff(Component003_001 neighbor) {
    return neighbor;
  }
}
