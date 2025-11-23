package com.largeproj.pkg003;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component003_121 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component003_121 extends BaseComponent {

  public Component003_121(int id) {
    super(id, "com.largeproj.pkg003");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|003-" + "121";
    ctx.record("com.largeproj.pkg003.Component003_121", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component003_121 handling telemetry fan-out";
  }

  public Component003_122 handoff(Component003_122 neighbor) {
    return neighbor;
  }
}
