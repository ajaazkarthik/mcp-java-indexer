package com.largeproj.pkg003;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component003_026 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component003_026 extends BaseComponent {

  public Component003_026(int id) {
    super(id, "com.largeproj.pkg003");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|003-" + "026";
    ctx.record("com.largeproj.pkg003.Component003_026", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component003_026 handling telemetry fan-out";
  }

  public Component003_027 handoff(Component003_027 neighbor) {
    return neighbor;
  }
}
